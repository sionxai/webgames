# B2 스펙 — 플레이 가능한 수직 슬라이스 (재미 판정용)

기획 근거: `bonpuri_spec.md`, `bonpuri_b1_spec.md`. 충돌 시 이 문서가 우선한다.

## 1. 목표

**"이 게임이 재미있는가"에 답할 수 있는 최소 플레이 단위**를 만든다. 브라우저에서 5전투 미니런을 처음부터 끝까지 플레이할 수 있어야 한다.

300종 카드 매핑·아트 생성·맵·저장은 범위 밖이다. **카드 아트는 플레이스홀더**(오방색 프레임 + 텍스트)로 한다 — 효과가 바뀌면 아트도 버려야 하므로 지금 그리지 않는다.

## 2. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `games/bonpuri/index.html` | 신규 — Vite 엔트리 |
| `src/bonpuri/main.tsx` | 신규 — React 마운트 |
| `src/bonpuri/App.tsx` | 신규 — 화면 전환 |
| `src/bonpuri/bonpuri.css` | 신규 — 스타일 |
| `src/bonpuri/content/cards.ts` | 신규 — 예시 카드 15종 (§5) |
| `src/bonpuri/content/enemies.ts` | 신규 — 적 5종 (§6) |
| `src/bonpuri/run/miniRun.ts` | 신규 — 미니런 상태 기계 |
| `src/bonpuri/components/*.tsx` | 신규 — 화면 컴포넌트 |
| `src/bonpuri/core/types.ts` | **수정** — §4 계약 확장 |
| `src/bonpuri/core/battle.ts` | **수정** — §4 계약 구현 |
| `scripts/verify-bonpuri-contract.ts` | **수정** — 검사 19~22 추가 |
| `vite.config.ts` | `input` 에 `bonpuri` 1줄 추가만 |

**절대 손대지 말 것**: `src/bonpuri/data/*`(B0 산출물), `src/bonpuri/core/rng.ts`, `ref/`, `dadadak/`, `games/forge/`, `games/waitdog/`, `src/home/`, `src/services/`, `src/waitdog/`, 기존 `scripts/*`.

`src/home/games.ts` **포털 카드는 등록하지 않는다** — 재미가 검증되기 전에는 노출하지 않는다.

## 3. 기술 제약

- React 18 + TypeScript strict. 프로젝트 기존 스타일을 따른다
- **새 의존성 추가 금지.** 상태 관리 라이브러리 금지 — `useState`/`useReducer` 로 충분하다
- **모바일 세로 우선.** 최소 360px 폭에서 가로 스크롤이 생기면 안 된다
- `localStorage` 사용 금지 (B3 범위). 새로고침하면 처음부터 시작한다
- `Math.random`·`Date.now` 는 **엔진 밖 UI 계층에서만** 허용한다. RNG는 `App` 최상단에서 1개 만들어 주입한다
- 기존 B1 계약(순수 함수, 피해 공식, 상태이상)을 깨지 않는다

## 4. 코어 계약 확장

### 4.1 연계(緣) — 이 게임의 시그니처 메커니즘

```ts
export type BattleCard = {
  // ... 기존 필드 유지
  myth?: string;                                   // 본풀이 사이클명
  bond?: { perStack: number; applyTo: 'damage' | 'block' };
};

export type BattleState = {
  // ... 기존 필드 유지
  playedMyths: Record<string, number>;             // 이번 전투에서 낸 카드의 myth별 누적
};
```

**적용 순서 (고정)**
1. `stacks = state.playedMyths[card.myth] ?? 0`
2. `bonus = card.bond.perStack * stacks`
3. 카드 `effects` 중 **첫 번째** `applyTo` 종류 효과의 `amount` 에 `bonus` 를 더해 적용한다. 해당 종류 효과가 없으면 보너스는 버려진다
   - `applyTo: 'damage'` 에 해당하는 효과는 `damage` **와 `execute`** 다. `execute` 의 경우 보너스는 `amount`(처형에 실패했을 때의 피해)에 더해지며, **즉사 임계값 `threshold` 에는 영향을 주지 않는다**
   - `applyTo: 'block'` 에 해당하는 효과는 `block` 이다
