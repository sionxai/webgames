# B3 스펙 — 메타게임(보관함·덱 편집·저장) + 규칙 안내

기획 근거: `bonpuri_spec.md` §9·§13·§15, `bonpuri_b2_spec.md`, `bonpuri_b2_5_spec.md`. 충돌 시 이 문서가 우선한다.

## 1. 목표

두 가지를 한다.

1. **메타게임** — 런에서 모은 카드가 영구 보관되고, 런 시작 전에 시작 덱을 편집한다. 런은 코어로 유지한다
2. **규칙 안내** — 하단 상시 패널과 툴팁으로 규칙을 이해할 수 있게 한다. 현재는 아무 설명 없이 전투부터 시작한다

## 2. 화면 흐름

```
[본향] ──덱 편집──> [덱 편집] ──런 시작──> [런: 5전투] ──종료──> [결과] ──> [본향]
                                                                    │
                                                  획득 카드 보관함 편입 ┘
```

- **본향(홈)**: 보관함 요약, 전적, `런 시작`·`덱 편집` 버튼
- **덱 편집**: 시작 덱 10장 구성
- **런**: B2/B2.5 그대로 (5전투·보상 3택1·건너뛰고 회복)
- **결과**: 승패 + 이번 런에서 얻은 카드 + 꾸러미

## 3. 프로필 계약

```ts
export const BONPURI_PROFILE_KEY = 'bonpuri_profile_v1';

export type BonpuriProfile = {
  schemaVersion: 1;
  collection: Record<string, number>;   // 보상 카드 id → 보유 수량
  startingDeck: string[];               // 카드 id 정확히 10개
  runsCompleted: number;
  runsWon: number;
  rulesPanelOpen: boolean;              // 하단 패널 접힘 상태
};
```

- **기본 카드 3종**(`sinkal`·`neokgarim`·`saseol`)은 **무제한 보유**로 취급한다. `collection` 에 없어도 덱에 넣을 수 있다
- 신규 프로필 기본값: `startingDeck` = 신칼 5 · 넋가림 4 · 사설 풀기 1 (B1 계약과 동일), `collection` = `{}`, `rulesPanelOpen` = `true`

## 4. 저장 계약 (fail-closed)

`src/waitdog/services/campaign.ts` 의 패턴을 그대로 따른다 — **storage 주입 + Result 타입**. 예외를 던지지 않는다.

```ts
export type StorageAdapter = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type LoadProfileResult = { ok: true; profile: BonpuriProfile | null } | { ok: false; error: string };
export type SaveProfileResult = { ok: true } | { ok: false; error: string };

export function loadProfile(storage: StorageAdapter): LoadProfileResult;
export function saveProfile(storage: StorageAdapter, profile: BonpuriProfile): SaveProfileResult;
```

- 저장값이 없으면 `{ ok: true, profile: null }`
- JSON 파싱 실패·형식 불일치는 `{ ok: false, error }` — **던지지 마라**
- 형식 검증은 타입 가드로 한다 (`schemaVersion`·필드 타입·`startingDeck` 길이 10)

### 4.1 fail-closed 규칙 — 기획 §15에서 B3로 이관된 항목

**저장에 실패하면 메모리 상태를 진행시키지 않는다.**

구체적으로 런 종료 시:
1. 새 프로필(보관함 갱신 + 전적 증가)을 **계산만** 한다
2. `saveProfile` 을 호출한다
3. `ok: true` 면 그때 화면 상태를 갱신한다
4. `ok: false` 면 **보관함 변경을 반영하지 않고**, 결과 화면에 오류를 표시한다 (예: "기록을 저장하지 못했습니다. 획득 카드가 보관되지 않았습니다.")

로드 실패 시에는 기본 프로필로 시작하되 본향에 알림을 표시한다.

## 5. 덱 편집 규칙

