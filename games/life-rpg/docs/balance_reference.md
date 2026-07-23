Balance quick reference
=======================

Action stat gains (per second, before decay/global modifiers)
------------------------------------------------------------
```json
{
  "baseRate": 0.0025,
  "subRate": 0.001,
  "decayRate": 0.0001,
  "actions": {
    "study": {
      "label": "공부",
      "multipliers": { "intelligence": 0.0025, "focus": 0.001, "willpower": 0.001 },
      "moneyGain": 0
    },
    "reading": {
      "label": "독서",
      "multipliers": { "intelligence": 0.0025, "eq": 0.0025, "focus": 0.001 },
      "moneyGain": 0
    },
    "exercise": {
      "label": "운동",
      "multipliers": { "health": 0.0025, "immunity": 0.0025, "willpower": 0.001 },
      "moneyGain": 0
    },
    "meditation": {
      "label": "명상",
      "multipliers": { "focus": 0.0025, "eq": 0.0025, "willpower": 0.001 },
      "moneyGain": 0
    },
    "work": {
      "label": "몰입 작업(근로)",
      "multipliers": {},
      "moneyGain": "dynamic (current job/career wage per hour / 3600 * item boosts)",
      "note": "스탯 증가 없음, 비용은 WORK_COST 참조"
    },
    "rest": {
      "label": "휴식",
      "multipliers": { "eq": 0.0025, "immunity": 0.001, "health": 0.001 },
      "moneyGain": 0
    },
    "sleep": {
      "label": "수면",
      "multipliers": { "health": 0.0025, "immunity": 0.0025, "focus": 0.001 },
      "moneyGain": 0
    }
  }
}
```

Part-time jobs (flat wage per hour)
-----------------------------------
```json
[
  { "id": "convenience", "label": "편의점 알바", "wage": 15, "req": {} },
  { "id": "restaurant", "label": "식당 서빙", "wage": 17, "req": { "health": 20 } },
  { "id": "cleaning", "label": "청소 용역", "wage": 20, "req": { "health": 30, "immunity": 20 } },
  { "id": "delivery_rent", "label": "배달 (도보/렌트)", "wage": 18, "req": { "health": 25 } },
  { "id": "delivery_bike", "label": "배달 (자전거)", "wage": 23, "req": { "item": "budget_courier_bike" } },
  { "id": "delivery_own", "label": "배달 (오토바이)", "wage": 28, "req": { "item": "bike" } },
  { "id": "moving", "label": "이삿짐 센터", "wage": 35, "req": { "health": 50, "immunity": 40 } },
  { "id": "tutor_part", "label": "대학생 과외", "wage": 40, "req": { "intelligence": 50 } }
]
```

Career wage formula
-------------------
Industry base wage × company tier multiplier × position multiplier.

```json
{
  "industries": {
    "office": { "label": "사무/관리", "core": ["intelligence", "willpower"], "baseWage": 20 },
    "dev": { "label": "개발/기술", "core": ["intelligence", "focus"], "baseWage": 28 },
    "sales": { "label": "영업/마케팅", "core": ["eq", "willpower"], "baseWage": 22 },
    "logistics": { "label": "생산/물류", "core": ["health", "immunity"], "baseWage": 18 },
    "fitness": { "label": "헬스/피트니스", "core": ["health", "focus"], "baseWage": 24 },
    "pro": { "label": "전문직", "core": ["intelligence", "eq"], "baseWage": 45 }
  },
  "companyTiers": [
    { "id": "sme", "label": "중소기업", "minStat": 20, "multiplier": 1.0 },
    { "id": "mid", "label": "중견기업", "minStat": 50, "multiplier": 1.3 },
    { "id": "enterprise", "label": "대기업", "minStat": 90, "multiplier": 1.8 },
    { "id": "global", "label": "글로벌", "minStat": 140, "multiplier": 2.5 }
  ],
  "positions": [
    { "id": "entry", "label": "사원", "addStat": 0, "multiplier": 1.0 },
    { "id": "junior", "label": "주임", "addStat": 10, "multiplier": 1.1 },
    { "id": "assistant", "label": "대리", "addStat": 20, "multiplier": 1.3 },
    { "id": "manager", "label": "과장", "addStat": 30, "multiplier": 1.6 },
    { "id": "deputy", "label": "차장", "addStat": 40, "multiplier": 2.0 },
    { "id": "senior", "label": "부장", "addStat": 50, "multiplier": 2.5 },
    { "id": "director", "label": "이사", "addStat": 70, "multiplier": 3.0 },
    { "id": "executive", "label": "임원", "addStat": 90, "multiplier": 4.0 },
    { "id": "ceo", "label": "CEO", "addStat": 110, "multiplier": 6.0 }
  ]
}
```

