# P2 스펙 — 백엔드 통합 (포털 표준 Firebase: webgames-66ccf)

## 0. 표준 설정 (모든 게임·포털 공통, 이 값 그대로 사용)
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

## 1. 목표
포털과 3게임(bakara·gacha·life-rpg)이 위 단일 Firebase 프로젝트를 사용한다. 포털 홈에 계정 위젯(익명 자동 로그인 → Google 연결)이 생기고, 같은 오리진에서 로그인 세션이 게임에도 공유된다. 데이터 이관은 이번 범위 아님(신규 백엔드 기준).

## 2. 변경 파일 (목록 밖 수정 금지)
- 신규: `src/lib/portalAuth.ts`(포털 인증 모듈), `src/home/components/AccountWidget.tsx`, `database.rules.json`(저장소 루트 — 통합 규칙), `firebase.json`(루트 — database 규칙 배포용 최소 설정)
- 수정: `package.json`(firebase 의존성 1개 추가만), `src/home/HomePage.tsx`(위젯 배치), `src/home/home.css`(위젯 스타일)
- 수정: `games/bakara/js/firebase-manager.js`(config 교체만), `games/gacha/firebase.js`(config 교체만), `games/gacha/auth.js` 또는 로그인 게이트 파일(아래 3.4)
- 수정: `games/life-rpg/.env.local.example`(새 CONFIG_JSON 예시 — 실제 .env.local과 out 재빌드는 Claude 담당)
- 금지: 게임 로직·UI 본문, forge/waitdog, functions 코드, vite.config.ts

## 3. 계약
### 3.1 portalAuth.ts (npm firebase 모듈 사용)
- `initPortalAuth()`: onAuthStateChanged 구독. 사용자 없으면 `signInAnonymously` 시도. 실패 코드가 `operation-not-allowed`면 상태를 `setup-required`로 노출(콘솔에서 제공자 미활성화 안내용) — throw 금지.
- `linkGoogle()`: 현재 익명 사용자에 `linkWithPopup(GoogleAuthProvider)`. `credential-already-in-use`면 `signInWithPopup`으로 대체 로그인. 반환: 성공 여부.
- `signOutPortal()`, 상태 구독 API. analytics는 지원 환경에서만 동적 초기화(빌드 실패 금지).
### 3.2 AccountWidget (홈 헤더 우측)
- 상태별 표시: 로딩 스피너 → 게스트(주사위 아이콘 + "게스트-<uid 앞 4자>" + "Google 연결" 버튼) → Google 연결됨(displayName + 로그아웃). `setup-required`면 회색 배지 "계정 준비 중".
- 문구·스타일은 기존 포털 다크 테마 토큰 사용. 모바일에서 줄바꿈 없이 축약.
### 3.3 config 교체 (bakara·gacha)
- 기존 firebaseConfig 객체의 값만 §0으로 교체. 다른 코드 변경 금지. bakara는 compat SDK 유지, gacha는 CDN ESM 유지.
### 3.4 gacha 세션 수용 (최소 diff)
- 로그인 게이트에서 `onAuthStateChanged` 결과 사용자가 이미 있으면(익명 포함) 로그인 화면을 건너뛰고 게임 진입. 기존 아이디/비번 플로우는 그대로 유지(신규 프로젝트의 email/password 사용).
- 익명 사용자의 표시명이 필요하면 "게스트-<uid 4자>" 폴백.
### 3.5 통합 RTDB 규칙 (루트 database.rules.json)
- 기본 deny. 병합 대상: ① gacha 규칙(games/gacha/database.rules.json의 **수정본 그대로** — role 봉인 포함) ② life-rpg가 사용하는 경로(games/life-rpg/src에서 실제 참조 경로를 grep해 파악 후 소유자 제한 규칙로) ③ 포털 공용: `portal/users/$uid` (read/write: auth.uid === $uid, 프로필·닉네임용), `portal/saves/$uid/$gameId` (read/write 본인만 — forge/waitdog 클라우드 저장 예약).
- gacha 경로와 life-rpg 경로가 충돌하면 상위 네임스페이스로 분리하지 말고 **기존 경로 유지**(게임 코드 무수정 원칙) — 단 충돌 시 보고.
### 3.6 firebase.json (루트)
- `{ "database": { "rules": "database.rules.json" } }` 만. hosting 설정 금지.

## 4. 수용 기준 (Claude 실행)
```
npm run build
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
- database.rules.json JSON 파싱 유효. 홈 위젯 렌더·게이트 동작은 Claude 브라우저 검증(제공자 미활성 상태의 graceful 동작 포함).

## 5. 금지
- 데이터 이관 시도, 게임 로직 변경, 새 의존성(firebase 1개 외), git 커밋/푸시, npm install·빌드 실행.

## 완료 보고 (30줄 이내): 변경 파일 / life-rpg 사용 경로 목록 / 규칙 병합 요지 / 가정 / 미해결.
