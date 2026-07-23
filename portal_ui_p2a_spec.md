# UI 대개편 P2-A — 공통 디자인 토큰 + 바카라 현대화 (게임 로직 무수정)

## 0. 배경
가챠 개편(P1)에서 쓴 오버레이 방식이 검증됐다: 게임 스크립트를 건드리지 않고 뒤에 로드되는 CSS/JS로 덮는다. 이번에는 그 토큰을 공통 파일로 승격하고, 같은 방식으로 바카라를 현대화한다.

## 1. 변경 파일 (목록 밖 수정 금지)
- 신규: `public/hanpan-tokens.css` — 공통 디자인 토큰(아래 §2)
- 신규: `games/bakara/hanpan-ui.css`, 필요시 `games/bakara/hanpan-ui.js`
- 수정: `games/bakara/index.html` — 토큰·오버레이 로드 태그 + (필요시) Google Fonts link, **태그 추가만**
- 수정: `games/gacha/index.html`, `login.html`, `signup.html` — 토큰 링크 1줄 추가만
- 수정: `games/gacha/hanpan-ui.css` — 상단 `:root` 로컬 토큰 블록을 제거하고 공통 토큰 사용으로 전환(각 var에 기존 값 fallback 유지: `var(--hp-bg, #0f1117)` 형태)
- 절대 금지: `games/bakara/js/**`, `games/bakara/style.css`, 가챠 게임 스크립트, id/class 변경(이동만 허용)

## 2. 공통 토큰 (`public/hanpan-tokens.css`)
```css
:root {
  --hp-bg: #0f1117;
  --hp-surface: #171a22;
  --hp-surface-2: #1f2430;
  --hp-border: #2b3140;
  --hp-border-strong: #3a4356;
  --hp-text: #e8ecf4;
  --hp-muted: #98a1b3;
  --hp-faint: #6b7385;
  --hp-accent: #e9a44b;
  --hp-accent-2: #ff8a3d;
  --hp-danger: #e4604f;
  --hp-success: #4fc08d;
  --hp-radius: 14px;
  --hp-radius-sm: 10px;
  --hp-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
  --hp-font: 'Noto Sans KR', system-ui, -apple-system, sans-serif;
  --hp-font-display: 'Outfit', 'Noto Sans KR', system-ui, sans-serif;
}
```
주석으로 "포털 공통 토큰 — 게임 오버레이 CSS는 이 변수만 참조" 명시.

## 3. 바카라 현대화 계약
현재 문제: 전반적으로 구형 톤(밋밋한 네이비 카드·정리 안 된 헤더), 상단에 게스트/동기화/로그아웃 줄 + 로고 줄 + 아이콘 3개가 따로 놀고, 포털 복귀 버튼이 좌상단 요소와 겹칠 수 있음. 스코어보드가 빈 상자로 크게 자리 차지.

### 3.1 헤더
- 한 줄로 압축: 왼쪽 52px 이상 비움(포털 버튼 자리) → `♠ BACCARAT` 워드마크(Outfit, PREMIUM 배지는 워드마크 옆 소형 칩) → 오른쪽에 아이콘 버튼들(설정·통계·기록)과 계정 상태(게스트/동기화/로그아웃)를 정리. 계정 요소는 아이콘화하거나 우측 끝에 컴팩트하게. hanpan-ui.js로 요소 이동 허용(이동만, id/class 보존, 이벤트 유지).
- 모바일(≤480px)에서는 계정 텍스트 라벨 숨기고 아이콘만.

### 3.2 본문 카드
- 전 카드 공통: `--hp-surface` 배경, `--hp-border` 1px, `--hp-radius`, 내부 패딩 16~20px, 섹션 간 간격 16px.
- 스코어보드: 높이 축소(비었을 때 min-height 120px), 셀 그리드에 미세 보더, 하단 범례(플레이어/뱅커/타이)는 칩 스타일로.
- 대전 영역: DEALER 라벨·VS 타이포를 display 폰트로 정돈, 빈 상태 여백 축소.
- AI 참가자 카드 2개: 수평 정렬 유지하되 카드 스타일 통일.
- 배팅 영역: 보유 금액·현재 배팅을 상단 요약 바로, PLAYER/TIE/BANKER는 동일 크기 3열 카드(선택 상태는 `--hp-accent` 보더+글로우), 금액 버튼·수정 버튼 위계 정리(주 CTA 1개만 채움 스타일).
- 색은 바카라 정체성(펠트 그린 포인트, 플레이어 블루/뱅커 레드) 유지하되 배경·보더·타이포는 공통 토큰으로.

### 3.3 기타
- 터치 타겟 44px, `env(safe-area-inset-bottom)` 반영, 가로 오버플로 금지.
- 대상 요소가 없으면 조용히 스킵(다른 페이지 대비).

## 4. 수용 기준 (Claude가 직접 실행·브라우저 검증)
```
npm run build
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
- 390×844: 바카라 헤더 1줄, 포털 버튼 겹침 0, 가로 오버플로 0, 배팅 3열 카드.
- 가챠: 토큰 전환 후에도 P1 결과와 동일하게 보임(회귀 0).
- 배팅 클릭·금액 입력·게임 시작 등 기존 동작 무손상, 콘솔 오류 0.

## 5. 금지
게임 스크립트·기존 style.css 수정, 밸런스·문구 변경, 새 의존성, git 커밋/푸시, npm 빌드 실행(Claude 담당).

## 완료 보고 (30줄 이내): 변경 파일 / 헤더·배팅·스코어보드 처리 / 이동한 DOM 요소 / 가정 / 미해결.
