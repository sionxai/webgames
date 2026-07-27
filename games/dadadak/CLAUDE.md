# 다다닥 (DADADAK)

실시간 클릭 대결 웹앱. 단일 출처 명세는 `docs/PRD.md` (v1.0 확정) — 구현 판단이 갈리면 항상 PRD를 따른다.

## 아키텍처 제약 (필수)

- **모든 SQL은 `lib/server/db.ts`에서만 실행한다.** 다른 파일에서 better-sqlite3 import 금지. (Supabase 이관 대비 단일 시임)
- **모든 Socket.IO 이벤트 핸들러는 `lib/server/realtime.ts`에 모은다.** (실시간 인프라 교체 대비 단일 시임)
- **서버 권위 원칙**: 클릭 수 최종 판정은 서버. 클라이언트 표시 값은 참고용.
- Vercel 배포 금지 (WebSocket 미지원). custom server(`server.ts`) + tsx로 구동.

## 구동

- `npm run dev` — tsx watch로 custom server 실행 (Next dev + Socket.IO, PORT 기본 3000)
- `npm run build` && `npm start` — 프로덕션
- `npm run typecheck` / `npm run lint` / `npm run test:e2e`
- **주의**: dev 서버가 떠 있는 동안 검증 목적의 단독 빌드는 반드시 `NEXT_DIST_DIR=.next-e2e npm run build`로 실행할 것 — 그냥 `npm run build`는 dev 서버가 쓰는 `.next`를 덮어써 dev가 500/404로 깨진다 (E2E webServer는 이미 분리되어 있음)
- **포트 3500 = launchd 상주 앱** (`com.dadadak.server`, dev watch 모드 + 헬스 모니터, `scripts/server-daemon.sh`). 개발·검증 작업에서 3500을 쓰거나 이 프로세스를 죽이지 말 것 — KeepAlive가 되살린다. 개발은 3000, E2E는 3111 유지

## 구조

- `server.ts` — HTTP + Next + Socket.IO 부트스트랩. 서버 전용 파일(server.ts, lib/server/*, lib/shared/*)은 tsx가 직접 실행하므로 **상대 경로 import만 사용** (`@/` 별칭 금지).
- `lib/shared/` — 서버·클라이언트 공용 타입/상수 (배틀 파라미터는 `constants.ts`의 BATTLE 객체가 유일한 출처)
- `lib/client/` — 소켓 싱글턴, useBattle 훅
- `app/api/` — REST 라우트 (Next 번들에서 실행되므로 db.ts 모듈 인스턴스가 소켓 쪽과 분리됨 — 공유 상태는 반드시 DB에 저장)
- `e2e/` — Playwright (전용 DB `data/e2e.db`, 포트 3111 사용)

## 디자인

- 다크 아케이드 톤. 컬러/타이포 토큰은 `app/globals.css`의 @theme — PRD 12장 준수.
- 그라데이션·3D·이모지 장식·스크롤 애니메이션 금지.
