# webgames

웹게임 모음사이트 — 설치·가입 없이 브라우저에서 바로 즐기는 웹게임 포털.

## 페이지 구조 (Vite 멀티엔트리 MPA)

| 경로 | 내용 | 엔트리 |
| --- | --- | --- |
| `/` | 포털 홈 (게임 목록, 광고 슬롯, 정책) | `index.html` → `src/home/` |
| `/games/forge/` | 전설의 검 강화하기 (Project Forge) | `games/forge/index.html` → `src/main.tsx` |

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # tsc + vite build → dist/
npm run preview  # 빌드 결과 미리보기
```

## 새 게임 추가 절차

1. `games/<게임id>/index.html` 엔트리 생성 (`games/forge/index.html` 참고 — 제목·메타만 교체)
2. 게임 코드는 `src/<게임id>/` 아래에 작성하고 엔트리 HTML에서 로드
3. `vite.config.ts`의 `build.rollupOptions.input`에 엔트리 등록
4. `src/home/games.ts`의 `GAMES` 배열에 카드 등록 (`status: 'live'`)

썸네일은 `public/assets/images/`에 WebP로 저장해 재사용한다.

## 참고

- Forge 게임 코드는 초기 구조 그대로 `src/` 루트(`App.tsx`, `components/`, `services/` 등)에 있다.
- 광고: 홈의 `.ad-slot`은 광고 네트워크(AdSense 등) 승인 후 실제 코드로 교체하는 placeholder다.
- 진행 기록은 `progress.md`, 게임 기획·계약은 `implementation_plan.md` 참고.
