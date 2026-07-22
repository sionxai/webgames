# 《기다려, 멍!》 W1 스펙 — 시뮬 코어 (UI 없음)

기획 요지: 반려견 식분(배설물 섭취) 행동교정 생활 시뮬. 개는 상태·성격·**학습 메모리**로 행동을 유틸리티 점수 선택하며, 보호자(플레이어) 개입의 "무엇을 강화했는가"가 장기 행동을 바꾼다. W1은 헤드리스 엔진과 계약 검사만 구현한다.

## 1. 목표

`src/waitdog/`에 결정론적(시드 RNG) 시뮬 엔진을 구현하고, 계약 검사 스크립트가 전부 통과한다. 같은 시드 → 같은 하루 트레이스. UI·에셋·포털 등록은 이후 단계.

## 2. 변경 파일 (이 목록 밖 수정 금지)

- `src/waitdog/types.ts` — 공개 타입
- `src/waitdog/constants/balance.ts` — 모든 튜닝 상수 (매직넘버 금지, 전부 여기로)
- `src/waitdog/core/rng.ts` — mulberry32 시드 RNG
- `src/waitdog/services/waitdogSim.ts` — 엔진 (필요시 같은 폴더에 보조 모듈 분리 가능)
- `scripts/waitdog-contract.ts` — 계약 검사 (assert 실패 시 exit 1, 마지막 줄 `CONTRACT OK <n> assertions`)
- `tsconfig.waitdog-contract.json` — module:commonjs, outDir:`.waitdog-contract-dist`, include: 위 파일들
- `.gitignore` — `.waitdog-contract-dist/` 한 줄 추가만

## 3. 도메인 계약

### 3.1 시간·공간
- 틱=게임 1분. 하루 07:00~23:00(960분). `advanceMinutes(n)`.
- 방 3개: `living | kitchen | toilet`(배변구역). 인접: living↔kitchen, living↔toilet.
- 보호자 상태: `{room, focusLocked: boolean}` (회의·샤워 등은 W1에서 `setOwner()`로 외부 주입).
- 가시성: 개와 같은 방이며 focusLocked=false → `seen`, 인접 방 → `heard`, 그 외 `hidden`. 모든 이벤트는 기록하되 visibility 태그를 붙인다(UI 필터용).

### 3.2 개 상태 (전부 0..100, 클램프)
- 생리·정서 8종: `hunger, thirst, bowelPressure, fatigue, stress, excitement, boredom, comfort`
- 성격 5종(시드 생성 후 불변): `foodDrive, impulsivity, sensitivity, sociability, adaptability`
- 학습 메모리 9종: `approachSafety, recallTrust, nameSkill, waitSkill, matExpectation, coproHabit, snatchExpectation, hiddenPoopTendency, attentionViaPoop`
- 상황별 숙련: `matSkill: Record<RoomId, number>` + `matSkillOwnerAway: number` (일반화 계약: 훈련한 방만 오르고 타 방은 `GENERALIZE_RATE`(기본 0.25)배만 전이)

### 3.3 소화→배변 파이프라인 (랜덤 이벤트 금지, 인과 체인)
- `feed(volume)` → 소화 큐 push. 완료 시간 = `DIGEST_BASE(240분) ± DIGEST_VAR(60분, 시드)` − 산책 보정 − 활동 보정 + 스트레스 지연.
- 소화 완료분만큼 `bowelPressure` 상승. `PRESSURE_SIGNAL(70)` 도달 → 전조 신호 단계: `sniffFloor`, `circle`, `wander` 이벤트를 배변 전 10~25분 창에서 ≥2회 발생·기록.
- `PRESSURE_POOP(88)` → 장소 선택: 패드 확률 = f(패드 습관), 아니면 구석. `hiddenPoopTendency` 높고 보호자 가시 상태면 안 보이는 방 선호. → `poop` 이벤트, 압력 리셋.

### 3.4 배변 직후 결정 (6행동 유틸리티, argmax + 노이즈 ±6)
```
eatPoop   = .35*foodDrive + .30*hunger + .50*coproHabit + .40*snatchExpectation
            − .40*matExpectation − .30*waitSkill − (펜스로 차단 시 −1000)
moveToMat = .60*matSkill(현재 방; 보호자 부재 시 matSkillOwnerAway 사용) + .40*matExpectation
            + .25*approachSafety − .30*excitement − .25*stress
watchOwner= .50*attentionViaPoop + .30*sociability (보호자 hidden이면 −40)
flee      = .60*(100−approachSafety)·(보호자 seen일 때만) + .3*stress
sniffLeave= 45 + .30*comfort − .40*coproHabit   (기본 안정 행동)
zoomies   = .40*excitement + .30*boredom − .30*fatigue
```
- 판정 즉시 각 항 분해값을 `DecisionTrace`로 기록(테스트·후일 학습모드 UI용).
- eatPoop 선택 시: 먹기 완료까지 `EAT_DELAY`(기본 2분, `snatchExpectation`≥60이면 1분). 완료 전 개입 가능.

