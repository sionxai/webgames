# B2.5 스펙 — 카드 시스템 확장 (유형 4종 · 42장)

기획 근거: `bonpuri_spec.md`, `bonpuri_b1_spec.md`, `bonpuri_b2_spec.md`. 충돌 시 이 문서가 우선한다.

## 1. 목표

카드가 "피해 N / 넋 N" 스탯스틱뿐이라 전략이 없다. **카드 유형 4종과 유틸 프리미티브를 도입해 자원 경쟁과 빌드 선택을 만든다.** 보상 카드를 15종 → **42종**으로 확장한다.

B2의 5전투 미니런 구조는 그대로 두고, 그 안에서 굴러가는 카드만 바꾼다.

## 2. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `src/bonpuri/core/types.ts` | 수정 — §4 계약 확장 |
| `src/bonpuri/core/battle.ts` | 수정 — §4·§5 구현 |
| `src/bonpuri/content/cards.ts` | 수정 — 42종으로 교체 |
| `src/bonpuri/components/CardView.tsx` | 수정 — 유형 표시 |
| `src/bonpuri/components/BattleScreen.tsx` | 수정 — 장착 무구·좌정 표시 |
| `src/bonpuri/run/miniRun.ts` | 수정 — 보상 추첨 규칙(§8) |
| `scripts/verify-bonpuri-contract.ts` | 수정 — 검사 25~34 추가 |

**절대 손대지 말 것**: `src/bonpuri/data/*`, `src/bonpuri/core/rng.ts`, `src/bonpuri/core/cards.ts`(시작 덱 — B1 계약), `src/bonpuri/content/enemies.ts`, `ref/`, `dadadak/`, `games/`, `vite.config.ts`, `src/home/`, 기타 `src/`·`scripts/`.

> 시작 덱(신칼 5 / 넋가림 4 / 사설 풀기 1)은 **변경 금지**다. B1 계약 검사 1번이 이를 고정한다.

## 3. 카드 유형 계약

```ts
export type CardType = '신' | '무구' | '굿' | '좌정';
```

| 유형 | 규칙 | 사용 후 |
| --- | --- | --- |
| **신** | 제약 없음 | 버림더미 |
| **무구** | 장착. **동시 개수 제한 없음** | `equipped` 배열 (버림더미 아님) |
| **굿** | **턴당 1장만.** 이미 이번 턴에 굿을 냈으면 **거부**(fail-closed, 상태 무변경) | 버림더미 |
| **좌정** | **동시 1개.** 새로 내면 기존 좌정은 **소멸더미**로 | `installed` 슬롯 |

상태 확장:
```ts
export type BattleState = {
  // ... 기존 유지
  equipped: BattleCard[];          // 장착된 무구
  installed: BattleCard | null;    // 좌정 1개
  gutPlayedThisTurn: boolean;      // 이번 턴 굿 사용 여부
};
```

- `startBattle` 에서 `equipped = []`, `installed = null`, `gutPlayedThisTurn = false`
- `startPlayerTurn` 에서 `gutPlayedThisTurn = false` 로 리셋

## 4. 지속 효과(Passive)

```ts
export type Passive =
  | { kind: 'turnStart'; effects: Effect[] }                              // 매 턴 시작 시 발동
  | { kind: 'drawBonus'; amount: number }                                 // 턴당 드로우 +N
  | { kind: 'energyBonus'; amount: number }                               // 턴당 장단 +N
  | { kind: 'flatDamageBonus'; amount: number }                           // 주는 피해 +N
  | { kind: 'statusDamageBonus'; status: StatusKey; percent: number };    // 해당 상태 적에게 피해 +N%

export type BattleCard = {
  // ... 기존 유지
  cardType: CardType;
  passive?: Passive;               // 무구·좌정만 가진다
  bondGroup?: string;              // 본풀이 또는 신격 계열명 (기존 myth 대체)
  bond?: { perStack: number; applyTo: 'damage' | 'block' };
};
```