- 시작 덱은 **정확히 10장**. 10장이 아니면 `런 시작` 을 막고 사유를 표시한다
- 보상 카드는 같은 카드 **최대 2장**
- **보유 수량을 초과해 넣을 수 없다**
- 기본 카드 3종은 수량 제한 없음 (0~10장 자유)
- `기본 덱으로 되돌리기` 버튼 (신칼 5·넋가림 4·사설 풀기 1)
- 덱 변경은 **즉시 저장**한다. 저장 실패 시 변경을 되돌리고 오류를 표시한다

## 6. 카드 획득

- 런 중 보상으로 **고른 카드**는 런 종료 시 `collection` 에 +1
- 런을 **완주(5승)** 하면 추가로 **본풀이 꾸러미** 1개 = 42종에서 무작위 **3장** (중복 허용) 을 `collection` 에 추가
- **패배해도 그때까지 고른 카드는 보관한다** (기획 §9의 "패배해도 해금은 유지" 원칙)
- 꾸러미 추첨은 주입된 RNG를 쓴다. `Math.random` 직접 호출 금지

## 7. 규칙 안내

### 7.1 하단 상시 패널 (전투 화면)

- 화면 하단에 고정. **접기/펴기** 가능하며 상태를 프로필에 저장한다
- 펼친 상태에 표시할 것:
  - 지금 할 일 1줄 (예: `카드를 눌러 사용하고, 끝나면 턴 종료를 누르세요`)
  - 자원 3종: **명** = 체력, 0이면 런 종료 / **장단** = 매 턴 3 회복, 이월 없음 / **넋** = 방어막, 턴 시작 시 사라짐
- 접힌 상태에서는 한 줄 요약 + 펴기 버튼만

### 7.2 툴팁

**조작 충돌 주의**: 카드를 짧게 탭하면 **사용**이다. 툴팁은 **길게 누르기(400ms)** 로 연다. 배지·아이콘은 짧은 탭으로 연다.

툴팁 대상과 내용:

| 대상 | 내용 |
| --- | --- |
| 상태이상 5종 | 액 = 받는 피해 +50% / 넋나감 = 주는 피해 −25% / 부정 = 턴 종료 시 피해(넋 무시) / 정성 = 주는 피해 +N, 전투 내내 유지 / 신명 = 다음 턴 장단 +N |
| 유형 4종 | 신 = 제약 없음 / 무구 = 장착해 전투 내내 지속 / 굿 = **턴당 1장** / 좌정 = **동시 1개**, 새로 내면 교체 |
| 연계 | 같은 본풀이·계열 카드를 이미 낸 만큼 효과가 커진다. 첫 장은 보너스 없음 |
| 적 의도 | 다음 턴에 적이 할 행동. 공격은 현재 넋·상태를 반영한 예상 피해 |

- 툴팁은 화면 밖으로 넘치지 않아야 한다 (375px 기준)
- 열린 툴팁은 바깥을 탭하거나 닫기 버튼으로 닫는다

## 8. 같이 고칠 기존 결함 2건

1. **부제 오표기** — `CardView.tsx` 의 `card.bondGroup ?? '홀로 선 신격'` 때문에 무구 「산판」과 기본 카드 「신칼」에도 "홀로 선 신격"이 붙는다. `bondGroup` 이 없으면 **부제를 표시하지 않는다**
2. **접근성 이름 부재** — 카드 버튼에 `aria-label` 이 없어 스크린리더로 식별 불가. `"{이름}, {유형}, 비용 {n}, {효과 요약}"` 형식으로 넣는다