### 3.5 개입 API 7종 + 학습 규칙 (핵심)
`intervene(kind)` : `calmCall | matCommand | praise | treat | toyLure | block | scold` (+`cleanup`)
- 강화 귀속: 보상(`praise|treat`)은 **개의 직전 90초 내 행동**에 귀속된다.
  - 매트 위/이동 중 보상 → `matExpectation+6, matSkill(방)+5, coproHabit−3`
  - 배설물 접근·주시 중 보상 → `attentionViaPoop+7, coproHabit+2` (잘못된 타이밍!)
- `calmCall`: 성공률 = f(recallTrust, excitement). 성공 → 개 이동+`approachSafety+2`; 이후 60초 내 treat → `recallTrust+4`.
- `matCommand`: 성공률 = f(matSkill(방), stress). 성공 → 이동, 실패 → `matSkill(방)−1`.
- `scold`: 진행 중 행동 80% 중단, `excitement+15, stress+10`; 장기 `approachSafety−7, snatchExpectation+8, hiddenPoopTendency+5`.
- `toyLure`: 성공률 = f(boredom, foodDrive 역보정). 성공 시 주의 전환.
- `block`(펜스 토글): 즉시 차단만. **학습 수치 변화 없음**(환경≠학습 분리 계약).
- `cleanup`: 해당 배설물 제거(2분 점유). 학습 영향 없음.
- 보호자 `focusLocked` 중 개입 → `interrupted:true` 반환(비용 처리는 W2, W1은 플래그만).

### 3.6 관찰·예측
- `EventLog: {t, type, room, visibility, detail}[]` 전량 기록.
- `predictPoopWindow(): {start, end, confidence}` — 소화 큐+최근 이력 기반. confidence는 데이터 양에 비례.

### 3.7 API 형태
`createSim(seed, opts?) → WaitdogSim`: `advanceMinutes, feed, water, walk(분), play(분), setOwner, intervene, getDogView(관찰 가능 정보), getFullState(테스트 전용), getLog, predictPoopWindow, newDay()`.

## 4. 제약
- 새 의존성 금지. `Math.random`/`Date.now` 사용 금지(시드 RNG만). enum 금지(유니온 타입). 기존 파일(forge·home·package.json) 불수정.
- 모든 수치는 balance.ts 상수 경유. 상태값은 항상 0..100 클램프, NaN 발생 금지.

