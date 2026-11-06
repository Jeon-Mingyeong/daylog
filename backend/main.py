from __future__ import annotations

import sqlite3
import os
from contextlib import contextmanager
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
from fastapi import FastAPI, HTTPException
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
def save_entry(entry: Entry) -> dict:
    necessary = None if entry.necessary is None else int(entry.necessary)
    with database() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO entries
            (id, date, food, sleep_time, wake_time, mood, health, category, amount, necessary, purpose)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
        connection.commit()
    return {"saved": True}


@app.get("/api/entries")
def list_entries() -> list[dict]:
    with database() as connection:
        rows = connection.execute("SELECT * FROM entries ORDER BY date DESC").fetchall()
    return [dict(row) for row in rows]


def load_training_rows() -> list[tuple[list[float | str], int]]:
    with database() as connection:
        rows = connection.execute(
            "SELECT mood, health, sleep_time, wake_time, category, amount, necessary "
            "FROM entries WHERE necessary IS NOT NULL"
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
def train_model() -> dict:
    training = load_training_rows()
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
