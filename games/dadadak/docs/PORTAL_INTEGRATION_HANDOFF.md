# 다다닥 → 웹게임 포탈 통합 인계서 (v1)

> **이 문서의 독자**: webgames 포탈(https://webgames-chi.vercel.app) 저장소를 담당하는 에이전트/개발자.
> **목적**: 다다닥(DADADAK)을 이 포탈의 게임으로 추가한다. 이 문서만으로 실행 가능하게 작성했다.
> **작성 근거**: 다다닥 저장소 실측 + 포탈 공개 번들 실측(2026-07-19). 추정 항목은 `[확인필요]` 표기.

---

## 0. 한 줄 요약

다다닥은 **정적 게임이 아니라 상시 구동 서버**(Node + WebSocket + SQLite)다. 포탈의 기존 게임처럼 `/games/<이름>/` 정적 폴더로 넣을 수 **없다**. 다다닥을 **별도 호스트에 배포**하고, 포탈에는 **외부 URL 카드**를 추가하는 방식으로 통합한다.

---

## 1. 왜 기존 방식이 안 되는가 (사실 근거)

**포탈의 현재 구조 (공개 번들 실측):**
- Vite SPA, Vercel 정적 호스팅. 게임 목록은 `home-*.js` 안의 배열.
- 게임 엔트리 형태: `{ id, description, path: "/games/forge/", thumbnail: "/assets/images/forge-arena-v1.webp", status: "live" }`
- 카드 렌더: `<a class="game-card" href={game.path}>` — **같은 도메인 내부 정적 경로**로 링크.
- 즉 모든 게임이 **서버 없는 클라이언트 정적 게임**을 전제로, Vercel 정적 폴더에 얹혀 있다.

**다다닥의 실체 (저장소 실측):**
| 항목 | 값 | 함의 |
|---|---|---|
| 구동 | `npm start` = `NODE_ENV=production tsx server.ts` | Node 프로세스 상시 필요 |
| 실시간 | Socket.IO (`lib/server/realtime.ts`) 커스텀 서버 | WebSocket 필수 |
| DB | better-sqlite3, `data/battle.db` 로컬 파일 | 쓰기 가능 영구 디스크 필요 |
| 세션 | iron-session 쿠키 | 서버 세션 |
| 배포 제약 | **Vercel 금지** (WebSocket 미지원 — `CLAUDE.md` 명시) | 포탈과 같은 호스팅 불가 |
| 라우트 | `/`(홈) `/solo` `/match` `/battle/[id]` `/room/[code]` `/rank` `/achievements` `/clicker` `/event` `/tap` `/report` `/admin` `/diag` | 자체 내비게이션 가진 풀 앱 |

→ 정적 폴더로 넣으면 홈(딸깍 카운터)은 떠도 **대결·랭킹·기록 저장이 전부 죽는다.**

---

## 2. 채택 방식: 독립 배포 + 외부 URL 카드 (오너 승인)

> 대안 비교 후 채택. 대안 B(대결 뺀 싱글 정적 버전)는 다다닥 핵심 상실로 기각. 대안 C(포탈 공용 백엔드에 흡수)는 **아직 공용 백엔드가 존재하지 않으므로** 시기상조 — §5 참조.

- 다다닥을 **WebSocket 되는 호스트**에 배포 → 공개 HTTPS URL 확보
- 포탈에 그 URL을 가리키는 **게임 카드** 추가
- 다다닥 코드는 **거의 그대로**(배포용 환경변수·쿠키 옵션만 조정)

작업이 **두 소유자로 갈린다.** 순서 중요: **A 먼저, 그다음 B.**

---

## 3. [작업 A] 다다닥 배포 — 선행 조건 (소유자: 다다닥 담당)

> 포탈 카드는 이게 끝나기 전엔 무용지물이다. **포탈 에이전트의 일이 아니다.** 별도 다다닥 세션에서 수행.

1. **호스트 선정** (WebSocket + 상시 프로세스 지원): Railway / Render / Fly.io / VPS 중. Vercel·Netlify·Cloudflare Pages 불가(정적/서버리스라 WS 상시연결 부적합).
2. **런타임**: Node 22+ (현재 개발기 Node 24). `package.json`에 `engines` 명시 권장. Dockerfile/Procfile 현재 **없음 → 신규 작성 필요**.
3. **빌드·구동**: `next build` → `NODE_ENV=production tsx server.ts` (기본 PORT 3000, 호스트가 주는 `$PORT` 존중하는지 `server.ts` 확인 `[확인필요]`).
4. **SQLite 영구성 (중대)**: `data/battle.db`는 로컬 파일. 다수 PaaS는 파일시스템이 **재배포마다 초기화(ephemeral)**된다 → **랭킹·누적기록이 배포할 때마다 리셋**된다. 둘 중 하나 필수:
   - (지금) **영구 볼륨** 마운트 (Railway/Fly 지원) → `DATABASE_PATH`를 볼륨 경로로
   - (권장 장기) **Postgres/Supabase 이관** — `CLAUDE.md`에 "모든 SQL은 `lib/server/db.ts`에서만(Supabase 이관 대비 단일 시임)"이라 되어 있어, `db.ts` 한 파일 교체로 이관 가능하게 이미 설계됨. 공개 서비스로 갈 거면 이 시임을 실행할 시점.
5. **환경변수** (개발용 `.env.local` 값 **재사용 금지** — 유출됨):
   - `SESSION_SECRET` = 강한 새 난수
   - `ADMIN_PASSWORD` = 강한 새 값 (현재 `a12341234`는 로컬 전용)
   - `DATABASE_PATH` = 영구 볼륨 경로
   - `NEXT_PUBLIC_BASE_URL` = 배포 도메인
6. **HTTPS 필수** (포탈이 HTTPS라 혼합콘텐츠·쿠키 Secure 때문에).
7. **임베드 방식에 따른 쿠키·헤더** — §4의 결정에 종속:
   - **새 탭 이동**이면: 현재 `sameSite: "lax"` 그대로 OK, 추가 헤더 불필요.
   - **iframe 임베드**면: 세션 쿠키를 `SameSite=None; Secure`로 바꿔야 함(`lib/server/session.ts:20`). 안 바꾸면 iframe 안에서 온보딩·세션이 깨진다. + 응답 헤더에 `Content-Security-Policy: frame-ancestors 'self' https://webgames-chi.vercel.app` 추가(현재 X-Frame/CSP 설정 없음 → `server.ts`나 미들웨어에 추가).

**A 완료 판정**: 배포 URL에서 홈 로드 + `/solo` 10초 측정 저장 + `/match` 소켓 연결까지 실동작.

---

## 4. [작업 B] 포탈에 카드 추가 (소유자: 포탈 에이전트)

> **선행: 작업 A로 확보된 배포 URL이 있어야 한다.** URL 없이 시작하지 말 것.

포탈은 현재 게임을 `path`(내부 정적 경로)로만 지원한다. 다다닥은 **외부 URL**이라 카드 타입 확장이 필요하다.

1. **게임 데이터에 외부 URL 엔트리 추가** (기존 배열, `home-*.js`가 읽는 소스):
   ```js
   {
     id: "dadadak",
     title: "다다닥",                       // [확인필요] 기존 엔트리의 제목 필드명 확인
     description: "10초 실시간 클릭 대결. 캐릭터 키우고 랭킹 오르기.",
     url: "https://<작업A의 배포 도메인>",     // path 대신 url
     external: true,                         // 외부/내부 구분 플래그
     thumbnail: "/assets/images/dadadak-hero.webp",  // 아래 6번
     status: "live",
   }
   ```
2. **카드 렌더 분기**: `external` 게임은 `href={game.path}`(내부) 대신 다음 중 택1 —
   - **(권장·단순) 새 탭 이동**: `<a href={game.url} target="_blank" rel="noopener">`. 다다닥은 자체 내비·모바일 480px 레이아웃을 가진 풀 앱이라, 작은 캔버스 게임처럼 인라인 임베드보다 **전체 화면 진입**이 자연스럽다. 쿠키·CSP 이슈도 없음(§3-7).
   - **(선택·몰입) iframe 전용 라우트**: 포탈에 `/play/dadadak` 같은 라우트를 만들어 `<iframe src={game.url} allow="fullscreen; autoplay" style="전체화면">`. 이러면 작업 A에서 쿠키 `SameSite=None`+CSP `frame-ancestors`가 **반드시** 선행돼야 함.
3. **정렬·상태**: `status: "live"`로 노출. coming-soon 처리 로직이 있으면 그에 맞춤 `[확인필요]`.
4. **회귀 확인**: 기존 정적 게임(`/games/forge/` 등) 카드가 그대로 동작하는지(외부 분기가 내부 게임을 깨지 않게).

**B 완료 판정**: 포탈 목록에 다다닥 카드 노출 → 클릭 → 배포된 다다닥 도달·동작.

---

## 5. 명시적 비목표 / 나중으로 미룸

- **포탈 공용 백엔드(SSO·통합 계정·통합 랭킹·지갑)**: 지금 포탈은 순수 정적 SPA라 공용 백엔드가 **없다**. "게임들 전부 백엔드 붙인다"는 **포탈을 플랫폼으로 전환하는 별도 대형 설계**이며, 이 통합의 범위가 아니다.
- 따라서 **다다닥을 공용 백엔드에 맞춰 재배선하지 말 것.** 다다닥은 자기 백엔드를 유지한다. 나중에 공용 백엔드가 설계되면 그때 다다닥의 인증·유저를 흡수할지 별도 결정한다(다다닥 `db.ts`·세션이 단일 시임이라 이관 여지는 열려 있음).
- 이 통합은 "다다닥을 포탈에서 실행 가능하게" 까지만.

## 6. 필요 에셋

- **썸네일**: 다다닥 저장소 `public/clicker/a1-sku1-hero_v1.png`(1536×1024) 또는 `public/brand/symbol.svg`. 포탈 규격(webp, 카드 비율)에 맞춰 변환 `[확인필요: 기존 썸네일 크기/비율]`.

## 7. 사람이 결정할 열린 질문

1. **호스트**: Railway / Render / Fly.io / VPS 중 무엇? (비용·볼륨 지원·난이도 상이)
2. **임베드 방식**: 새 탭 이동(빠름·안전) vs iframe 몰입(쿠키·CSP 작업 추가)?
3. **DB 영구성**: 영구 볼륨(지금) vs Postgres/Supabase 이관(장기)? — 공개 랭킹 유지하려면 필수 결정.
4. **도메인**: 서브도메인(dadadak.xxx) 배정?

---

## 8. 요약 체크리스트

- [ ] (A) 호스트 선정 + Dockerfile/Procfile 작성
- [ ] (A) 환경변수(강한 SECRET/PW) + HTTPS + 영구 DB
- [ ] (A) 임베드 방식 결정 → iframe이면 쿠키 SameSite=None + CSP frame-ancestors
- [ ] (A) 배포·동작 검증(홈·솔로·매치)
- [ ] (B) 포탈 게임 배열에 external URL 엔트리 추가
- [ ] (B) 카드 렌더 external 분기(새 탭 or iframe 라우트)
- [ ] (B) 썸네일 등록 + 기존 게임 회귀 확인

---

_v1 — 2026-07-19. 다다닥 저장소·포탈 번들 실측 기반. `[확인필요]`는 포탈 저장소 접근 후 확정. 공용 백엔드 전환은 범위 외(§5)._
