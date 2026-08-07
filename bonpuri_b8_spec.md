# B8 스펙 — 승천(昇天) 체계 + 난이도 스윕

근거: `bonpuri_system.md` §7 문제 ①⑥, StS2 Ascension 벤치마킹. 충돌 시 이 문서가 우선한다.

## 1. 목표

**난이도 축을 만든다.** 현재 `defensive+정화` 기준 5개 덱이 클리어율 100%, 잔여 명 44~62(최대 70)라 어떤 보상 설계도 의미를 갖지 못한다.

그리고 **시뮬레이터로 승천 단계별 실제 클리어율을 측정**해, 목표 난이도가 나오는 지점을 찾는다.

**이번 단계는 게임 로직과 측정까지다.** UI·저장·해금은 B9로 미룬다.

## 2. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `src/bonpuri/content/ascension.ts` | 신규 — 승천 수식어 정의 |
| `src/bonpuri/run/miniRun.ts` | 수정 — 승천 적용 |
| `scripts/simulate-bonpuri.ts` | 수정 — `--ascension` · `--sweep` |
| `scripts/verify-bonpuri-contract.ts` | 수정 — 검사 추가 |

**절대 손대지 말 것**: `src/bonpuri/core/*`(엔진 계약), `content/cards.ts`, `content/enemies.ts`(원본 적 수치는 불변), `data/*`, `services/*`, `components/*`, `ref/`, `dadadak/`, `games/`, `vite.config.ts`.

> **엔진을 건드리지 않는 이유**: 승천은 `miniRun` 에서 적 배열의 **변형된 사본**을 만들어 `startBattle` 에 넘기면 된다. 시작 명은 `startBattle(enemies, rng, deck, playerHp)` 의 기존 파라미터로 조정한다. `core/*` 를 수정하면 계약 검사 57개가 위험해진다.

## 3. 승천 수식어 계약

```ts
export type AscensionModifier = {
  enemyDamageMultiplier: number;   // 적 attack 의도 피해 배율
  enemyHpMultiplier: number;       // 적 명·최대 명 배율
  startingHp: number;              // 플레이어 시작 명
  purifyHeal: number;              // 정화 보상 회복량
  bossOpeningAffliction: number;   // 보스 전투 시작 시 플레이어에게 부여할 액 (0이면 없음)
};
```

### 3.1 단계별 값 (누적이 아니라 **각 단계의 최종값**을 표로 고정한다)

| 승천 | 적 피해 배율 | 적 명 배율 | 시작 명 | 정화 회복 | 보스 개시 액 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1.00 | 1.00 | 70 | 8 | 0 |
| 1 | 1.15 | 1.00 | 70 | 8 | 0 |
| 2 | 1.15 | 1.00 | 65 | 8 | 0 |
| 3 | 1.15 | 1.15 | 65 | 8 | 0 |
| 4 | 1.15 | 1.15 | 65 | 6 | 0 |
| 5 | 1.30 | 1.15 | 65 | 6 | 0 |
| 6 | 1.30 | 1.15 | 60 | 6 | 0 |
| 7 | 1.30 | 1.30 | 60 | 6 | 0 |
| 8 | 1.30 | 1.30 | 60 | 6 | 2 |
| 9 | 1.50 | 1.30 | 60 | 4 | 2 |
| 10 | 1.50 | 1.50 | 55 | 4 | 2 |

> 누적 서술이 아니라 **표의 절대값**을 쓴다. 누적 곱셈은 단계가 늘 때 값이 폭주하고 검증이 어렵다.

### 3.2 적용 규칙 (결정적)

1. **적 피해**: `attack` 의도의 `amount` 에만 배율을 적용한다. `floor(amount × 배율)`. `block`·`applyStatus` 의도는 **건드리지 않는다**
2. **적 명**: `hp` 와 `maxHp` 양쪽에 `floor(값 × 배율)` 을 적용한다
3. **원본 불변**: `content/enemies.ts` 의 `miniRunEnemies` 를 변형하지 말고 **깊은 사본**을 만들어 수정한다
4. **보스 개시 액**: 5전투(마지막 적) 시작 시에만 플레이어에게 `액` 을 해당 수치만큼 부여한다. 1~4전투에는 적용하지 않는다
5. 승천 0은 현재 동작과 **완전히 동일**해야 한다 (회귀 검증용)

