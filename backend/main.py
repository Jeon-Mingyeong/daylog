from __future__ import annotations

import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DAYLOG_DATA_DIR", str(BASE_DIR)))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = DATA_DIR / "daylog.db"
MODEL_PATH = DATA_DIR / "impulse_model.joblib"

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    yield


app = FastAPI(title="Daylog ML API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://jeon-mingyeong.github.io",
        *[
            origin.strip()
            for origin in os.getenv("DAYLOG_CORS_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_database() -> None:
    with database() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                food TEXT NOT NULL,
                sleep_time TEXT NOT NULL,
                wake_time TEXT NOT NULL,
                mood TEXT NOT NULL,
                health INTEGER NOT NULL,
                category TEXT,
                amount REAL NOT NULL DEFAULT 0,
                necessary INTEGER,
                purpose TEXT
            )
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(entries)").fetchall()}
        if "user_id" not in columns:
            connection.execute("ALTER TABLE entries ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default-user'")
        if "note" not in columns:
            connection.execute("ALTER TABLE entries ADD COLUMN note TEXT NOT NULL DEFAULT ''")
        if "notion_page_id" not in columns:
            connection.execute("ALTER TABLE entries ADD COLUMN notion_page_id TEXT")
        connection.commit()


class Entry(BaseModel):
    id: str
    date: str
    food: str
    sleep_time: str = Field(alias="sleepTime")
    wake_time: str = Field(alias="wakeTime")
    mood: str
    health: int = Field(ge=1, le=10)
    category: str | None = None
    amount: float = Field(default=0, ge=0)
    necessary: bool | None = None
    purpose: str | None = None
    note: str = ""
    user_id: str = Field(default="default-user", alias="userId")

    model_config = {"populate_by_name": True}


class PredictionInput(BaseModel):
    mood: Literal["아주 좋음", "좋음", "보통", "불안함", "나쁨"]
    health: int = Field(ge=1, le=10)
    sleep_hours: float = Field(ge=0, le=24)
    category: str
    amount: float = Field(ge=0)


def sleep_hours(sleep_time: str, wake_time: str) -> float:
    sleep_hour, sleep_minute = map(int, sleep_time.split(":"))
    wake_hour, wake_minute = map(int, wake_time.split(":"))
    minutes = wake_hour * 60 + wake_minute - (sleep_hour * 60 + sleep_minute)
    if minutes < 0:
        minutes += 24 * 60
    return minutes / 60


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model_available": MODEL_PATH.exists()}


@app.post("/api/entries")
def save_entry(entry: Entry, x_user_id: str | None = Header(default=None, alias="X-User-ID")) -> dict:
    user_id = x_user_id or entry.user_id
    necessary = None if entry.necessary is None else int(entry.necessary)
    with database() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO entries
            (id, date, food, sleep_time, wake_time, mood, health, category, amount, necessary, purpose, note, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.id,
                entry.date,
                entry.food,
                entry.sleep_time,
                entry.wake_time,
                entry.mood,
                entry.health,
                entry.category,
                entry.amount,
                necessary,
                entry.purpose,
                entry.note,
                user_id,
            ),
        )
        connection.commit()
    return {"saved": True}


@app.get("/api/entries")
def list_entries(x_user_id: str | None = Header(default=None, alias="X-User-ID")) -> list[dict]:
    user_id = x_user_id or "default-user"
    with database() as connection:
        rows = connection.execute(
            "SELECT * FROM entries WHERE user_id = ? ORDER BY date DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def notion_client(token: str | None = None, database_id: str | None = None) -> tuple[str, str, dict[str, str]]:
    resolved_token = token or os.getenv("NOTION_TOKEN")
    resolved_database_id = database_id or os.getenv("NOTION_DATABASE_ID")
    if not resolved_token or not resolved_database_id:
        raise HTTPException(
            status_code=503,
            detail="NOTION_TOKEN과 NOTION_DATABASE_ID 환경변수를 설정해야 합니다.",
        )
    headers = {
        "Authorization": f"Bearer {resolved_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    return resolved_token, resolved_database_id, headers


def rich_text(value: str | None) -> list[dict]:
    return [{"text": {"content": value or ""}}]


def notion_properties(entry: sqlite3.Row) -> dict:
    return {
        "이름": {"title": rich_text(entry["food"] or entry["id"])},
        "날짜": {"date": {"start": entry["date"]}},
        "음식": {"rich_text": rich_text(entry["food"])},
        "취침": {"rich_text": rich_text(entry["sleep_time"])},
        "기상": {"rich_text": rich_text(entry["wake_time"])},
        "기분": {"select": {"name": entry["mood"]}},
        "건강": {"number": entry["health"]},
        "카테고리": {"select": {"name": entry["category"] or "기타"}},
        "금액": {"number": entry["amount"]},
        "필요한 소비": {
            "checkbox": entry["necessary"] == 1 if entry["necessary"] is not None else False
        },
        "구매 목적": {"rich_text": rich_text(entry["purpose"])},
        "메모": {"rich_text": rich_text(entry["note"])},
    }


class NotionConfig(BaseModel):
    token: str | None = None
    database_id: str | None = None


@app.post("/api/notion/import")
def import_notion_entries(
    config: NotionConfig,
    x_user_id: str | None = Header(default=None, alias="X-User-ID"),
) -> dict:
    user_id = x_user_id or "default-user"
    _, database_id, headers = notion_client(config.token, config.database_id)
    imported = 0

    with httpx.Client(timeout=30.0) as client:
        has_more = True
        cursor: str | None = None
        while has_more:
            payload = {"page_size": 100}
            if cursor:
                payload["start_cursor"] = cursor
            response = client.post(
                f"https://api.notion.com/v1/databases/{database_id}/query",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            for page in data.get("results", []):
                properties = page.get("properties", {})

                def text(name: str) -> str:
                    prop = properties.get(name, {})
                    if prop.get("title"):
                        return "".join(item.get("plain_text", "") for item in prop["title"])
                    if prop.get("rich_text"):
                        return "".join(item.get("plain_text", "") for item in prop["rich_text"])
                    return ""

                def date_value(name: str) -> str:
                    value = properties.get(name, {}).get("date")
                    if not value:
                        return datetime.now().date().isoformat()
                    return str(value.get("start", ""))[:10]

                def select_value(name: str, fallback: str = "기타") -> str:
                    value = properties.get(name, {}).get("select")
                    return value.get("name", fallback) if value else fallback

                entry_id = f"notion-{page['id'].replace('-', '')}"
                food = text("음식") or text("이름") or "노션 기록"
                sleep_time = text("취침") or "23:00"
                wake_time = text("기상") or "07:00"
                mood = select_value("기분", "보통")
                health_value = properties.get("건강", {}).get("number")
                health = int(health_value) if health_value is not None else 7
                category = select_value("카테고리", "기타")
                amount_value = properties.get("금액", {}).get("number")
                amount = float(amount_value) if amount_value is not None else 0
                necessary_value = properties.get("필요한 소비", {}).get("checkbox")
                necessary = None if necessary_value is None else int(bool(necessary_value))
                purpose = text("구매 목적")
                note = text("메모")
                date = date_value("날짜")

                with database() as connection:
                    connection.execute(
                        """
                        INSERT OR REPLACE INTO entries
                        (id, date, food, sleep_time, wake_time, mood, health, category, amount,
                         necessary, purpose, note, user_id, notion_page_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            entry_id, date, food, sleep_time, wake_time, mood, health, category,
                            amount, necessary, purpose, note, user_id, page["id"],
                        ),
                    )
                    connection.commit()
                imported += 1

            has_more = data.get("has_more", False)
            cursor = data.get("next_cursor")

    return {"imported": imported, "user_id": user_id}


@app.post("/api/notion/export")
def export_notion_entries(
    config: NotionConfig,
    x_user_id: str | None = Header(default=None, alias="X-User-ID"),
) -> dict:
    user_id = x_user_id or "default-user"
    _, database_id, headers = notion_client(config.token, config.database_id)
    exported = 0

    with database() as connection:
        rows = connection.execute(
            "SELECT * FROM entries WHERE user_id = ? ORDER BY date DESC",
            (user_id,),
        ).fetchall()

    with httpx.Client(timeout=30.0) as client:
        for entry in rows:
            payload = {
                "parent": {"database_id": database_id},
                "properties": notion_properties(entry),
            }
            if entry["notion_page_id"]:
                url = f"https://api.notion.com/v1/pages/{entry['notion_page_id']}"
                response = client.patch(url, headers=headers, json={"properties": payload["properties"]})
            else:
                response = client.post(
                    "https://api.notion.com/v1/pages",
                    headers=headers,
                    json=payload,
                )

            if response.status_code not in {200, 201}:
                raise HTTPException(status_code=response.status_code, detail=response.text)

            page_id = response.json()["id"]
            with database() as connection:
                connection.execute(
                    "UPDATE entries SET notion_page_id = ? WHERE id = ? AND user_id = ?",
                    (page_id, entry["id"], user_id),
                )
                connection.commit()
            exported += 1

    return {"exported": exported, "user_id": user_id}


def load_training_rows(user_id: str) -> list[tuple[list[float | str], int]]:
    with database() as connection:
        rows = connection.execute(
            "SELECT mood, health, sleep_time, wake_time, category, amount, necessary "
            "FROM entries WHERE user_id = ? AND necessary IS NOT NULL",
            (user_id,),
        ).fetchall()

    training: list[tuple[list[float | str], int]] = []
    for row in rows:
        training.append(
            (
                [
                    row["mood"],
                    row["health"],
                    sleep_hours(row["sleep_time"], row["wake_time"]),
                    row["category"] or "기타",
                    row["amount"],
                ],
                1 - int(row["necessary"]),
            )
        )
    return training


@app.post("/api/train")
def train_model(x_user_id: str | None = Header(default=None, alias="X-User-ID")) -> dict:
    user_id = x_user_id or "default-user"
    training = load_training_rows(user_id)
    labels = {label for _, label in training}
    if len(training) < 10 or len(labels) < 2:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "충동 구매와 필요한 구매 데이터가 각각 최소 5건씩 필요합니다.",
                "training_rows": len(training),
            },
        )

    features = [[*row] for row, _ in training]
    targets = [target for _, target in training]
    categorical = [0, 3]
    numeric = [1, 2, 4]
    preprocessor = ColumnTransformer(
        [
            ("category", OneHotEncoder(handle_unknown="ignore"), categorical),
            ("numeric", StandardScaler(), numeric),
        ]
    )
    model = Pipeline(
        [
            ("preprocess", preprocessor),
            ("classifier", LogisticRegression(max_iter=1000, random_state=42)),
        ]
    )
    model.fit(features, targets)
    joblib.dump(model, MODEL_PATH)
    accuracy = float(model.score(features, targets))
    return {
        "trained": True,
        "training_rows": len(training),
        "estimated_accuracy": round(accuracy, 3),
    }


@app.post("/api/predict/impulse")
def predict_impulse(values: PredictionInput) -> dict:
    features = [
        [
            values.mood,
            values.health,
            values.sleep_hours,
            values.category,
            values.amount,
        ]
    ]

    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        probability = float(model.predict_proba(features)[0][1])
        source = "personal_model"
    else:
        risk = 0.2
        risk += 0.18 if values.health <= 4 else 0
        risk += 0.16 if values.mood in {"불안함", "나쁨"} else 0
        risk += 0.12 if values.sleep_hours < 6 else 0
        risk += 0.18 if values.amount >= 50000 else min(values.amount / 250000, 0.12)
        risk += 0.10 if values.category == "쇼핑" else 0
        probability = min(risk, 0.95)
        source = "starter_rules"

    if probability >= 0.7:
        level = "높음"
    elif probability >= 0.4:
        level = "주의"
    else:
        level = "낮음"

    return {
        "impulse_probability": round(probability, 3),
        "level": level,
        "source": source,
        "suggestion": (
            "구매 전 24시간을 두고 실제 필요성을 다시 확인하세요."
            if probability >= 0.4
            else "현재 기록 기준으로 충동 구매 위험이 낮습니다."
        ),
    }
