# Life RPG Simulator — page.tsx 리팩터링 작업지시서

기존 약 4,000줄 규모의 모놀리식 `page.tsx` 파일을 유지보수 가능한 구조로 안전하게 쪼개는 점진적 리팩터링 계획입니다. 
한 번에 모든 것을 이동하면 방대한 상태(State)와 의존성 문제로 빌드 에러가 발생하기 쉬우므로 **의존성이 적은 "상수/타입"부터 "컴포넌트" 순으로** 분리 작업을 진행합니다.

---

## 📅 [Phase 1] 데이터 및 타입 분리 (진행 난이도: ⭐)
비즈니스 로직과 무관하고 값만 선언되어 있는 배열/객체 상수를 별도 파일로 분리합니다. 제일 먼저 진행해야 타 파일에서 import하기 쉽습니다.

- **대상 파일 생성**: 
  - `src/lib/constants.ts` (상수 데이터)
  - `src/types/game.ts` (타입 시스템)
- **작업 내용**:
  1. `page.tsx`의 70~900번째 줄에 위치한 거대 상수들을 `constants.ts`로 이동
     - `STATS_DEF`, `WORK_COST`, `INDUSTRIES`, `COMPANY_TIERS`, `POSITIONS`, `PART_TIME_JOBS`, `ACTIONS`, `GAP_ACTIVITIES`, `SHOP_ITEMS`, `QUESTS`, `LONG_TERM_GOALS`
  2. 상수 바로 아래에 있는 Type 선언들을 `game.ts` 로 이동
     - `StatKey`, `Stats`, `QuestTarget`, `QuestReward`, `QuestDefinition`, `IndustryId`, `CareerState`, `TimerState`, `LogEntry` 등
  3. `page.tsx` 최상단에서 해당 상수/타입들을 import하도록 수정하고 에러가 없는지 빌드(`npm run dev`) 확인

## 📅 [Phase 2] 유틸리티 함수 분리 (진행 난이도: ⭐)
상태(State)에 의존하지 않는 순수 수학 연산 함수들을 분리합니다.

- **대상 파일 생성**: `src/lib/utils.ts`
- **작업 내용**:
  1. `page.tsx`에 있는 계산 유틸리티들 이동
     - `calcOverallScore`, `toNumber`, `formatMoney`, `formatChangeValue`, `roundChangeValue`
  2. 변경된 함수를 `page.tsx`에 import 후 에러가 없는지 빌드 확인

---

## 📅 [Phase 3] 비즈니스 로직 / 커스텀 훅 분리 (진행 난이도: ⭐⭐⭐)
가장 핵심적이고 복잡한 단계입니다. 30개가 넘는 `useState`와 거대한 `useEffect`를 역할별 훅으로 나눕니다.

- **대상 파일 생성**: `src/hooks/` 폴더 내 다수
- **작업 내용**:
  1. **`useAuth.ts`**: Firebase 기반 상태 구독 및 Auth 로직
     - `authEmail`, `authPassword`, `user`, `syncMode`, `handleAuthSubmit`, `handleSignOut`, `onAuthStateChanged` 로직 분리
  2. **`useGameState.ts`**: 게임 내 재화/능력치 관련 스토어
     - `stats`, `money`, `inventory`, `consumables`, `saveData()` 등 상태 동기화 및 유지 관리 로직 분리 
  3. **`useEngine.ts`**: 타이머 실행 루프 및 자연 붕괴(Decay) 계산 로직
     - `timerIntervalRef`, `decayIntervalRef`, `getActiveTimerRef`, `tryStartAction`, `stopAction`, `resolveGap` 등의 코어 엔진 로직
  4. (선택적) 훅 기반 전역 상태 라이브러리 (Zustand 등) 도입 고려
     - 컴포넌트 깊이가 깊어지므로 Props Drilling을 방지하기 위해 Zustand 등으로 GameState를 빼는 방안을 검토합니다.

---

## 📅 [Phase 4] UI 컴포넌트 분리 (진행 난이도: ⭐⭐)
마지막으로 남게 되는 압도적으로 긴 `return (...)` 렌더링 JSX 구문을 별도 컴포넌트로 나눕니다.

- **대상 파일 생성**: `src/components/` 폴더 내 다수
- **작업 내용**:
  1. **탭(Tab)별 메인 패널 분리**: `src/components/tabs/`
     - `<DashboardTab />`: 레이더 차트 및 스탯 렌더링
     - `<JobTab />`: 직종 테이블, 알바/커리어 상태
     - `<ShopTab />`: 상점 아이템 맵핑 및 소비 로직 (구매 버튼)
     - `<InventoryTab />`: 보유 아이템 및 소비 아이템 패널
     - `<QuestTab />`: 목표 및 퀘스트 Board
     - `<HistoryTab />`: 행동 히스토리(`LogEntry`) 관련 목록
  2. **팝업/모달별 컴포넌트 분리**: `src/components/modals/`
     - `<GapModal />` (공백 시간 확인용)
     - `<AuthModal />` (회원가입/로그인용)
     - `<AlertModal />` (일반 경고창)
  3. **공통 컴포넌트**: 사이드바 내비게이션(`<Sidebar />`), 글로벌 탑바, 알람 프로그레스바, `<StatRadarComponent />` 레이더 컴포넌트 등

---

## 🏁 최종 상태 목표 (`page.tsx`)
모든 분리가 완료되고 나면 `page.tsx`는 **500줄 이하**의 라우팅 껍데기(Container) 역할만을 수행하게 됩니다.

```tsx
// src/app/page.tsx (개념도)
import { useAuth, useGameState, useEngine } from "@/hooks";
import { Sidebar, Topbar } from "@/components/common";
import { DashboardTab, JobTab, ... } from "@/components/tabs";
import { GapModal, AuthModal, AlertModal } from "@/components/modals";

export default function LifeRPGPage() {
  const { user } = useAuth();
  const { state } = useGameState();
  const { activeTab, setActiveTab } = ...;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeTab={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-y-auto">
        <Topbar />
        
        {/* 현재 활성화된 화면 렌더링 */}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'job' && <JobTab />}
        // ...
      </main>

      <AuthModal />
      <GapModal />
      <AlertModal />
    </div>
  )
}
```

안정성을 고려하여 한 번에 하나의 Phase를 지정해 주시면, 제가 직접 해당 단계의 파일 생성 및 분리 코딩을 진행하겠습니다.
**어떤 Phase부터 작업을 시작할까요? (Phase 1 상수/타입 분리부터 진행하는 것을 추천합니다.)**