## 4. 런 연동

- `startMiniRun(rng, startingDeck?, ascension = 0)` 으로 확장한다. 기본값 0이라 기존 호출부는 그대로 동작한다
- `MiniRunState` 에 `ascension: number` 을 보관한다
- 정화 보상 회복량은 `AscensionModifier.purifyHeal` 을 쓴다 (현재 하드코딩된 8을 대체)
- 시작 명은 `AscensionModifier.startingHp` 를 `startBattle` 의 `playerHp` 로 넘긴다

## 5. 시뮬레이터 확장

```
npm run bonpuri:sim -- --seeds 200                      # 기존과 동일 (승천 0)
npm run bonpuri:sim -- --seeds 200 --ascension 5         # 특정 승천
npm run bonpuri:sim -- --seeds 200 --sweep 0-10          # 스윕
```

### 5.1 하위 호환 (중요)

**`--ascension` 없이 실행하면 출력이 지금과 완전히 동일해야 한다.** 개정 전후 비교 기준이 흔들리면 안 된다. 기존 §7.1 표 형식·열 순서·자가검증 3종을 그대로 유지하라.

### 5.2 스윕 출력

`--sweep` 은 승천별로 **`defensive` 정책만** 돌려 아래 표를 낸다 (전 조합을 돌리면 시간이 과하다).

| 승천 | 덱 | 카드선택 | 정화 | 정화 잔여명 | 보스 패배율 |
| ---: | --- | ---: | ---: | ---: | ---: |

대상 덱은 `기본덱` · `문전좌정` · `차사처형` 3종으로 한정한다.

마지막에 **요약 한 줄**을 낸다:

```
목표(정화 기준 클리어율 70~80%)에 해당하는 승천: 기본덱 A / 문전좌정 B / 차사처형 C
```

해당 승천이 없으면 `없음(범위 밖)` 으로 적는다.

## 6. 수용 기준

```
npm run bonpuri:contract
npx tsc --noEmit
npm run build
npm run bonpuri:sim -- --seeds 200
npm run bonpuri:sim -- --seeds 200 --sweep 0-10
```

앞의 넷은 exit 0. 다섯째는 §5.2 표를 낸다.

### 계약 검사 추가

| # | 검사 |
| --- | --- |
| 58 | 승천 0의 적 수치·시작 명·정화 회복이 현재 값과 **완전히 동일** (회귀) |
| 59 | 승천 5에서 적 `attack` 의도만 ×1.30 되고 `block`·`applyStatus` 는 불변 |
| 60 | 승천 적용이 `content/enemies.ts` 원본을 **변형하지 않음** (깊은 동등 비교) |
| 61 | 승천 8에서 보스(5전투)에만 개시 액 2가 부여되고 1~4전투에는 없음 |
| 62 | 같은 시드·같은 승천 → 결과 완전 동일 (결정성) |
| 63 | `startMiniRun` 을 승천 인자 없이 부르면 승천 0과 동일 |

## 7. 금지사항

- `core/*` 수정 (엔진 계약)
- `content/enemies.ts`·`content/cards.ts` 수정 (원본 수치 불변)
- `--ascension` 없는 기존 시뮬 출력 형식 변경
- §3.1 표 값의 임의 조정 — **스윕 결과가 마음에 안 들어도 표대로 구현하고 그대로 보고하라.** 재조정은 내가 판단한다
- 새 의존성 추가
- 검사 완화·삭제·skip

## 8. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 5개 실행 결과
3. **§5.2 스윕 표 전문** — 이번 작업의 핵심 산출물
4. 목표 승천 요약 한 줄
5. 기대값과 어긋난 항목 (수정하지 말고 그대로 보고)
6. 해석·가정한 부분
7. 미해결 항목
