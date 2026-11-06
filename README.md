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