## 9. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `src/bonpuri/services/profile.ts` | 신규 — §3·§4 |
| `src/bonpuri/components/HomeScreen.tsx` | 신규 — 본향 |
| `src/bonpuri/components/DeckEditor.tsx` | 신규 — 덱 편집 |
| `src/bonpuri/components/RulesPanel.tsx` | 신규 — 하단 패널 |
| `src/bonpuri/components/Tooltip.tsx` | 신규 — 툴팁 |
| `src/bonpuri/App.tsx` | 수정 — 화면 전환·프로필 로드 |
| `src/bonpuri/run/miniRun.ts` | 수정 — 획득 카드 집계·꾸러미 |
| `src/bonpuri/components/BattleScreen.tsx` | 수정 — 하단 패널·툴팁 |
| `src/bonpuri/components/CardView.tsx` | 수정 — §8 결함 2건·길게 누르기 |
| `src/bonpuri/components/EndScreen.tsx` | 수정 — 획득 카드·저장 오류 표시 |
| `src/bonpuri/components/RewardScreen.tsx` | 수정 — 툴팁 연동 |
| `src/bonpuri/bonpuri.css` | 수정 |
| `scripts/verify-bonpuri-contract.ts` | 수정 — 검사 37~45 추가 |

**절대 손대지 말 것**: `src/bonpuri/core/*`(B1·B2.5 계약), `src/bonpuri/content/*`, `src/bonpuri/data/*`, `ref/`, `dadadak/`, `games/`, `vite.config.ts`, `src/home/`, `src/waitdog/`, `src/services/`, 기타 `scripts/*`.

> 코어 엔진은 이번에 건드리지 않는다. `startBattle` 은 이미 `deck` 파라미터를 받으므로 편집된 덱을 그대로 넘기면 된다.

## 10. 제약

- React 18 + TypeScript strict, **새 의존성 금지**
- 모바일 세로 우선, 375px에서 가로 스크롤 금지
- `localStorage` 는 **`App` 최상단에서만** 접근하고 하위는 주입받는다. `profile.ts` 는 `StorageAdapter` 만 안다 (테스트 가능해야 함)
- `Math.random`·`Date.now` 는 코어 밖에서만. 꾸러미 추첨은 주입 RNG 사용
- **기존 계약 검사 1~36은 그대로 통과해야 한다**

## 11. 수용 기준

```
npm run bonpuri:contract
npx tsc --noEmit
npm run build
```

세 커맨드 모두 exit 0. 아래 검사를 추가한다.

| # | 검사 |
| --- | --- |
| 37 | `saveProfile` → `loadProfile` 왕복이 동일 프로필을 복원 (가짜 StorageAdapter 사용) |
| 38 | 손상된 JSON·형식 불일치 로드가 **던지지 않고** `{ ok: false }` 반환 |
| 39 | `setItem` 이 예외를 던지는 StorageAdapter에서 `saveProfile` 이 `{ ok: false }` 반환 |
| 40 | 저장 실패 시 보관함이 **변경되지 않음**(fail-closed) — 런 종료 처리 전후 프로필 깊은 동등 |
| 41 | 덱 편집: 10장이 아니면 런 시작 불가, 보상 카드 3장째 추가 거부, 보유 수량 초과 거부 |
| 42 | 기본 카드 3종은 `collection` 이 비어도 덱에 넣을 수 있고 수량 제한 없음 |
| 43 | 런 종료 시 이번 런에서 고른 카드가 `collection` 에 정확히 +1씩 반영 |
| 44 | 5승 완주 시 꾸러미 3장이 추가되고, 패배 시에는 꾸러미가 없되 고른 카드는 보관 |
| 45 | 꾸러미 추첨이 주입 RNG만 사용 (`Math.random` 미호출, 같은 시드 → 같은 결과) |

## 12. 금지사항

- `src/bonpuri/core/*`·`content/*`·`data/*` 수정
- 새 의존성 추가
- 이미지 파일 생성·참조
- 실제 화폐·유료 확률 요소 (꾸러미는 **무료**이며 재화·상점 없음)
- `localStorage` 를 `App` 밖에서 직접 접근
- 검사 완화·삭제·skip
- 목록 밖 파일 수정

## 13. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 3개 실행 결과 (마지막 5줄씩)
3. 기대값과 어긋난 항목 (수정하지 말고 그대로 보고)
4. **직접 플레이한 결과** — 본향→덱 편집→런→결과→본향 한 바퀴가 도는지, 툴팁이 375px에서 넘치지 않는지
5. 해석·가정한 부분
6. 미해결 항목
