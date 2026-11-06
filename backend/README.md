# Daylog Python ML API

FastAPI and scikit-learn backend for personal pattern analysis.

## Run locally

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

API documentation: `http://localhost:8000/docs`

## Endpoints

- `GET /api/health`
- `POST /api/entries`
- `GET /api/entries`
- `POST /api/train`
- `POST /api/predict/impulse`
