# Daylog Python ML API

FastAPI and scikit-learn backend for personal pattern analysis.

## Run locally

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

API documentation: `http://localhost:8000/docs`

## Notion integration

Set these server environment variables:

```text
NOTION_TOKEN=secret_or_oauth_access_token
NOTION_DATABASE_ID=notion_database_id
DAYLOG_DATA_DIR=/optional/persistent/data/directory
```

The Notion database should contain these properties for import and export:

```text
이름: title
날짜: date
음식: rich_text
취침: rich_text
기상: rich_text
카테고리: select
금액: number
필요한 소비: checkbox
구매 목적: rich_text
메모: rich_text
기분: select
건강: number
```

Endpoints:

- `POST /api/notion/import`
- `POST /api/notion/export`

Requests use the `X-User-ID` header to isolate server records. The MVP generates a random browser user ID; it is not authentication.

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