4. 효과를 전부 적용한 뒤 `myth` 가 있으면 `playedMyths[card.myth] += 1`

→ 같은 본풀이 **첫 장은 +0**, 두 번째가 `+perStack`, 세 번째가 `+2×perStack`.

`startBattle` 시 `playedMyths = {}` 로 초기화한다.

### 4.2 처형 효과

```ts
| { kind: 'execute'; threshold: number; amount: number; target: 'enemy' }
```

대상의 `hp <= floor(maxHp * threshold)` 이면 `hp = 0`. 아니면 `amount` 를 §5.2 피해 공식으로 적용한다. 즉사는 넋을 무시하고 피해 공식을 타지 않는다.

`execute` 는 단일 대상 효과이므로 B1 §5.3 2-1(유효 대상 없으면 거부) 대상에 포함된다.

## 5. 예시 카드 15종

시작 덱은 B1 그대로(신칼 5 / 넋가림 4 / 사설 풀기 1). 아래는 **보상으로 획득**하는 카드다.

| # | 이름 | myth | cost | effects | bond |
| --- | --- | --- | --- | --- | --- |
| 1 | 자청비 | 세경본풀이 | 2 | damage 9 (enemy) | damage +3 |
| 2 | 문도령 | 세경본풀이 | 1 | block 6 · 정성 +1 (self) | block +2 |
| 3 | 정수남 | 세경본풀이 | 1 | damage 5 (enemy) | damage +3 |
| 4 | 제주 문전신 | 문전본풀이 | 1 | block 10 | block +3 |
| 5 | 제주 조왕신 | 문전본풀이 | 1 | heal 5 · block 4 | block +2 |
| 6 | 제주 측간신 | 문전본풀이 | 1 | 부정 +3 (enemy) | — |
| 7 | 강림차사 | 차사본풀이 | 3 | **execute** threshold 0.3 / amount 15 (enemy) | damage +5 |
| 8 | 제주 맹감신 | 맹감본풀이 | 1 | 액 +2 (enemy) | — |
| 9 | 제주 삼승할망 | 삼승할망본풀이 | 2 | heal 12 · block 8 | block +3 |
| 10 | 지장아기 | 지장본풀이 | 1 | 부정 +2 (enemy) · draw 1 | — |
| 11 | 대별상마누라 | 삼승할망본풀이 | 2 | 부정 +2 (allEnemies) | — |
| 12 | 대별왕 | 천지왕본풀이 | 3 | damage 10 (allEnemies) | damage +3 |
| 13 | 소별왕 | 천지왕본풀이 | 2 | damage 8 (enemy) · 신명 +1 (self) | damage +3 |
| 14 | 설문대할망 | — | 3 | damage 12 (allEnemies) | — |
| 15 | 영등할망 | — | 1 | draw 3 | — |

신격 이름은 `ref/korean_deities_300.json` 의 `record_name` 과 일치시킨다. **효과 수치는 이 표가 최종이다** — 임의로 조정하지 마라.

## 6. 적 5종 (등장 순서 고정)

| 순서 | 이름 | hp | intents (순환) |
| --- | --- | --- | --- |
| 1 | 잡귀 | 22 | attack 7 → block 5 |
| 2 | 물귀신 | 28 | attack 5 → 넋나감 +1 → attack 9 |
| 3 | 제주 영감신 | 34 | attack 11 → 부정 +2 |
| 4 | 굴뱀 | 45 | attack 6 → 액 +2 → attack 14 |
| 5 | **제주 구삼승할망** (보스) | 70 | 부정 +3 → attack 12 → block 10 → attack 18 |

각 전투는 **적 1체**다. 다중 적은 B3 범위.

## 7. 미니런 규칙