Notes for balancing
-------------------
- Stat decay: every second each stat loses `decayRate * passiveMultiplier`; passive items can reduce this.
- Growth boosts: items and goal boosts multiply the per-second multipliers; shop items for an action stack multiplicatively.
- Work money per second: `(current hourly wage / 3600) * itemMultiplier * globalBoost`.
- Gap activities (idle/offline catch-up) are separate; see `GAP_ACTIVITIES` in `src/app/page.tsx` if you need their deltas.

Work stat cost (per second)
---------------------------
```json
{
  "physical": { "health": -0.0015, "immunity": -0.0010, "willpower": -0.0003 },
  "mental":   { "willpower": -0.0015, "focus": -0.0010, "health": -0.0002 },
  "light":    { "health": -0.0007, "willpower": -0.0005 }
}
```
- Work type rules: convenience→light, tutor_part→mental, 나머지 알바(restaurant/cleaning/delivery*/moving)→physical. 커리어는 core에 health/immunity가 있으면 physical, 아니면 mental.
- Work 액션은 스탯 증가 없음; 위 소모만 적용 + 임금 획득.

Shop items (effects on growth/decay/money)
------------------------------------------
```json
[
  { "id": "meal_basic", "label": "간단한 식사", "category": "health", "cost": 7, "consumable": true, "restore": { "health": 15, "immunity": 5 } },
  { "id": "meal_standard", "label": "든든한 식사", "category": "health", "cost": 12, "consumable": true, "restore": { "health": 25, "immunity": 10 } },
  { "id": "meal_premium", "label": "영양식 세트", "category": "health", "cost": 18, "consumable": true, "restore": { "health": 35, "immunity": 15 } },
  { "id": "budget_courier_bike", "label": "중고 배달 자전거", "category": "work", "cost": 99, "targetAction": "none", "boost": 0, "unlocks": "배달(자전거)" },
  { "id": "mini_meditation_pod", "label": "미니 향초", "category": "mind", "cost": 100, "targetAction": "meditation", "boost": 1.05 },
  { "id": "water_tracker_bottle", "label": "스마트 물병", "category": "health", "cost": 120, "targetAction": "rest", "boost": 1.05 },
  { "id": "notebook_pro", "label": "프로 노트북 메모장", "category": "study", "cost": 150, "targetAction": "study", "boost": 1.05 },
  { "id": "resistance_band", "label": "저항 밴드 세트", "category": "health", "cost": 150, "targetAction": "exercise", "boost": 1.05 },
  { "id": "reading_glasses", "label": "독서 전용 안경", "category": "study", "cost": 200, "targetAction": "reading", "boost": 1.05 },
  { "id": "quality_headphones", "label": "소음 차단 헤드폰", "category": "work", "cost": 300, "targetAction": "work", "boost": 1.05 },
  { "id": "reading_lamp", "label": "독서용 램프", "category": "study", "cost": 500, "targetAction": "reading", "boost": 1.08 },
  { "id": "bike", "label": "중고 오토바이", "category": "work", "cost": 800, "targetAction": "none", "boost": 0, "unlocks": "배달(오토바이)" },
  { "id": "habit_tracker_app", "label": "습관 트래커 앱", "category": "work", "cost": 1500, "targetAction": "work", "boost": 1.08 },
  { "id": "focus_notifier", "label": "집중 알림 장치", "category": "passive", "cost": 2000, "passive": { "stat": "focus", "rate": 0.9 } },
  { "id": "theme_neon", "label": "네온 테마", "category": "special", "cost": 2000, "cosmetic": true },
  { "id": "smart_pen", "label": "스마트 펜", "category": "study", "cost": 2500, "targetAction": "study", "boost": 1.1 },
  { "id": "protein_pack", "label": "단백질 보충제", "category": "health", "cost": 2500, "targetAction": "exercise", "boost": 1.1 },
  { "id": "sleep_mask_pillow", "label": "수면 마스크 & 베개", "category": "health", "cost": 3000, "targetAction": "sleep", "boost": 1.25 },
  { "id": "meditation_app", "label": "명상 앱 구독", "category": "mind", "cost": 3500, "targetAction": "meditation", "boost": 1.15 },
  { "id": "yoga_mat", "label": "요가 매트", "category": "special", "cost": 3500, "targetAction": "rest", "boost": 1.15 },
  { "id": "vitamin_pack", "label": "비타민 패키지", "category": "passive", "cost": 4000, "passive": { "stat": "immunity", "rate": 0.8 } },
  { "id": "kindle", "label": "전자책 리더기", "category": "study", "cost": 4000, "targetAction": "reading", "boost": 1.2 },
  { "id": "gym_pass", "label": "헬스장 회원권", "category": "health", "cost": 5000, "targetAction": "exercise", "boost": 1.2 },
  { "id": "pet_slime", "label": "슬라임 펫", "category": "special", "cost": 5000, "cosmetic": true },
  { "id": "office_chair", "label": "인체공학 의자", "category": "work", "cost": 5500, "targetAction": "work", "boost": 1.15 },
  { "id": "aroma_candle", "label": "고급 아로마 세트", "category": "mind", "cost": 6000, "targetAction": "meditation", "boost": 1.25 },
  { "id": "air_purifier", "label": "공기청정기", "category": "passive", "cost": 7000, "passive": { "stat": "focus", "rate": 0.8 } },
  { "id": "nutrition_pack", "label": "영양 키트", "category": "special", "cost": 7000, "passive": { "type": "penalty", "rate": 0.7 } },
  { "id": "productivity_app", "label": "업무 자동화 툴", "category": "work", "cost": 8000, "targetAction": "work", "boost": 1.2 },
  { "id": "sleep_tracker", "label": "수면 분석기", "category": "special", "cost": 8000, "passive": { "type": "sleep", "rate": 1.3 } },
  { "id": "standing_desk", "label": "스탠딩 데스크", "category": "special", "cost": 9000, "targetAction": "work", "boost": 1.1 },
  { "id": "therapy_sessions", "label": "테라피 세션", "category": "passive", "cost": 10000, "passive": { "stat": "eq", "rate": 0.7 } },
  { "id": "premium_textbook", "label": "프리미엄 교재", "category": "study", "cost": 12000, "targetAction": "study", "boost": 1.4 },
  { "id": "coding_monitor", "label": "트리플 모니터", "category": "work", "cost": 15000, "targetAction": "work", "boost": 1.3 },
  { "id": "habit_streaker", "label": "습관 관리기", "category": "passive", "cost": 15000, "passive": { "stat": "all", "rate": 0.9 } },
  { "id": "mini_drone", "label": "감시 드론", "category": "special", "cost": 15000, "passive": { "type": "gap", "rate": 1.2 } },
  { "id": "silent_room", "label": "방음 부스", "category": "mind", "cost": 20000, "targetAction": "meditation", "boost": 1.4 },
  { "id": "home_gym", "label": "홈짐 세트", "category": "health", "cost": 25000, "targetAction": "exercise", "boost": 1.5 },
  { "id": "premium_ai_mentor", "label": "AI 멘토", "category": "special", "cost": 30000, "passive": { "type": "growth", "rate": 1.05 } },
  { "id": "pro_tool", "label": "전문가용 장비", "category": "work", "cost": 50000, "targetAction": "work", "boost": 1.5 }
]
```

