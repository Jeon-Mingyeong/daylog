# Daylog Python ML API

FastAPI and scikit-learn backend for personal pattern analysis.

## Run locally

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

API documentation: `http://localhost:8000/docs`

## Render deployment

The repository includes `render.yaml` at the project root.

1. Create a new Render Blueprint from the GitHub repository.
2. Render creates the `daylog-api` web service on port `$PORT`.
3. Add the Render service URL, including `https://`, to the GitHub repository secret `VITE_API_URL`.
4. Push to `main` or run the `Build, test, and deploy` workflow manually.

Free Render services use ephemeral storage unless a persistent disk is configured. A persistent disk is required before treating hosted records and trained models as durable.

## Endpoints

- `GET /api/health`
- `POST /api/entries`
- `GET /api/entries`
- `POST /api/train`
- `POST /api/predict/impulse`
