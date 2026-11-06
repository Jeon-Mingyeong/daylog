# 데이로그

음식, 수면, 기분, 건강 상태와 소비를 함께 기록하는 개인 생활 데이터 앱입니다.

## 시작하기

```bash
npm install
npm run dev
```

## MVP 기능

- 오늘 먹은 음식 기록
- 취침 및 기상 시간 기록
- 기분과 건강 상태 기록
- 소비 항목, 금액, 카테고리, 구매 이유 기록
- 필요 소비와 충동 구매 구분
- 기록과 분석 화면
- 브라우저 로컬 저장소에 개인정보 저장

## 개발 및 배포

```bash
npm install
npm run lint
npm test
npm run build
```

`main` 브랜치에 푸시하면 GitHub Actions가 린트, 테스트, 빌드를 실행한 뒤 GitHub Pages에 배포합니다.

## Python ML API

개인별 예측 모델은 [backend/README.md](backend/README.md)의 FastAPI 서버로 실행할 수 있습니다.

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

충분한 기록이 쌓이면 `POST /api/train`으로 Logistic Regression 모델을 학습하고, `POST /api/predict/impulse`로 충동 구매 위험을 예측합니다.

## 기술 문서

- [기능·기술 명세서](docs/기능명세서.md)

## 외부 ML API 배포

1. Render에서 이 저장소의 `render.yaml` Blueprint를 배포합니다.
2. 생성된 API URL을 GitHub 저장소의 `Actions secrets`에 `VITE_API_URL` 이름으로 등록합니다.
3. `main`에 Push하거나 GitHub Actions의 `Build, test, and deploy` 워크플로우를 실행합니다.

프론트 빌드에는 `VITE_API_URL`이 포함됩니다. 호스팅 URL을 등록하지 않으면 API 연동 없이 로컬 기록 기능만 동작합니다.

## Notion 연동

FastAPI 서버에 `NOTION_TOKEN`, `NOTION_DATABASE_ID` 환경변수를 설정하면 분석 화면의 `Notion 데이터 가져오기`와 `Notion으로 내보내기` 기능을 사용할 수 있습니다.

현재 MVP는 브라우저마다 생성한 로컬 사용자 ID로 서버 기록을 구분합니다. 로그인 인증과 사용자별 권한 검증은 추가 구현 대상입니다.
