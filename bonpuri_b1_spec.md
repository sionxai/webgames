# B1 스펙 — 본풀이 전투 코어 (UI 없음)

기획 근거: `bonpuri_spec.md` §4, §15. 충돌 시 이 문서가 우선한다.

## 1. 목표

렌더링 없이 완결되는 **순수 전투 엔진**을 만든다. 작업이 끝나면 `npm run bonpuri:contract`가 §7의 계약 검사를 전부 통과한다. UI·저장·300종 카드 효과 매핑은 이 작업 범위가 아니다.

## 2. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `src/bonpuri/core/types.ts` | 신규 — 전투 상태·효과 타입 |
| `src/bonpuri/core/rng.ts` | 신규 — 주입 가능 RNG, 셔플 |
| `src/bonpuri/core/cards.ts` | 신규 — 시작 덱 정의 |
| `src/bonpuri/core/enemies.ts` | 신규 — 테스트용 적 정의 |
| `src/bonpuri/core/battle.ts` | 신규 — 전투 엔진 |
| `scripts/verify-bonpuri-contract.ts` | 신규 — 계약 검사 |
| `package.json` | `scripts`에 `bonpuri:contract` 1줄 추가만 |

**절대 손대지 말 것**: `src/bonpuri/data/*` (B0 산출물), `ref/`, `dadadak/`, `games/`, `src/` 의 다른 하위 디렉토리, `vite.config.ts`, 기존 `scripts/*`.

## 3. 설계 원칙

- **순수 함수.** 모든 엔진 함수는 새 상태를 반환하고 **입력 상태를 변형하지 않는다.** 테스트가 깊은 동등 비교로 불변성을 검사한다
- **RNG 주입.** 엔진은 전역 난수를 쓰지 않는다. `Math.random`·`Date.now` 사용 금지
- 정수 연산. 명·넋·장단·상태이상 수치는 모두 정수이며 **0 미만으로 내려가지 않는다**
- B0의 `BonpuriCard`(300종)와 **결합하지 않는다.** B1은 자체 `BattleCard`만 다룬다. 300종 → BattleCard 매핑은 후속 단계다

## 4. 상태·타입 계약

```ts
export type StatusKey = '액' | '넋나감' | '부정' | '정성' | '신명';
export type Statuses = Record<StatusKey, number>;   // 전부 0 이상 정수

export type Combatant = {
  id: string;
  name: string;
  hp: number;          // 명
  maxHp: number;
  block: number;       // 넋
  statuses: Statuses;
};

export type EffectTarget = 'self' | 'enemy' | 'allEnemies';

export type Effect =
  | { kind: 'damage'; amount: number; target: 'enemy' | 'allEnemies' }
  | { kind: 'block'; amount: number }                                        // 자신에게 넋
  | { kind: 'draw'; amount: number }
  | { kind: 'gainEnergy'; amount: number }                                   // 장단
  | { kind: 'heal'; amount: number }                                         // 명
  | { kind: 'applyStatus'; status: StatusKey; amount: number; target: EffectTarget };

export type BattleCard = {
  id: string;
  name: string;
  cost: number;        // 장단
  effects: Effect[];
  exhaust: boolean;    // true면 사용 후 소멸(버림더미로 가지 않음)
};

export type Intent =
  | { kind: 'attack'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'applyStatus'; status: StatusKey; amount: number };

export type Enemy = Combatant & {
  intents: Intent[];      // 순환 큐. 매 적 턴 index 순서로 실행 후 다음으로
  intentIndex: number;
};

export type Phase = 'playerTurn' | 'enemyTurn' | 'won' | 'lost';

export type BattleState = {
  player: Combatant;
  enemies: Enemy[];
  energy: number;         // 장단
  hand: BattleCard[];
  drawPile: BattleCard[];
  discardPile: BattleCard[];
  exhaustPile: BattleCard[];
  phase: Phase;
  turn: number;           // 1부터
  rngCalls: number;       // 소비한 RNG 호출 수 (결정성 검사용)
};
```

## 5. 규칙 계약 (순서 고정)

### 5.1 상수

| 항목 | 값 |
| --- | --- |
| 시작 명 | 70 |
| 턴당 장단 | 3 |
| 턴당 드로우 | 5 |

### 5.2 피해 계산 — **이 순서를 그대로 지킬 것**

공격자 A가 대상 T에게 기본 피해 `base`를 줄 때:

