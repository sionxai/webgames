# 다다닥 D1 — 서버 제거 · Firestore 전환 · 포털 병합

## 0. 배경과 원칙
다다닥은 Next.js custom server(`server.ts`) + Socket.IO + better-sqlite3 + iron-session 구조라 정적 배포가 불가능하다. D1에서는 **서버 없이 도는 범위만** 살려 포털에 올린다. 실시간 중계는 포기하고 결과 기록 방식으로 간다(사용자 확정 사항).

**살리는 것**: 홈 `/`, 솔로 CPS `/solo`, 탭 `/tap`, 랭킹 `/rank`, 클리커 `/clicker`, `/privacy`
**D1에서 끄는 것**(D2/D3 예정): `/match`, `/room/[code]`, `/battle/[id]`, `/challenge/[id]`, `/result/[id]`, `/event`, `/achievements`, `/report*`, `/admin`, `/diag`

## 1. 변경 파일
- 신규: `games/dadadak/lib/client/firebase.ts`(앱 초기화·Auth·Firestore 핸들), `games/dadadak/lib/client/store.ts`(데이터 접근 어댑터)
- 수정: `games/dadadak/next.config.ts`, 살리는 페이지의 데이터 호출부, 끄는 경로 처리
- 삭제: `games/dadadak/app/api/**`(17개 전부 — static export는 API route 불가), `server.ts`, `lib/server/**`, `lib/client/socket.ts`
- 수정: `games/dadadak/package.json`(scripts를 next 표준으로, socket.io·better-sqlite3·iron-session·tsx 의존 제거)
- 수정(포털): `vite.config.ts`(staticGamesPlugin에 dadadak 추가), `src/home/games.ts`(카드), `.gitignore`
- 신규(포털): `firestore.rules`(루트) — 기존 `games/bakara/firestore.rules` 내용을 그대로 포함하고 다다닥 규칙 추가
- 수정: `firebase.json` — firestore.rules 경로를 루트 `firestore.rules`로

## 2. Firebase 계약

### 2.1 초기화 (`lib/client/firebase.ts`)
한판 표준 설정을 그대로 쓴다(이미 다른 게임과 동일):
```js
const firebaseConfig = {
  apiKey: "AIzaSyCc4Gjh0N3wzCxqAEEQkrsX8AlI7UNBGR0",
  authDomain: "webgames-66ccf.firebaseapp.com",
  databaseURL: "https://webgames-66ccf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webgames-66ccf",
  storageBucket: "webgames-66ccf.firebasestorage.app",
  messagingSenderId: "539839465670",
  appId: "1:539839465670:web:b6bdf12a8d14d067e2efc7",
  measurementId: "G-94XVFXT33H"
};
```
- `firebase` npm 패키지를 다다닥 `package.json`에 추가(포털과 동일 버전). 다른 새 의존성 금지.
- 인증: 사용자 없으면 `signInAnonymously`. Google 로그인 버튼은 D1에서 만들지 않는다(포털 홈에서 연결하면 같은 계정이 이어짐). 익명 로그인이 막혀 있으면 조용히 게스트 로컬 모드로 두고 랭킹 제출만 비활성 — 크래시 금지.
- iron-session 기반 로그인/닉네임 화면은 제거하고 아래 프로필로 대체.

### 2.2 Firestore 스키마
- `dadadak_users/{uid}`: `{ nickname: string, bestCps: number, totalTaps: number, region: string|null, schoolId: string|null, updatedAt: number }`
- `dadadak_schools/{schoolId}`: `{ name: string, region: string }` — 읽기 전용(쓰기는 콘솔에서만)
- 닉네임 기본값: 한판 RTDB `portal/users/{uid}/nickname`이 있으면 그 값, 없으면 `게스트-<uid 앞4자>`. RTDB 읽기 실패는 무시하고 기본값 사용.