**`myth` 필드를 `bondGroup` 으로 이름만 바꾼다.** 값에 본풀이명뿐 아니라 신격 분류명(예: `저승차사`)도 넣을 수 있다 — 차사본풀이는 원본 데이터상 강림차사 1명뿐이라 본풀이만으로는 연계가 성립하지 않는다.

### 4.1 발동 시점 (순서 고정)

**플레이어 턴 시작** — B1 §5.3에 아래를 삽입한다:
1. `turn += 1`, `block = 0`
2. `energy = 3 + 신명 + Σ energyBonus`, 신명 = 0
3. `gutPlayedThisTurn = false`
4. **`installed` → `equipped` 순서로 `turnStart` passive 발동** (배열 순서대로)
5. 손패를 `5 + Σ drawBonus` 장까지 드로우

### 4.2 피해 공식 확장 (B1 §5.2 대체)

```
1) d = base + 정성 + Σ flatDamageBonus
2) 공격자 넋나감 > 0 → d = floor(d * 0.75)
3) 대상 액 > 0      → d = floor(d * 1.5)
4) statusDamageBonus: 대상이 해당 status > 0 이면 → d = floor(d * (1 + percent/100))
5) d < 0 → 0
6) 넋 흡수 → 명 감소
```

- `flatDamageBonus`·`statusDamageBonus` 는 **플레이어가 공격자일 때만** 적용한다 (적은 무구를 갖지 않는다)
- 각 곱셈 직후 즉시 `Math.floor` (B1 계약 유지)

## 5. 신규 효과 프리미티브 8종

```ts
| { kind: 'tutor'; cardType?: CardType; bondGroup?: string }   // 덱에서 조건 맞는 첫 카드를 손패로
| { kind: 'recover'; amount: number }                          // 버림더미에서 무작위 N장 손패로
| { kind: 'costReduction'; amount: number }                    // 이번 턴 남은 카드 비용 -N (최소 0)
| { kind: 'transferStatus'; status: StatusKey; target: 'enemy' }// 내 해당 상태 전부를 대상에게 옮김(내 것은 0)
| { kind: 'cleanse'; statuses: StatusKey[] }                    // 내 해당 상태들을 0으로
| { kind: 'blockToDamage'; percent: number; target: 'enemy' }   // floor(현재 넋 * percent/100)을 피해로. 넋은 소비하지 않는다
| { kind: 'cancelIntent'; target: 'enemy' }                     // 대상의 다음 의도를 건너뛰고 intentIndex를 1 진행
| { kind: 'duplicate' }                                         // 다음에 내는 카드 1장의 effects를 2회 적용
```

**결정성 요구**
- `tutor`: `drawPile` 을 **앞에서부터** 검색해 **첫 번째** 일치 카드를 꺼낸다. RNG 미사용
- `recover`: 셔플 없이 `discardPile` **뒤에서부터** N장 (최근 버린 것부터). RNG 미사용
- `duplicate`: 상태에 `duplicateNext: boolean` 를 두고, 다음 카드 사용 시 소비한다. 2회 적용 후 `false`
- `costReduction`: 상태에 `costReduction: number` 누적. 턴 시작 시 0으로 리셋. 카드 비용은 `max(0, cost - costReduction)`

## 6. 카드 42종

`bondGroup` 이 같은 카드끼리 연계가 쌓인다. **신격명은 `ref/korean_deities_300.json` 의 `record_name` 과 일치해야 한다.**

### 6.1 신 20종

