# B0 스펙 — 본풀이 카드 데이터 파이프라인

기획 근거: `bonpuri_spec.md` §2, §3, §15. 이 문서와 충돌하면 이 문서가 우선한다.

## 1. 목표

`ref/korean_deities_300.json`(300 레코드)을 게임 카드 데이터로 변환하는 **결정적** 빌드 스크립트를 만든다. 작업이 끝나면 `npm run bonpuri:build`로 `src/bonpuri/data/cards.generated.json`이 생성되고, `npm run bonpuri:verify`가 §4 전 항목을 통과한다. 게임 로직·UI는 이 작업 범위가 아니다.

## 2. 변경 파일 (목록 밖 수정 금지)

| 파일 | 성격 |
| --- | --- |
| `scripts/build-bonpuri-cards.ts` | 신규 — 변환 스크립트 |
| `scripts/verify-bonpuri-data.ts` | 신규 — 검증 스크립트 |
| `src/bonpuri/data/types.ts` | 신규 — 카드 타입 정의 |
| `src/bonpuri/data/cards.generated.json` | 신규 — 생성물 |
| `src/bonpuri/data/cards.overrides.json` | 신규 — **빈 스켈레톤만** (`{"cards":{}}`) |
| `package.json` | `scripts`에 `bonpuri:build`, `bonpuri:verify` 2줄 추가만 |

**절대 손대지 말 것**: `ref/` 원본, `src/` 의 다른 하위 디렉토리, `dadadak/`, `games/`, `vite.config.ts`, 기존 `scripts/*`.

## 3. 출력 레코드 형태

```ts
export type BonpuriRank = '상신' | '정신' | '속신' | '구전'

export type BonpuriCard = {
  id: string                 // 원본 id (KMG-0001)
  name: string               // record_name
  canonical: string          // canonical_name
  aliases: string[]
  lineage: string            // 계열 — 원본 group 그대로 (7종)
  rank: BonpuriRank
  cardType: string           // identity_status 그대로
  domains: string[]
  sets: string[]             // 소속 세트명 (§3.3). 없으면 []
  bonds: string[]            // 연계 대상 id 배열. 없으면 []
  myth: string | null        // myth_cycle
  bonpuriType: string | null
  worship: string[]          // worship_context
  summary: string            // narrative_summary (도감 본문)
  sources: string[]          // source_ids (출처 표기 의무)
  region: { province: string | null; locality: string | null; shrine: string | null } | null
  flags: { needsReview: boolean; normalized: boolean }
}
```

## 4. 매핑 규칙 (카드별 하드코딩 금지 — 규칙으로만 구현)

### 4.1 계열
원본 `group`을 그대로 사용한다. 7종, 합계 300.

### 4.2 격 — `identity_status` 기반

`identity_status` → 격 매핑 테이블로만 판정한다. **`source_grade`·`confidence`를 격에 쓰지 않는다** (전국 200종은 전부 A, 제주 100종은 67건이 B라 제주 신격이 일률 하위로 밀린다 — 출처 문서의 성격일 뿐 신격의 위상이 아니다).

| 격 | identity_status |
| --- | --- |
| **상신** | independent, founder_deity, deified_founder, deified_ancestress, deified_king |
| **정신** | deified_mythic_figure, deified_historical_person, deified_spirit, mythic_deity, collective_deity, syncretic_deity |
| **당신** | localized_deity, localized_manifestation, regional_variant, deified_ancestor, disputed_deity, disputed_deified_figure |
| **직신** | office_title, deity_type, collective_member, regional_deity_type, ancestor_deity_type |

매핑에 없는 `identity_status`를 만나면 **throw** 한다 (조용한 기본값 금지).

`needs_primary_source_review`는 격에 영향을 주지 않고 `flags.needsReview`로만 보존한다 — 도감 표기 전용.

### 4.3 세트
`deity_class`가 아래와 정확히 일치할 때만 해당 세트에 넣는다. 목록에 없는 `deity_class`는 세트 없음(`[]`).

```
시왕 / 십이지신장 / 칠성 구성신 / 오방제 / 사신·오방수호신 /
오토지신 구성신 / 오방부인 구성신 / 가택신 / 마을·본향당신 /
일월조상신 / 무조신 / 역병신
```

### 4.4 연계(bonds)
`genealogy`의 `parents`·`spouses`·`children`·`related_deities`에 있는 **이름 문자열을 id로 해석**한다.

- 해석 규칙: `record_name` → `canonical_name` → `aliases` 순으로 **완전 일치**만 인정. 부분 일치·유사도 매칭 **금지**
- 해석 실패한 이름은 **조용히 버리지 말고** 별도 리포트에 수집한다 (§4.5)
- 자기 자신을 가리키는 엣지는 제외
- 중복 제거 후 id 오름차순 정렬

