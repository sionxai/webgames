# P3 스펙 — forge·waitdog 클라우드 저장 연동 (계정 귀속 진행도)

## 1. 목표
forge(전설의 검 강화하기)와 waitdog(기다려, 멍!)의 진행도가 Firebase에 저장되어, 같은 계정으로 다른 기기에서 이어서 플레이할 수 있다. 로컬 저장은 그대로 유지하고(오프라인·비로그인 대비) 클라우드를 덧붙이는 방식이다.

## 2. 변경 파일 (목록 밖 수정 금지)
- 신규: `src/lib/cloudSave.ts` — 게임 공용 클라우드 저장 모듈
- 신규: `src/lib/useCloudSave.ts` — React 훅(선택). 필요 없으면 만들지 말 것.
- 수정: `src/services/serverSimulator.ts` — 저장/로드 훅 지점만. **게임 규칙·확률·경제 로직 절대 수정 금지**
- 수정: `src/App.tsx`(forge), `src/waitdog/App.tsx` — 동기화 배선과 상태 배지
- 수정: `src/index.css`, `src/waitdog/waitdog.css` — 배지 스타일 최소 추가
- 수정: `database.rules.json` — 아래 3.5 규칙만
- 금지: 홈·다른 게임(bakara/gacha/life-rpg)·plugins·vite.config

## 3. 계약

### 3.1 저장 경로와 형태
- RTDB: `portal/saves/$uid/$gameId` (gameId: `forge` | `waitdog`)
- 레코드: `{ payload: <게임 프로필 JSON 문자열>, updatedAt: <number, 서버 기준 ms>, schema: <number>, device: <string 8자 랜덤 아님 — 시드 불필요, crypto.randomUUID().slice(0,8)> }`
- payload는 각 게임의 **기존 localStorage 문자열을 그대로** 넣는다. 새 직렬화 포맷을 만들지 말 것(마이그레이션 위험 회피).

### 3.2 cloudSave.ts API
```ts
export type CloudSaveState = 'idle' | 'loading' | 'synced' | 'offline' | 'conflict' | 'error';
export interface CloudSaveRecord { payload: string; updatedAt: number; schema: number; device: string }
export function createCloudSave(gameId: 'forge' | 'waitdog', schema: number): {
  subscribe(listener: (state: CloudSaveState) => void): () => void;
  pull(): Promise<CloudSaveRecord | null>;   // 로그인 안 됐으면 null
  push(payload: string): void;               // 디바운스 저장(아래 3.3)
  flush(): Promise<void>;                    // 즉시 저장(페이지 이탈용)
  resolveConflict(choice: 'local' | 'cloud'): void;
  getState(): CloudSaveState;
}
```
- 인증은 `src/lib/portalAuth.ts`의 기존 상태 구독을 재사용한다. 로그인 안 된 상태면 아무 것도 하지 않고 `idle` 유지(에러 아님).
- Firebase는 이미 설치된 `firebase` 패키지의 RTDB 모듈을 쓴다. 새 의존성 금지.

### 3.3 동기화 규칙
- **push**: 3초 디바운스 + 마지막 push 후 값이 같으면 생략. `visibilitychange`(hidden)와 `pagehide`에서 flush.
- **pull(최초 진입)**: 로컬과 클라우드를 비교한다.
  - 클라우드 없음 → 로컬 유지, 즉시 push(백업 생성)
  - 로컬 없음 → 클라우드 적용
  - 둘 다 있고 payload 동일 → `synced`
  - 둘 다 있고 다름 → **자동 덮어쓰기 금지**. 상태를 `conflict`로 올리고 UI가 사용자에게 선택시킨다(3.4).
- 네트워크 실패·권한 실패는 `offline`/`error`로만 표시하고 **게임 진행을 막지 않는다**. 로컬 저장은 계속 동작해야 한다.

### 3.4 UI (각 게임 헤더에 작은 배지 1개)
- `synced`: "☁ 저장됨" (은은한 색)
- `loading`: "동기화 중"
- `offline`/`error`: "로컬 저장 중" + title 속성에 사유
- `idle`(비로그인): "게스트 — 이 기기에만 저장" + 클릭 시 홈으로 유도하지 말고 툴팁만
- `conflict`: 작은 모달/인라인 카드로 양쪽 요약 제시 — 각각 **마지막 저장 시각**과 게임별 요약 1줄
  - forge: `+N 강화 · 골드 N` / waitdog: `Day N · 캠페인/무한`
  - 버튼 2개: "이 기기 기록 사용" / "클라우드 기록 사용". 선택 전에는 게임을 계속 할 수 있어야 하고, 선택 시 즉시 반영.
- 문구는 한국어, 기존 각 게임 톤에 맞춘다. 숫자 내부 수치 노출 금지 규칙(waitdog)은 이 배지에 적용하지 않는다(진행도 요약은 허용).

### 3.5 RTDB 규칙 (기존 파일에 추가만, 다른 경로 수정 금지)
`portal/saves/$uid/$gameId` 에 대해:
- read/write: `auth != null && auth.uid === $uid`
- validate: `newData.hasChildren(['payload','updatedAt','schema'])`, `payload.isString() && payload.val().length < 200000`, `updatedAt.isNumber()`, `schema.isNumber()`
- `$gameId` 는 `forge`·`waitdog` 만 허용(정규식 또는 명시적 분기)

## 4. 수용 기준 (Claude가 직접 실행)
```
npm run build
npx tsc -p tsconfig.waitdog-contract.json && node .waitdog-contract-dist/scripts/waitdog-contract.js
python3 -c "import json;json.load(open('database.rules.json'));print('rules ok')"
```
- 계약검사는 기존 146개가 **전부 그대로 통과**해야 한다(시뮬 로직 불변 증명).
- 브라우저 검증(로그인/비로그인/충돌/오프라인)은 Claude가 수행.

## 5. 금지
- 게임 규칙·확률·경제·시뮬 로직 수정, 기존 localStorage 키·포맷 변경, 자동 충돌 덮어쓰기, 새 의존성, git 커밋/푸시, npm install·빌드 실행(환경 크래시 잦음 — 코드만 작성).
- 랭킹·업적 기능은 이번 범위 아님(다음 단계). 저장만 한다.

## 완료 보고 (30줄 이내): 변경 파일 / 동기화·충돌 처리 요약 / 규칙 추가분 / 가정 / 미해결.