| # | 이름 | bondGroup | cost | effects | bond |
| --- | --- | --- | --- | --- | --- |
| 1 | 자청비 | 세경본풀이 | 2 | damage 9 | damage +3 |
| 2 | 문도령 | 세경본풀이 | 1 | block 6 · 정성+1(self) | block +2 |
| 3 | 정수남 | 세경본풀이 | 1 | damage 5 | damage +3 |
| 4 | 강림차사 | 저승차사 | 3 | execute 0.3 / 15 | damage +5 |
| 5 | 일직차사 | 저승차사 | 1 | damage 6 | damage +2 |
| 6 | 월직차사 | 저승차사 | 1 | damage 4 · 액+1(enemy) | damage +2 |
| 7 | 저승사자 | 저승차사 | 2 | execute 0.25 / 8 | damage +3 |
| 8 | 천지왕 | 천지왕본풀이 | 3 | damage 8 (allEnemies) · 신명+1(self) | damage +2 |
| 9 | 대별왕 | 천지왕본풀이 | 3 | damage 10 (allEnemies) | damage +3 |
| 10 | 소별왕 | 천지왕본풀이 | 2 | damage 8 · 신명+1(self) | damage +3 |
| 11 | 제주 삼승할망 | 삼승할망본풀이 | 2 | heal 12 · block 8 | block +3 |
| 12 | 제주 구삼승할망 | 삼승할망본풀이 | 1 | 부정+2(enemy) · 부정+1(self) | — |
| 13 | 제주 칠성신 | 칠성본풀이 | 2 | gainEnergy 1 · draw 1 | — |
| 14 | 안칠성 | 칠성본풀이 | 1 | block 5 | block +3 |
| 15 | 밧칠성 | 칠성본풀이 | 1 | damage 5 | damage +3 |
| 16 | 녹디생인 | 문전본풀이 | 1 | block 8 | block +3 |
| 17 | 남선비 | 문전본풀이 | 1 | damage 4 · block 4 | damage +2 |
| 18 | 여산부인 | 문전본풀이 | 2 | heal 8 · block 6 | block +2 |
| 19 | 노일저대귀일의 딸 | 문전본풀이 | 2 | 부정+3(enemy) · 액+1(enemy) | — |
| 20 | 설문대할망 | — | 3 | damage 12 (allEnemies) | — |

### 6.2 무구 8종 (passive · 장착)

| # | 이름 | bondGroup | cost | passive |
| --- | --- | --- | --- | --- |
| 21 | 요령 | — | 1 | drawBonus 1 |
| 22 | 산판 | — | 2 | energyBonus 1 |
| 23 | 명두 | — | 1 | statusDamageBonus 액 30% |
| 24 | 물색 | — | 1 | turnStart: block 4 |
| 25 | 심방쾌자 | — | 2 | turnStart: heal 2 |
| 26 | 본맹두 | 초공본풀이 | 2 | turnStart: draw 1 |
| 27 | 신맹두 | 초공본풀이 | 2 | flatDamageBonus 3 |
| 28 | 삼맹두 | 초공본풀이 | 2 | turnStart: block 5 |

### 6.3 굿 8종 (턴당 1장)

| # | 이름 | cost | effects |
| --- | --- | --- | --- |
| 29 | 초감제 | 1 | tutor (cardType '신') |
| 30 | 시왕맞이 | 3 | cancelIntent · 액+3(enemy) |
| 31 | 귀양풀이 | 1 | transferStatus 부정 → enemy |
| 32 | 불도맞이 | 2 | cleanse [액, 넋나감, 부정] · heal 8 |
| 33 | 영등굿 | 1 | draw 3 · costReduction 1 |
| 34 | 요왕맞이 | 2 | recover 2 |
| 35 | 삼공맞이 | 2 | duplicate |
| 36 | 성주풀이 | 2 | blockToDamage 150% |

### 6.4 좌정 6종 (동시 1개 · passive)

| # | 이름 | bondGroup | cost | passive |
| --- | --- | --- | --- | --- |
| 37 | 제주 문전신 | 문전본풀이 | 2 | turnStart: block 6 |
| 38 | 제주 조왕신 | 문전본풀이 | 2 | turnStart: heal 3 |
| 39 | 제주 측간신 | 문전본풀이 | 2 | turnStart: 부정+1 (allEnemies) |
| 40 | 제주 주목지신 | 문전본풀이 | 1 | turnStart: block 3 |
| 41 | 성주신 | — | 3 | turnStart: block 4 · draw 1 |
| 42 | 터주신 | — | 2 | turnStart: 정성+1 (self) |