### 4.5 부산물 리포트
`build` 실행 시 stdout에 다음을 출력한다 (파일로 저장하지 않는다):
- 계열별 카드 수
- 격별 카드 수
- 세트별 구성원 수
- **해석 실패한 연계 이름 목록과 건수**

### 4.6 알려진 예외 — 1건만 허용
`KMG-0226` 세민황제는 `domains`가 `["미상"]`이다. `domains`를 그대로 보존하되 빈 배열로 만들지 않는다. **이 외의 카드별 예외 분기는 금지.**

## 5. 제약

- **결정적**: 같은 입력 → 바이트 동일 출력. `Date.now()`, `Math.random()`, 순회 순서 의존 금지. 객체 키 순서와 배열 정렬을 명시적으로 고정한다
- 출력 JSON은 원본 `id` 오름차순 정렬, 들여쓰기 2칸, 끝에 개행 1개
- **원본은 읽기 전용**. 어떤 경우에도 `ref/` 를 쓰지 않는다
- TypeScript strict 통과. 프로젝트 기존 스크립트의 스타일·실행 방식을 먼저 확인하고 맞춘다
- **새 의존성 추가 금지**. Node 내장 모듈과 기존 devDependencies만 사용
- `summary`와 `sources`는 반드시 보존한다 — 도감 출처 표기가 이 필드에 의존한다

## 6. 수용 기준 (아래 3개 커맨드가 그대로 통과해야 함)

```
npm run bonpuri:build
npm run bonpuri:verify
npx tsc --noEmit
```

`verify`는 아래를 **모두** 검사하고, 하나라도 실패하면 non-zero로 종료한다.

| # | 검사 | 기대값 |
| --- | --- | --- |
| 1 | 총 카드 수 | 300 |
| 2 | id 중복 | 0 |
| 3 | 원본 id 전건 대응 | 누락 0, 초과 0 |
| 4 | 계열 수 / 합계 | 7종 / 300 |
| 5 | 계열별 카드 수 | `자연·가택·생업·마을 신격` 66, `천상·방위·명부·호법 신격` 59, `제주 마을 당신·본향신` 45, `서사무가·무조·무신도 계열` 40, `제주 일반신본풀이·공통 신격` 40, `창세·건국·시조·신격화 인물` 35, `제주 조상신·일월조상` 15 |

> 계열명은 원본 `group` 문자열과 **완전 일치**해야 한다. 접미사 " 신격"을 포함한다.
| 6 | 격 분포 | 상신 36 / 정신 51 / 당신 85 / 직신 128 (합 300) |
| 7 | 세트 구성원 수 | 시왕 10, 십이지신장 12, 칠성 구성신 7, 오방제 5, 사신·오방수호신 5, 오토지신 구성신 5, 오방부인 구성신 5, 가택신 18, 마을·본향당신 45, 일월조상신 15, 무조신 9, 역병신 5 |
| 8 | 연계 무결성 | 모든 bond 대상 id가 실재. 원본 `genealogy`에 근거 없는 엣지 0 |
| 9 | 연계 출처 | bonds가 비어있지 않은 카드는 반드시 원본에 `genealogy` 항목이 있는 레코드 |
| 10 | 결정성 | 연속 2회 빌드 결과가 바이트 동일 |
| 11 | 원본 불변 | `ref/korean_deities_300.json` SHA-256 = `feb82e4d768950d0c08d8af9ffcaef084690f8ad925408e28e28c66128c3682a` |
| 12 | 필수 필드 | 모든 카드의 `summary` 비어있지 않음, `sources` 길이 ≥ 1 |

## 7. 금지사항

- 원본 JSON 수정 (검사 11번으로 강제)
- **카드별 하드코딩·예외 분기** — §4.6의 1건 외 금지
- **수치 밸런싱·게임 효과 설계** — B0 범위 밖. `overrides.json`은 빈 스켈레톤으로 둔다
- 새 의존성 추가
- 검사 항목 완화·삭제·skip. 기대값이 실제와 다르면 **스크립트를 고치지 말고 보고**하라 (기대값이 틀렸을 가능성이 있다)
- 게임 로직·컴포넌트·UI 작성
- 목록 밖 파일 수정

## 8. 완료 보고 (30줄 이내)

1. 변경 파일 목록
2. 수용 커맨드 3개의 실행 결과 (마지막 5줄씩)
3. §4.5 리포트 출력 — 특히 **해석 실패한 연계 이름**
4. 기대값과 실제가 어긋난 항목 (있다면 수정하지 말고 그대로 보고)
5. 해석·가정한 부분
6. 미해결 항목
