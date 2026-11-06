from fastapi.testclient import TestClient

from main import app, init_database


client = TestClient(app)


def setup_function() -> None:
    init_database()


def test_health_endpoint_reports_service_status() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_impulse_prediction_returns_probability() -> None:
    response = client.post(
        "/api/predict/impulse",
        json={
            "mood": "불안함",
            "health": 3,
            "sleep_hours": 4.5,
            "category": "쇼핑",
            "amount": 78000,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert 0 <= result["impulse_probability"] <= 1
    assert result["level"] in {"낮음", "주의", "높음"}


def test_notion_import_requires_server_configuration(monkeypatch) -> None:
    monkeypatch.delenv("NOTION_TOKEN", raising=False)
    monkeypatch.delenv("NOTION_DATABASE_ID", raising=False)
    response = client.post("/api/notion/import", json={})
    assert response.status_code == 503