> 문전본풀이는 신 4장 + 좌정 4장 = **8장짜리 최대 아키타입**이다. 좌정은 동시 1개지만 **내는 순간 연계 스택이 쌓이므로** 이후 문전 신 카드가 강해진다.

## 7. UI 요구

- 카드에 **유형 배지**(신·무구·굿·좌정)를 표시한다. 유형별로 프레임 색을 구분한다
- 전투 화면에 **장착된 무구 목록**과 **좌정 1개**를 상시 표시한다 (이름 + 효과 요약)
- 이번 턴 굿을 이미 썼으면 손패의 굿 카드를 **사용 불가로 회색 처리**한다
- 좌정 카드를 낼 때 기존 좌정이 있으면 **교체됨을 카드에 명시**한다
- `costReduction` 적용 중이면 손패 카드의 비용을 **감소된 값으로 표시**한다
- 모바일 375px에서 가로 스크롤이 생기면 안 된다

## 8. 보상 추첨 규칙 (연계 발동률 확보)

B2에서 연계가 한 런에 한 번도 안 터질 수 있었다. 아래로 교체한다.

- 보상 3장 중 **최소 1장은 이미 덱에 있는 `bondGroup` 에서** 뽑는다 (해당 그룹에 미보유 카드가 남아 있을 때)
- 나머지 2장은 전체 42종에서 무작위 (중복 없음)
- 덱에 `bondGroup` 보유 카드가 없으면 3장 모두 무작위

## 9. 수용 기준

```
npm run bonpuri:contract
npx tsc --noEmit
npm run build
```

세 커맨드 모두 exit 0. **기존 검사 1~24는 그대로 통과해야 한다.** 아래를 추가한다.

| # | 검사 |
| --- | --- |
| 25 | 카드 42종이 §6 표의 이름·유형·비용·효과·passive·bond와 정확히 일치 |
| 26 | 굿을 턴당 2장째 내면 **완전 거부**(깊은 동등), 다음 턴엔 다시 사용 가능 |
| 27 | 좌정을 새로 내면 기존 좌정이 소멸더미로 가고 `installed` 가 교체됨 |
| 28 | 무구는 사용 후 `equipped` 에 있고 버림·소멸 더미에 없음 |
| 29 | `turnStart` passive가 `installed` → `equipped` 순서로 턴 시작마다 발동 |
| 30 | `drawBonus`·`energyBonus` 가 턴 시작 드로우·장단에 반영 |
| 31 | `flatDamageBonus`·`statusDamageBonus` 가 §4.2 순서대로 적용 (각 곱셈 후 floor) |
| 32 | `tutor`·`recover` 가 RNG를 소비하지 않음 (`rngCalls` 불변) |
| 33 | `duplicate` 가 다음 카드 1장만 2회 적용하고 소비됨 |
| 34 | `transferStatus`·`cleanse`·`blockToDamage`·`cancelIntent`·`costReduction` 각각 명세대로 동작 |
| 35 | 보상 3장 중 최소 1장이 덱 보유 `bondGroup` 에서 나옴 (해당 그룹 미보유 카드가 있을 때) |

## 10. 금지사항

- 시작 덱(`core/cards.ts`) 변경 — B1 계약
- `src/bonpuri/data/*`·`content/enemies.ts` 수정
- **데이터에 없는 신격명 창작** — §6의 이름은 전부 `ref/korean_deities_300.json` 에 실재한다. 확인 없이 추가하지 마라
- 새 의존성 추가
- 이미지 파일 생성·참조
- `localStorage` 등 영속화
- §6 수치의 임의 조정 — 이상해 보여도 표대로 구현하고 완료 보고에 의견을 적어라
- 검사 완화·삭제·skip
- 목록 밖 파일 수정

## 11. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 3개 실행 결과 (마지막 5줄씩)
3. 기대값과 어긋난 항목 (수정하지 말고 그대로 보고)
4. **플레이해보고 느낀 밸런스·복잡도 문제** (수치는 고치지 말고 의견만)
5. 해석·가정한 부분
6. 미해결 항목