## 5. 수용 기준 (아래 커맨드가 그대로 통과해야 함)
```
npm run build
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
계약 검사 필수 assertion (≥25개, 시나리오는 헤드리스 다일 실행):
1. 결정성: 같은 시드 2회 실행 → 이벤트 로그 동일. 다른 시드 → 상이.
2. 인과: 07:30 feed → 배변은 +180~+360분 창 내 발생, 그 전 전조 신호 ≥2회 기록.
3. 예측: 시드 20개 반복 시 predictPoopWindow가 실제 배변 시각 포함 ≥70%.
4. scold 반복(5일, 배변마다): baseline 대비 `snatchExpectation·hiddenPoopTendency↑, approachSafety↓`, day5 eatPoop 점수 > day1.
5. 매트 훈련(5일, 매트 도착 직후 treat): day6 배변 10회 중 moveToMat 선택 ≥6회, `coproHabit` 하락.
6. 오귀속: 배설물 접근 중 treat 반복 → `attentionViaPoop↑` 및 접근 빈도 증가.
7. 차단 분리: 펜스 상시 → eatPoop 0회지만 matSkill·matExpectation 변화 없음.
8. 일반화: living에서만 매트 훈련 → matSkill.living ≫ matSkill.kitchen, OwnerAway는 더 낮음.
9. 범위: 임의 시드 3개×7일 실행 후 전 상태값 0..100·NaN 없음, 로그 시간 단조 증가.

## 6. 금지사항
- 스펙 밖 파일 수정, UI/DOM/Canvas 코드, README·implementation_plan 수정, git commit/push, dev 서버 실행.
- 계약 검사를 통과시키기 위한 하드코딩(시나리오 전용 분기 등) 금지 — 발견 시 반려.
- npm 크래시(SecItemCopyMatching -50/exit 139) 조우 시 1회 재시도 후 '검증 미실행'으로 보고하고 반환.

## 완료 보고 형식 (30줄 이내)
변경 파일 목록 / 계약 검사 실행 결과(마지막 10줄) / 구현 중 내린 해석·가정 / 미해결 사항.

---

# W2 스펙 — 메인 플레이 화면 (라이브 시뮬 UI)

## 1. 목표
W1 엔진을 구동하는 메인 플레이 화면 1개를 구현한다. `npm run dev` 후 `/games/waitdog/`에서 하루(07:00~23:00)를 배속 조절하며 플레이하고, 개입 8종을 실행할 수 있다.

## 2. 변경 파일 (목록 밖 수정 금지)
- 신규: `games/waitdog/index.html`(ko, 제목 "기다려, 멍! — WEBGAMES", forge 엔트리 참고), `src/waitdog/main.tsx`, `src/waitdog/App.tsx`, `src/waitdog/waitdog.css`, `src/waitdog/components/**`
- 수정: `vite.config.ts` — input에 `waitdog: 'games/waitdog/index.html'` 1줄만
- `src/waitdog/services/waitdogSim.ts` — **읽기 전용 view API 추가만 허용**(판정·학습 로직 수정 금지, 계약검사 계속 통과)

## 3. 화면 계약 (기획 §25 레이아웃)
- 상단바: Day n · 시계 · 배속(⏸/1x/2x/4x) · 보호자 위치와 focusLock 표시.
- 중앙 하우스 뷰(Canvas): 방 3개(living 크게, kitchen·toilet 작게), 개·보호자·배설물(비사실적 단순 아이콘)·매트·펜스 렌더.
- **정보 비대칭 계약(핵심)**: UI는 `getDogView()`만 사용한다(`getFullState` 사용 금지). `hidden` 상태의 방은 어둡게 가리고 개를 그리지 않는다(마지막 목격 위치에 '?' 마커). `heard`는 소리 아이콘만. focusLocked 중에는 하우스 뷰 전체를 반투명 가림 처리.
- 우측/하단 관찰 패널: 최근 이벤트를 관찰 문장으로 표시(가시성 필터 적용, 예: "바닥 냄새를 자주 확인합니다"). 숫자 수치 노출 금지(기획 §25.2 — 행동카드는 문장 우선).
- 개입 패널 8버튼: 부르기/매트/칭찬/간식/장난감/차단토글/큰소리/청소 — 각 버튼은 intervene() 호출, interrupted 반환 시 "집중 업무 중" 안내. 결과는 토스트가 아닌 관찰 패널 문장으로.
- 보호자 컨트롤: 방 이동(방 클릭), 업무 시작/종료(focusLock 토글), 산책(30분)·급식·급수 버튼.
- 틱 드라이버: 실시간 1초=게임 2분(1x). 2x/4x 배가, 일시정지. 배변 이벤트 발생 시 자동 1x 전환. `prefers-reduced-motion` 시 캔버스 애니메이션 최소화.
- 반응형: 900px+ 가로형(캔버스 좌·패널 우), 미만 세로 1열. 가로 오버플로 금지.

## 4. 제약
- 새 의존성 금지. forge·home 파일 불수정. 다크 테마 대신 밝은 톤(기획 §6: 밝고 유머러스) — 팔레트는 waitdog.css에 CSS 변수로.
- 하루 종료(23:00) 시 임시 오버레이("Day n 종료 — 하루 평가는 다음 단계") 표시 후 newDay() 진행 가능하면 충분(하루 평가 화면은 W3).

## 5. 수용 기준
```
npm run build   # dist/games/waitdog/index.html 산출 포함 exit 0
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
```
브라우저 수동 검증은 Claude가 수행한다(Codex는 빌드·타입·계약검사까지만).

## 6. 금지사항
- getFullState를 UI에서 호출, 시뮬 판정 로직·밸런스 상수 변경, 스펙 밖 파일 수정, git 커밋, dev 서버 백그라운드 상주 실행.

## 완료 보고 형식 (30줄 이내)
변경 파일 / 수용 커맨드 결과 마지막 5줄 / view API 추가 내역 / 해석·가정 / 미해결.
