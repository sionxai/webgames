# Life RPG Simulator

Next.js + Firebase 기반 Life RPG 시뮬레이터입니다. 스탯 관리, 직업/알바, 상점, 퀘스트, 알람과 공백 처리 등 v28 게임 로직을 웹으로 제공합니다.

## 개발 서버 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열면 앱을 확인할 수 있습니다.

## 환경 변수

`.env.local` 파일을 만들고 Firebase 설정을 주입하세요:

```
NEXT_PUBLIC_FIREBASE_CONFIG_JSON=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_INITIAL_AUTH_TOKEN=...
```

필요한 경우 `.env.local.example` 참고.

## 주요 스택

- Next.js (App Router, Tailwind)
- Firebase Auth + Cloud Firestore
- lucide-react UI 아이콘