- 플레이어 명은 **전투 간 유지**된다 (전투 시작마다 회복하지 않는다)
- 덱은 전투 간 유지되며, 각 전투 시작 시 셔플한다
- 전투 승리 시 **보상 화면**: 15종 중 **무작위 3장** 제시
  - 1장 선택 → 덱에 추가
  - **또는 건너뛰기 → 명 10 회복** (최대 명 초과 불가)
- 5전투를 모두 이기면 **승리 화면**, 도중 명 0이면 **패배 화면**
- 승리·패배 화면에서 처음부터 다시 시작 가능

> 보상의 "카드 추가 vs 회복" 선택이 이 슬라이스의 핵심 결정이다. 덱 성장과 생존을 맞바꾸게 한다.

## 8. 화면 계약

### 8.1 전투 화면 (필수 표시 요소)

- 플레이어: **명 / 최대 명**, 넋, 장단(현재/최대), 상태이상 5종(0이면 숨김)
- 적: 이름, **명 / 최대 명**, 넋, 상태이상, **다음 의도**(공격이면 예상 피해 수치까지)
- 손패: 카드별 이름·비용·효과 텍스트. **연계 보너스가 적용될 값을 미리 반영해 표시**한다
- 덱·버림·소멸 더미 장수
- 진행 표시: `n / 5 전투`
- 턴 종료 버튼

### 8.2 조작

- 카드 클릭 → 사용. 적이 1체뿐이므로 **대상은 자동 지정**한다
- 장단 부족·사용 불가 카드는 시각적으로 구분하고 클릭해도 아무 일도 일어나지 않는다
- 턴 종료 → 적 행동 → 다음 턴

### 8.3 플레이스홀더 아트

- 카드는 **오방색(청·적·황·백·흑) 프레임 + 텍스트**로만 그린다
- 이미지 파일을 만들거나 참조하지 않는다
- 계열·격에 따라 프레임 색을 다르게 하는 정도는 허용

## 9. 수용 기준

```
npm run bonpuri:contract
npx tsc --noEmit
npm run build
```

세 커맨드가 모두 exit 0 이어야 한다. `bonpuri:contract` 에 아래 검사를 **추가**한다 (기존 18개는 그대로 통과해야 한다).

| # | 검사 |
| --- | --- |
| 19 | 같은 myth 카드를 연속으로 낼 때 첫 장 보너스 0, 두 번째 `+perStack`, 세 번째 `+2×perStack` |
| 20 | `bond.applyTo` 에 해당하는 효과가 없는 카드는 보너스가 적용되지 않고 오류도 나지 않음 |
| 21 | `execute`: 대상 hp가 `floor(maxHp*threshold)` 이하면 즉사(넋 무시), 초과면 `amount` 가 피해 공식대로 적용 |
| 21-1 | `execute` 카드의 `bond` 보너스가 `amount` 에 적용되고 `threshold` 는 변하지 않음 (강림차사가 죽은 필드가 아님을 보장) |
| 22 | `startBattle` 이 `playedMyths` 를 `{}` 로 초기화 |
| 23 | 예시 카드 15종과 적 5종이 §5·§6 표의 수치와 정확히 일치 |

## 10. 금지사항

- `src/bonpuri/data/*` 수정, 300종 → BattleCard 매핑 구현
- 이미지 파일 생성·참조
- `localStorage` 등 영속화
- 새 의존성 추가
- `src/home/games.ts` 포털 카드 등록
- §5·§6 수치의 임의 조정 — **밸런스가 이상하다고 느껴도 표대로 구현하고 완료 보고에 의견을 적어라**
- 검사 항목 완화·삭제·skip
- 목록 밖 파일 수정

## 11. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 3개의 실행 결과 (마지막 5줄씩)
3. 기대값과 어긋난 항목 (수정하지 말고 그대로 보고)
4. **플레이해보고 느낀 밸런스 문제** (수치는 고치지 말고 의견만)
5. 해석·가정한 부분
6. 미해결 항목
