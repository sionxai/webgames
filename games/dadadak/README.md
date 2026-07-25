# 다다닥 (DADADAK)

폰 터치 또는 아무 키보드로 참전하는 **10초 실시간 클릭 대결** 웹앱.
솔로 CPS 측정 · 실시간 1:1 랜덤 매치 · 친구 방 대결(2~8인) · 전국/지역/학교 랭킹.

명세는 [docs/PRD.md](docs/PRD.md) (v1.0 확정)가 단일 출처다.

## 스택

Next.js 15 (App Router, custom server) · TypeScript · Tailwind CSS 4 · Socket.IO 4 · better-sqlite3 · iron-session · Node 22+

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값 채우기 (SESSION_SECRET는 32자 이상)
npm run dev                  # http://localhost:3000
```

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | 개발 서버 (tsx watch + Next dev + Socket.IO) |
| `npm run build` && `npm start` | 프로덕션 빌드·기동 |
| `npm run typecheck` / `npm run lint` | 정적 검사 |
| `npm run test:e2e` | Playwright E2E 3종 (포트 3111, `data/e2e.db` 사용) |

## 아키텍처 제약 (PRD 3.1)

- 모든 SQL은 `lib/server/db.ts` 한 파일에서만 — 다른 파일에서 better-sqlite3 import 금지
- 모든 Socket.IO 핸들러는 `lib/server/realtime.ts` 한 파일에만
- 클릭 수 최종 판정은 항상 서버 (클라이언트 표시는 참고용)
- Vercel 배포 금지 (WebSocket 미지원) — Railway 단일 서비스 기준

## 배포 메모 (Railway)

- Node 22 고정, 시작 명령 `npm start`, `PORT`는 플랫폼 주입 값 사용
- 환경 변수 4종 설정: `SESSION_SECRET` `DATABASE_PATH` `ADMIN_PASSWORD` `NEXT_PUBLIC_BASE_URL`
- `data/` 디렉토리는 볼륨 마운트 필요 (SQLite 영속화)