Item effect rules
-----------------
- Active boosts: if `targetAction` matches the current action, stat/money gains from that action are multiplied by `boost`.
- Passive decay shields: items with `passive.stat` multiply decay by `rate` (e.g., 0.8 means 20% reduction); `stat: "all"` applies to every stat.
- Passive growth: `passive.type: "growth"` multiplies all action multipliers.
- Penalty reduction: `passive.type: "penalty"` scales negative gap penalties (gaming/drinking) by `rate`.
- Sleep boost: `passive.type: "sleep"` scales sleep recovery by `rate`.
- Gap boost: `passive.type: "gap"` scales offline gap rewards by `rate`.
- Unlocks: bikes enable related 배달 알바 jobs.
- Consumables: meal_* 아이템은 회복용(health/immunity 즉시 증가)으로 설계; 하루 사용 횟수 제한 로직은 추후 상태 추가 필요.

Gap activities (offline catch-up outcomes)
------------------------------------------
Applied when returning after inactivity; multipliers can be affected by `nutrition_pack` (penalty 0.7) and `mini_drone` (gap 1.2).

```json
{
  "sleep": { "effect": { "health": 0.2, "immunity": 0.2 }, "money": 0 },
  "work": { "effect": { "health": -0.05, "focus": -0.05 }, "money": "dynamic (current wage per minute * minutes)" },
  "transit": { "effect": { "health": -0.01 }, "money": 0 },
  "idle": { "effect": { "focus": -0.2, "willpower": -0.1 }, "money": -0.5 },
  "gaming": { "effect": { "health": -0.1, "focus": -0.2 }, "money": -1 },
  "drinking": { "effect": { "health": -0.5, "immunity": -0.5, "intelligence": -0.3 }, "money": -5 }
}
```

Goal boosts
-----------
```json
{
  "wealth": { "label": "억만장자", "boost": ["intelligence"], "recommendedActions": ["work", "study"] },
  "health": { "label": "신체 개조", "boost": ["health", "immunity"], "recommendedActions": ["exercise", "sleep"] },
  "mind": { "label": "멘탈 마스터", "boost": ["eq", "willpower"], "recommendedActions": ["meditation", "reading"] }
}
```
