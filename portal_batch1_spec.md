# P1 스펙 — 외부 게임 3종(bakara·gacha·life-rpg) 포털 통합

## 1. 목표
정적 게임 2종(bakara, gacha)과 Next 정적 내보내기 1종(life-rpg)을 `/games/<id>/` 경로로 단일 Vite 배포에 병합하고, 홈 카드에 등록한다. gacha 권한 상승 취약점을 저장소 내에서 수정한다.

## 2. 변경 파일 (목록 밖 수정 금지)
- 신규: `plugins/staticGamesPlugin.ts` — Vite 플러그인 (dev 서빙 + 빌드 복사)
- 수정: `vite.config.ts`(플러그인 등록만), `src/home/games.ts`(카드), `.gitignore`
- 수정: `games/gacha/database.rules.json`, `games/gacha/functions/index.js` (보안 수정만, 최소 diff)
- 수정: `games/life-rpg/next.config.ts` (export 설정만)
- 금지: `games/bakara`·`games/gacha`의 게임 로직/HTML/JS 본문, forge·waitdog·src/waitdog, 홈 컴포넌트(HomePage.tsx 수정 불필요 — 카드 데이터만)

## 3. 계약
### 3.1 staticGamesPlugin
- 설정 상수: `[{ id: 'bakara', dir: 'games/bakara', exclude: ['firebase.json','vercel.json','firestore.rules','firestore.indexes.json'] }, { id: 'gacha', dir: 'games/gacha', exclude: ['functions/**','node_modules/**','*.md','package.json','package-lock.json','eslint.config*','test-*.js','.env*'] }, { id: 'life-rpg', dir: 'games/life-rpg/out', exclude: [] }]`
- dev: `configureServer` 미들웨어로 `/games/<id>/...` 요청을 해당 dir 파일로 서빙(디렉토리 요청은 index.html, 존재하지 않으면 next 위임). vite의 기존 forge/waitdog 엔트리 라우팅과 충돌 금지.
- build: `closeBundle`에서 dir → `dist/games/<id>/` 복사(exclude 적용). dir 부재 시(예: life-rpg/out 미빌드) 명확한 경고 로그 후 해당 게임만 건너뜀(빌드 실패 금지).
### 3.2 gacha 보안 수정 (발견한 취약점: 클라이언트가 자기 role을 admin으로 설정 가능)
- `database.rules.json`: `role` 필드는 클라이언트 쓰기 불가로 봉인(신규 생성 시 'user' 고정 검증 포함). 나머지 규칙은 기존 유지, 최소 diff.
- `functions/index.js`: 관리자 판정이 DB `role`을 읽는 부분은 유지하되, 요청 본문/클라이언트 제공 role을 신뢰하는 경로가 있으면 제거. 주석으로 근거 한 줄.
### 3.3 life-rpg next.config.ts
- `output: 'export'`, `basePath: '/games/life-rpg'`, `trailingSlash: true`, `images: { unoptimized: true }`. 기존 옵션 보존. (빌드 실행은 Claude가 로컬에서 수행 — 너는 설정만.)
### 3.4 카드 (src/home/games.ts)
- live 카드 3개 추가: bakara(장르 '카지노 카드 시뮬', 설명은 games/bakara/index.html meta description 참조), gacha(장르·설명은 games/gacha/README.md 1~2문단에서 요약), life-rpg(games/life-rpg/README.md 참조). `path: '/games/<id>/'`, `thumbnail: null`(추후 교체), `status: 'live'`.
- 기존 'coming-soon-2'(세 번째 게임) 카드를 DADADAK 예고 카드로 교체: title 'DADADAK', genre '준비 중', 설명 "실시간 대전 게임 — 서버 준비 중입니다."
### 3.5 .gitignore 추가
`games/*/node_modules/`, `games/*/.next/`, `games/*/.env*`, `games/*/functions/node_modules/`, `games/life-rpg/out/`은 **커밋 대상**이므로 무시하지 말 것(예외 규칙 필요 시 명시적으로).

## 4. 수용 기준 (Claude가 직접 실행)
```
npm run build   # dist/games/{bakara,gacha}/index.html 존재 (+life-rpg는 out 빌드 후)
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
- dev 서버에서 `/games/bakara/`, `/games/gacha/` 로드(브라우저 검증은 Claude).

## 5. 금지
- 게임 본문 로직 수정, 홈 히어로 변경, git 커밋/푸시, npm install/빌드 장시간 실행(환경 크래시 잦음 — 설정·코드만 작성), 스펙 밖 파일.

## 완료 보고 (30줄 이내): 변경 파일 / 보안 수정 요지(before→after) / 카드 문구 / 가정 / 미해결.