### 2.3 store.ts API (이 형태로 고정)
```ts
export async function ensureProfile(): Promise<{ uid: string; nickname: string } | null>;
export async function submitRun(cps: number, taps: number): Promise<'ok' | 'skipped' | 'error'>;  // bestCps 갱신 시에만 기록
export async function getRankings(scope: 'all' | 'region' | 'school', limit?: number): Promise<Array<{ uid: string; nickname: string; bestCps: number }>>;
export async function setRegionSchool(region: string | null, schoolId: string | null): Promise<void>;
```
- `submitRun`은 기존 기록보다 높을 때만 쓴다. 로그인 불가 상태면 `'skipped'`.
- 실패는 throw하지 말고 반환값으로 알린다. 게임 진행은 절대 막지 않는다.

### 2.4 firestore.rules (루트 신규)
bakara 기존 규칙(`/users/{userId}` 본인 전용)을 **그대로 유지**하고 아래를 추가:
```
match /dadadak_users/{uid} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == uid
    && request.resource.data.bestCps is number
    && request.resource.data.bestCps >= 0
    && request.resource.data.bestCps <= 30
    && request.resource.data.nickname is string
    && request.resource.data.nickname.size() <= 20;
}
match /dadadak_schools/{schoolId} {
  allow read: if true;
  allow write: if false;
}
```
CPS 상한 30은 사람이 낼 수 있는 범위를 넘는 조작을 막기 위한 것이다. 클라이언트 기록이므로 완전 신뢰는 불가 — 랭킹 화면에 "비공식 기록" 성격을 한 줄로 표시한다.

## 3. 정적화 계약
- `next.config.ts`: `output: 'export'`, `basePath: '/games/dadadak'`, `trailingSlash: true`, `images: { unoptimized: true }`. 기존 옵션은 보존.
- 동적 라우트(`[id]`, `[code]`, `[userId]`)는 D1에서 끄는 대상이므로 **경로 자체를 제거**하거나 `generateStaticParams`로 빈 배열을 반환해 빌드가 통과하게 한다. 어느 쪽이든 빌드 성공이 우선.
- 끄는 경로로 가는 링크·버튼은 화면에서 감추거나 "준비 중" 안내로 바꾼다. 죽은 링크를 남기지 말 것.
- `next/image`는 `unoptimized`로 동작해야 한다(이미 WebP로 변환돼 있음).

## 4. 포털 병합
- `vite.config.ts`의 staticGamesPlugin `STATIC_GAMES`에 추가: `{ id: 'dadadak', dir: 'games/dadadak/out', exclude: [] }`
- `src/home/games.ts`에 live 카드 추가 — id `dadadak`, title `다다닥`, genre `실시간 클릭 대결`, tagline·description은 `games/dadadak/README.md` 첫 문단에서 요약(솔로 CPS·랭킹 중심으로, D1에 없는 1:1 매치·방 대결은 언급하지 말 것), `path: '/games/dadadak/'`, `thumbnail: null`, `status: 'live'`.
- 기존 'DADADAK 준비 중' 예고 카드가 있으면 제거.
- `.gitignore`에 `games/dadadak/.next*/`, `games/dadadak/out/`은 **무시하지 말 것**(out은 배포 산출물로 커밋). `games/dadadak/data/`, `games/dadadak/test-results/`, `games/dadadak/playwright-report/`는 무시 추가.

## 5. 수용 기준 (Claude가 직접 실행·검증)
```
cd games/dadadak && npm install && npx next build      # out/ 생성
cd ../.. && npm run build                              # dist/games/dadadak/index.html 포함
npm run test:contract
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
- 브라우저: `/games/dadadak/` 홈 진입, 솔로 10초 플레이 → CPS 산출 → 랭킹 반영, 랭킹 목록 표시, 끄는 경로 링크 노출 0, 콘솔 오류 0, 390px 오버플로 0.
- 로그인 불가 상황(익명 차단)에서도 솔로 플레이가 되고 랭킹 제출만 조용히 생략되는지.

## 6. 금지
- 다른 게임(forge/waitdog/bakara/gacha/life-rpg)·포털 홈 컴포넌트 수정, 게임 규칙·CPS 계산식 변경, 새 의존성(firebase 외), git 커밋/푸시, Firestore 규칙 배포(Claude가 수행).
- Socket.IO·SQLite를 남겨두는 절충 금지 — 정적 export가 목표다.

## 완료 보고 (30줄 이내): 변경·삭제 파일 / Firestore 스키마 실제 구현 / 끈 경로 처리 방식 / 남은 죽은 코드 / 가정 / 미해결.