```
1) d = base + A.statuses.정성
2) A에게 넋나감 > 0 이면  d = floor(d * 0.75)
3) T에게 액     > 0 이면  d = floor(d * 1.5)
4) d < 0 이면 d = 0
5) 넋 흡수:  absorbed = min(T.block, d)
             T.block -= absorbed
             d -= absorbed
6) T.hp -= d   (0 미만이면 0)
```

**각 곱셈 직후 즉시 `Math.floor`** 한다. 마지막에 한 번만 내림하지 않는다.

`부정` 피해는 이 공식을 타지 않는다 — **넋을 무시하고 명에 직접** 적용한다(§5.4).

### 5.3 턴 진행

**전투 시작 `startBattle`**
1. 플레이어 명 = 70, 넋 = 0, 상태이상 전부 0
2. 장단 = 0, 손패·버림·소멸 더미 비움
3. 시작 덱을 셔플해 `drawPile` 구성
4. `turn = 0`, phase = `'playerTurn'` 로 두고 즉시 §5.3 플레이어 턴 시작을 1회 수행

**플레이어 턴 시작**
1. `turn += 1`
2. 플레이어 `block = 0` (무조건 소멸)
3. `energy = 3 + player.statuses.신명`, 그 뒤 `신명 = 0`
4. 손패가 5장이 될 때까지 드로우 (§5.5)

**카드 사용 `playCard(state, handIndex, targetEnemyId?)`**
1. phase가 `'playerTurn'` 이 아니면 **거부**
2. `card.cost > energy` 이면 **거부** — 상태를 어떤 방식으로도 바꾸지 않고 입력과 깊은 동등한 상태를 반환한다
2-1. 카드에 단일 대상(`target: 'enemy'`) 효과가 있는데 `targetEnemyId` 와 일치하는 **살아있는** 적이 없으면 **거부** (장단만 소모되고 효과가 사라지는 것을 막는다 — fail-closed)
3. `energy -= card.cost`
4. 손패에서 카드 제거
5. `effects` 를 **배열 순서대로** 적용
6. `exhaust` 면 `exhaustPile`, 아니면 `discardPile` 로
7. 매 피해 적용 직후 승패 판정 (§5.6)

**플레이어 턴 종료 `endTurn`**
1. 손패 전부 `discardPile` 로 (순서 유지)
2. 플레이어 부정 정산 (§5.4)
3. 플레이어 상태이상 감소 (§5.4)
4. phase = `'enemyTurn'`, 이어서 적 턴을 즉시 수행
5. 적 턴이 끝나면 플레이어 턴 시작(위)을 수행하고 phase = `'playerTurn'`

**적 턴**
- 살아있는 적을 `enemies` 배열 순서대로 처리한다. 각 적에 대해:
  1. `block = 0`
  2. `intents[intentIndex]` 실행 (attack이면 §5.2로 플레이어를 침, block이면 자기 넋, applyStatus면 플레이어에게 부여)
  3. `intentIndex = (intentIndex + 1) % intents.length`
  4. 부정 정산 → 상태이상 감소 (§5.4)
- 매 피해 직후 승패 판정

### 5.4 상태이상

| 상태 | 효과 | 턴 종료 시 |
| --- | --- | --- |
| **액** | 받는 피해 ×1.5 (§5.2) | −1 |
| **넋나감** | 주는 피해 ×0.75 (§5.2) | −1 |
| **부정** | 턴 종료 시 **N만큼 명 직접 감소(넋 무시)** | 피해 적용 **후** −1 |
| **정성** | 주는 피해 +N (§5.2) | **감소하지 않음** |
| **신명** | 다음 턴 장단 +N | 턴 시작 시 소비되어 0 |

- 감소는 **정확히 1**이며 0 미만이 되지 않는다
- `applyStatus` 로 부여 시 기존 값에 **가산**한다

### 5.5 드로우

`drawPile` 이 비면 `discardPile` 전체를 셔플해 `drawPile` 로 옮긴 뒤 계속 뽑는다.
둘 다 비어 있으면 **그 시점에서 드로우를 중단**한다 (손패가 5장 미만이어도 정상).

### 5.6 승패

- 모든 적의 `hp <= 0` → phase = `'won'`, 즉시 진행 중단
- 플레이어 `hp <= 0` → phase = `'lost'`, 즉시 진행 중단
- 판정은 **피해가 적용된 직후마다** 한다

### 5.7 RNG

```ts
export type Rng = () => number;   // [0, 1)
```

- 셔플은 Fisher–Yates 하강 루프이며, 길이 `n` 배열에 대해 **정확히 `n - 1` 회** RNG를 호출한다 (`n <= 1` 이면 0회)
- 호출할 때마다 `state.rngCalls += 1`
- 엔진 어디서도 `Math.random`·`Date.now` 를 쓰지 않는다

## 6. 시작 덱 (10장)

| 카드 | id | cost | effects | exhaust | 매수 |
| --- | --- | --- | --- | --- | --- |
| 신칼 | `sinkal` | 1 | `[{kind:'damage', amount:6, target:'enemy'}]` | false | 5 |
| 넋가림 | `neokgarim` | 1 | `[{kind:'block', amount:5}]` | false | 4 |
| 사설 풀기 | `saseol` | 0 | `[{kind:'draw', amount:2}]` | **true** | 1 |

각 사본은 고유 인스턴스 id를 가져야 한다(`sinkal#0` 형식 등 자유). 계약 검사는 **카드 이름별 매수**만 본다.

## 7. 수용 기준

```
npm run bonpuri:contract
npx tsc --noEmit
```

`bonpuri:contract` 는 아래를 모두 검사하고, 하나라도 실패하면 non-zero 로 종료한다. 각 검사는 통과/실패를 개별 출력한다.

| # | 검사 |
| --- | --- |
| 1 | 시작 덱이 신칼 5 / 넋가림 4 / 사설 풀기 1, 총 10장 |
| 2 | 전투 시작 후 손패 5장, `drawPile` 5장, 장단 3, 명 70, 넋 0 |
| 3 | 턴 시작 시 넋이 **무조건 0** (전 턴에 넋 20을 쌓아도 0) |
| 4 | 신명 2를 부여하고 턴을 시작하면 장단 = 5, 그리고 신명 = 0 |
| 5 | 장단 부족 시 `playCard` 가 거부하고, 반환 상태가 입력과 **깊은 동등** |
| 6 | 피해 공식: 정성 3 + 넋나감 + 대상 액 상태에서 신칼(6) → `floor(floor(9*0.75)*1.5)` = 9 |
| 7 | 넋 흡수: 넋 4인 대상에게 피해 6 → 넋 0, 명 −2 |
| 8 | 부정 3인 상태로 턴 종료 → 명 −3 (넋이 10 있어도 넋 불변), 이후 부정 = 2 |
| 9 | 액·넋나감·부정이 턴당 정확히 1 감소하고 0 미만이 되지 않음 |
| 10 | 정성은 턴이 지나도 감소하지 않음 |
| 11 | 소멸 카드(사설 풀기) 사용 후 `exhaustPile` 에 있고 `discardPile` 에 없음 |
| 12 | `drawPile` 소진 시 `discardPile` 을 셔플해 보충하고, 양쪽 모두 비면 드로우를 중단 |
| 13 | 셔플이 길이 n 배열에 정확히 n−1 회 RNG 호출 (`rngCalls` 로 확인) |
| 14 | 같은 시드 RNG로 동일 입력 → 동일 최종 상태 (JSON 직렬화 동등) |
| 15 | 모든 엔진 함수가 입력 `BattleState` 를 변형하지 않음 (호출 전후 깊은 동등) |
| 16 | 적 명이 0 이하가 되는 순간 phase = `'won'`, 플레이어 명 0 이하면 `'lost'` |
| 17 | 명·넋·장단·상태이상이 어떤 경로로도 음수가 되지 않음 |
| 18 | 단일 대상 카드를 대상 미지정 또는 죽은 적 지정으로 내면 **완전 거부**(깊은 동등), 정상 대상이면 적용 |

## 8. 금지사항

- UI·컴포넌트·React·DOM 코드 작성
- `localStorage`·파일 저장 등 영속화 (B3 범위)
- `src/bonpuri/data/*` 수정 또는 300종 카드 → BattleCard 매핑 구현 (후속 단계)
- `Math.random`·`Date.now` 사용
- 새 의존성 추가
- 검사 항목 완화·삭제·skip. 기대값이 실제와 다르면 **스크립트를 고치지 말고 보고**하라
- 목록 밖 파일 수정

## 9. 범위 이동 고지

기획 §15 B1에 있던 **"저장 실패 시 메모리 상태를 진행시키지 않음(fail-closed)"** 은 B1에 영속화가 없으므로 **B3로 옮긴다.** 누락이 아니라 이동이다.

## 10. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 2개의 실행 결과 (마지막 5줄씩)
3. 기대값과 실제가 어긋난 항목 (있다면 수정하지 말고 그대로 보고)
4. 해석·가정한 부분
5. 미해결 항목
