import { BALANCE } from "../constants/balance";
import type {
  BarrierItemId,
  BarrierPlacement,
  CatalogCategory,
  CatalogItemId,
  ClinicItemId,
  DogSpatialState,
  EconomyLedgerEntry,
  EconomyState,
  EnvironmentState,
  Inventory,
  OwnerSpatialState,
  PadItemId,
  PadPlacement,
  PlacementValidation,
  RoomId,
  SalaryUpgradeId,
  WorkState,
} from "../types";

export interface CatalogItem {
  id: CatalogItemId;
  category: CatalogCategory;
  label: string;
  price: number;
  effect: string;
  unlockCarePoints: number;
  coverage?: number;
  panels?: 1 | 2 | 4;
}

export interface SalaryUpgrade {
  id: SalaryUpgradeId;
  label: string;
  carePointCost: number;
  bonusRate: number;
}

export interface EconomyTransition {
  ok: boolean;
  reason: string | null;
  state: EconomyState;
}

export interface WorkTransition {
  ok: boolean;
  reason: string | null;
  economy: EconomyState;
  work: WorkState;
  payout: number;
  completed: boolean;
}

export const CATALOG_ITEM_IDS: readonly CatalogItemId[] = [
  "food-basic",
  "food-comfort",
  "treat-basic",
  "treat-mini",
  "treat-lick",
  "pad-paper",
  "pad-absorbent",
  "pad-wide",
  "barrier-1-panel",
  "barrier-2-panel",
  "barrier-4-panel",
  "shampoo-gentle",
  "shampoo-quick",
  "clinic-preventive",
];

export const SALARY_UPGRADE_IDS: readonly SalaryUpgradeId[] = [
  "salary-routine",
  "salary-portfolio",
  "salary-specialist",
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const catalogSource = BALANCE.LIFESTYLE.ECONOMY.CATALOG;

export const CATALOG: readonly CatalogItem[] = CATALOG_ITEM_IDS.map((id) => {
  const item = catalogSource[id];
  return {
    id,
    category: item.category,
    label: item.label,
    price: item.price,
    effect: item.effect,
    unlockCarePoints: item.unlockCarePoints,
    ...("coverage" in item ? { coverage: item.coverage } : {}),
    ...("panels" in item ? { panels: item.panels } : {}),
  } as CatalogItem;
});

export const SALARY_UPGRADES: readonly SalaryUpgrade[] =
  SALARY_UPGRADE_IDS.map((id) => ({
    id,
    ...BALANCE.LIFESTYLE.ECONOMY.SALARY_UPGRADES[id],
  }));

const catalogById = (id: CatalogItemId): CatalogItem | undefined =>
  CATALOG.find((item) => item.id === id);

const upgradeById = (id: SalaryUpgradeId): SalaryUpgrade | undefined =>
  SALARY_UPGRADES.find((item) => item.id === id);

export const isCatalogItemId = (value: unknown): value is CatalogItemId =>
  typeof value === "string" &&
  (CATALOG_ITEM_IDS as readonly string[]).includes(value);

export const isPadItemId = (value: unknown): value is PadItemId =>
  value === "pad-paper" || value === "pad-absorbent" || value === "pad-wide";

export const isBarrierItemId = (value: unknown): value is BarrierItemId =>
  value === "barrier-1-panel" || value === "barrier-2-panel" ||
  value === "barrier-4-panel";

const isSalaryUpgradeId = (value: unknown): value is SalaryUpgradeId =>
  typeof value === "string" &&
  (SALARY_UPGRADE_IDS as readonly string[]).includes(value);

export const createInventory = (): Inventory =>
  clone(BALANCE.LIFESTYLE.ECONOMY.STARTER_INVENTORY);

export const createEconomyState = (): EconomyState => ({
  money: BALANCE.LIFESTYLE.ECONOMY.STARTER_MONEY,
  carePoints: 0,
  inventory: createInventory(),
  unlockedItemIds: CATALOG.filter((item) =>
    item.unlockCarePoints === 0
  ).map((item) => item.id),
  salaryUpgrades: [],
  ledger: [],
  firstRewardIds: [],
  clinicCouponAvailable: false,
  preventiveVisitCompleted: false,
  revision: 0,
});

export const createWorkState = (): WorkState => ({
  activeGigId: null,
  progress: 0,
  completedBlocks: 0,
  minutesInBlock: 0,
  active: false,
  continuityEligible: true,
  paidGigIds: [],
  lastPayout: 0,
  alert: null,
});

export const createEnvironmentState = (): EnvironmentState => ({
  selectedPadId: "pad-paper",
  padPlacement: null,
  barriers: [],
});

const withLedger = (
  state: EconomyState,
  entry: Omit<EconomyLedgerEntry, "revision">,
): EconomyState => {
  const revision = state.revision + 1;
  return {
    ...state,
    revision,
    ledger: [...state.ledger, { ...entry, revision }],
  };
};

const hasLedgerId = (state: EconomyState, id: string): boolean =>
  state.ledger.some((entry) => entry.id === id);

const refreshUnlocks = (state: EconomyState): EconomyState => ({
  ...state,
  unlockedItemIds: Array.from(new Set([
    ...state.unlockedItemIds,
    ...CATALOG.filter((item) =>
      item.unlockCarePoints <= state.carePoints
    ).map((item) => item.id),
  ])),
});

export const purchaseItem = (
  current: EconomyState,
  itemId: CatalogItemId,
  quantity = 1,
  transactionId = `purchase:${current.revision + 1}`,
): EconomyTransition => {
  const state = clone(current);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, reason: "구매 수량이 올바르지 않습니다.", state };
  }
  if (
    typeof transactionId !== "string" ||
    transactionId.length === 0 ||
    hasLedgerId(state, transactionId)
  ) {
    return { ok: false, reason: "이미 처리된 구매입니다.", state };
  }
  const item = catalogById(itemId);
  if (item === undefined) {
    return { ok: false, reason: "알 수 없는 구매 품목입니다.", state };
  }
  if (!state.unlockedItemIds.includes(itemId)) {
    return { ok: false, reason: "케어 포인트로 먼저 해금해야 합니다.", state };
  }
  if (item.category === "clinic" && quantity !== 1) {
    return { ok: false, reason: "병원 일정은 한 번에 하나만 예약할 수 있습니다.", state };
  }
  if (
    item.category !== "clinic" &&
    state.inventory[itemId] + quantity >
      BALANCE.LIFESTYLE.ECONOMY.MAX_INVENTORY
  ) {
    return { ok: false, reason: "재고 보관 한도를 넘습니다.", state };
  }
  const clinicCoupon = item.category === "clinic" &&
    state.clinicCouponAvailable;
  const cost = clinicCoupon ? 0 : item.price * quantity;
  if (state.money < cost) {
    return { ok: false, reason: "게임 머니가 부족합니다.", state };
  }
  if (item.category === "clinic" && state.preventiveVisitCompleted) {
    return { ok: false, reason: "예방 관리 방문을 이미 완료했습니다.", state };
  }

  let next: EconomyState = {
    ...state,
    money: state.money - cost,
    inventory: {
      ...state.inventory,
      [itemId]: item.category === "clinic"
        ? state.inventory[itemId]
        : state.inventory[itemId] + quantity,
    },
    clinicCouponAvailable: clinicCoupon
      ? false
      : state.clinicCouponAvailable,
    preventiveVisitCompleted: item.category === "clinic"
      ? true
      : state.preventiveVisitCompleted,
  };
  next = withLedger(next, {
    id: transactionId,
    kind: item.category === "clinic" ? "clinic" : "purchase",
    moneyDelta: -cost,
    carePointDelta: 0,
    itemId,
    quantityDelta: item.category === "clinic" ? 0 : quantity,
  });
  return { ok: true, reason: null, state: refreshUnlocks(next) };
};

export const consumeItem = (
  current: EconomyState,
  itemId: CatalogItemId,
  quantity = 1,
  transactionId = `consume:${current.revision + 1}`,
): EconomyTransition => {
  const state = clone(current);
  if (
    !Number.isInteger(quantity) || quantity <= 0 ||
    itemId === ("clinic-preventive" satisfies ClinicItemId)
  ) {
    return { ok: false, reason: "사용 수량이나 품목이 올바르지 않습니다.", state };
  }
  if (
    typeof transactionId !== "string" ||
    transactionId.length === 0 ||
    hasLedgerId(state, transactionId)
  ) {
    return { ok: false, reason: "이미 처리된 사용입니다.", state };
  }
  if (catalogById(itemId) === undefined) {
    return { ok: false, reason: "알 수 없는 사용 품목입니다.", state };
  }
  if (state.inventory[itemId] < quantity) {
    return { ok: false, reason: "필요한 재고가 부족합니다.", state };
  }
  const next = withLedger({
    ...state,
    inventory: {
      ...state.inventory,
      [itemId]: state.inventory[itemId] - quantity,
    },
  }, {
    id: transactionId,
    kind: "consume",
    moneyDelta: 0,
    carePointDelta: 0,
    itemId,
    quantityDelta: -quantity,
  });
  return { ok: true, reason: null, state: next };
};

export const awardCarePoints = (
  current: EconomyState,
  rewardId: string,
  points: number,
): EconomyTransition => {
  const state = clone(current);
  if (
    !Number.isInteger(points) ||
    points <= 0 ||
    typeof rewardId !== "string" ||
    rewardId.length === 0
  ) {
    return { ok: false, reason: "케어 포인트 보상이 올바르지 않습니다.", state };
  }
  if (state.firstRewardIds.includes(rewardId)) {
    return { ok: false, reason: "이미 받은 최초 보상입니다.", state };
  }
  let next: EconomyState = {
    ...state,
    carePoints: state.carePoints + points,
    firstRewardIds: [...state.firstRewardIds, rewardId],
  };
  next = withLedger(next, {
    id: `care:${rewardId}`,
    kind: "careReward",
    moneyDelta: 0,
    carePointDelta: points,
    itemId: null,
    quantityDelta: 0,
  });
  return { ok: true, reason: null, state: refreshUnlocks(next) };
};

export const buySalaryUpgrade = (
  current: EconomyState,
  upgradeId: SalaryUpgradeId,
): EconomyTransition => {
  const state = clone(current);
  if (state.salaryUpgrades.includes(upgradeId)) {
    return { ok: false, reason: "이미 적용한 급여 업그레이드입니다.", state };
  }
  const upgrade = upgradeById(upgradeId);
  if (upgrade === undefined) {
    return { ok: false, reason: "알 수 없는 급여 업그레이드입니다.", state };
  }
  if (state.carePoints < upgrade.carePointCost) {
    return { ok: false, reason: "케어 포인트가 부족합니다.", state };
  }
  const projected = salaryBonusRate({
    ...state,
    salaryUpgrades: [...state.salaryUpgrades, upgradeId],
  });
  if (
    projected >
    BALANCE.LIFESTYLE.ECONOMY.WORK.MAX_SALARY_BONUS_RATE
  ) {
    return { ok: false, reason: "급여 보너스 상한을 넘습니다.", state };
  }
  const next = withLedger({
    ...state,
    carePoints: state.carePoints - upgrade.carePointCost,
    salaryUpgrades: [...state.salaryUpgrades, upgradeId],
  }, {
    id: `upgrade:${upgradeId}`,
    kind: "upgrade",
    moneyDelta: 0,
    carePointDelta: -upgrade.carePointCost,
    itemId: null,
    quantityDelta: 0,
  });
  return {
    ok: true,
    reason: null,
    state: next,
  };
};

export const salaryBonusRate = (state: EconomyState): number =>
  Math.min(
    BALANCE.LIFESTYLE.ECONOMY.WORK.MAX_SALARY_BONUS_RATE,
    state.salaryUpgrades.reduce(
      (sum, id) => sum + (upgradeById(id)?.bonusRate ?? 0),
      0,
    ),
  );

export const grantClinicCoupon = (
  current: EconomyState,
  day: number,
): EconomyTransition => {
  const state = clone(current);
  if (!Number.isInteger(day) || day < 2) {
    return { ok: false, reason: "무료 예방 관리 쿠폰은 Day 2부터 제공됩니다.", state };
  }
  if (state.clinicCouponAvailable || state.preventiveVisitCompleted) {
    return { ok: false, reason: "쿠폰을 이미 받았거나 방문을 완료했습니다.", state };
  }
  return {
    ok: true,
    reason: null,
    state: { ...state, clinicCouponAvailable: true },
  };
};

export const startWorkGig = (
  current: WorkState,
  gigId: string,
): { ok: boolean; reason: string | null; state: WorkState } => {
  const state = clone(current);
  if (
    typeof gigId !== "string" ||
    gigId.length === 0 ||
    state.paidGigIds.includes(gigId)
  ) {
    return { ok: false, reason: "이미 정산했거나 올바르지 않은 업무입니다.", state };
  }
  if (
    state.activeGigId !== null &&
    state.activeGigId !== gigId &&
    state.progress > 0 &&
    state.progress < 100
  ) {
    return { ok: false, reason: "진행 중인 업무를 먼저 마쳐야 합니다.", state };
  }
  if (state.activeGigId !== gigId) {
    return {
      ok: true,
      reason: null,
      state: {
        ...createWorkState(),
        activeGigId: gigId,
        paidGigIds: [...state.paidGigIds],
        active: true,
      },
    };
  }
  return {
    ok: true,
    reason: null,
    state: { ...state, active: true },
  };
};

export const interruptWorkGig = (
  current: WorkState,
): { ok: boolean; reason: string | null; state: WorkState } => {
  const state = clone(current);
  if (!state.active || state.activeGigId === null) {
    return { ok: false, reason: "진행 중인 업무가 없습니다.", state };
  }
  return {
    ok: true,
    reason: null,
    state: {
      ...state,
      active: false,
      continuityEligible: false,
      alert: null,
    },
  };
};

export const resolveWorkAlert = (
  current: WorkState,
  choice: "interrupt" | "continue",
): { ok: boolean; reason: string | null; state: WorkState } => {
  const state = clone(current);
  if (choice !== "interrupt" && choice !== "continue") {
    return { ok: false, reason: "알 수 없는 업무 알림 선택입니다.", state };
  }
  if (state.alert === null) {
    return { ok: false, reason: "확인할 업무 알림이 없습니다.", state };
  }
  if (choice === "interrupt") {
    return {
      ok: true,
      reason: null,
      state: {
        ...state,
        alert: null,
        active: false,
        continuityEligible: false,
      },
    };
  }
  return {
    ok: true,
    reason: null,
    state: { ...state, alert: null, active: true },
  };
};

export const advanceWorkMinutes = (
  currentEconomy: EconomyState,
  currentWork: WorkState,
  minutes: number,
): WorkTransition => {
  let economy = clone(currentEconomy);
  let work = clone(currentWork);
  if (!Number.isInteger(minutes) || minutes < 0) {
    return {
      ok: false,
      reason: "업무 시간이 올바르지 않습니다.",
      economy,
      work,
      payout: 0,
      completed: false,
    };
  }
  if (!work.active || work.activeGigId === null) {
    return {
      ok: false,
      reason: "업무가 활성화되지 않았습니다.",
      economy,
      work,
      payout: 0,
      completed: false,
    };
  }

  for (let minute = 0; minute < minutes && work.progress < 100; minute += 1) {
    work.minutesInBlock += 1;
    if (
      work.minutesInBlock >=
      BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES
    ) {
      work.minutesInBlock = 0;
      work.completedBlocks += 1;
      work.progress = Math.min(
        100,
        work.progress + BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_PROGRESS,
      );
      if (work.completedBlocks === 2 && work.progress < 100) {
        work.alert = {
          id: `work-alert:${work.activeGigId}:2`,
          cueLabel: "강아지가 문 쪽 소리에 반응합니다.",
          publicClues: [
            "짧게 몸을 일으켰습니다.",
            "업무는 절반까지 진행되었습니다.",
          ],
          interruptPreview: "진행도는 유지하고 돌봄을 우선합니다.",
          continuePreview: "업무를 이어가되 무리한 제지는 하지 않습니다.",
        };
        work.active = false;
        break;
      }
    }
  }

  let payout = 0;
  if (work.progress === 100 && work.activeGigId !== null) {
    const gigId = work.activeGigId;
    if (!work.paidGigIds.includes(gigId)) {
      payout = Math.round(
        BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY *
          (1 + salaryBonusRate(economy)),
      );
      economy = withLedger({
        ...economy,
        money: economy.money + payout,
      }, {
        id: `salary:${gigId}`,
        kind: "salary",
        moneyDelta: payout,
        carePointDelta: 0,
        itemId: null,
        quantityDelta: 0,
      });
      work.paidGigIds = [...work.paidGigIds, gigId];
      if (work.continuityEligible) {
        const reward = awardCarePoints(
          economy,
          `work-continuity:${gigId}`,
          BALANCE.LIFESTYLE.ECONOMY.WORK.CONTINUITY_CARE_POINTS,
        );
        if (reward.ok) economy = reward.state;
      }
    }
    work.active = false;
    work.lastPayout = payout;
  }
  return {
    ok: true,
    reason: null,
    economy,
    work,
    payout,
    completed: work.progress === 100,
  };
};

export const ownerDogFootprintsOverlap = (
  owner: OwnerSpatialState,
  dog: Pick<DogSpatialState, "room" | "x" | "y">,
): boolean => {
  if (owner.room !== dog.room) return false;
  const distance = Math.hypot(owner.x - dog.x, owner.y - dog.y);
  return distance <
    owner.collisionRadius +
      BALANCE.LIFESTYLE.OWNER.DOG_COLLISION_RADIUS;
};

const circleOverlapsOwnerOrDog = (
  room: RoomId,
  x: number,
  y: number,
  radius: number,
  owner: OwnerSpatialState,
  dog: Pick<DogSpatialState, "room" | "x" | "y">,
): boolean => {
  const overlaps = (
    targetRoom: RoomId,
    targetX: number,
    targetY: number,
    targetRadius: number,
  ): boolean =>
    room === targetRoom &&
    Math.hypot(x - targetX, y - targetY) < radius + targetRadius;
  return overlaps(owner.room, owner.x, owner.y, owner.collisionRadius) ||
    overlaps(
      dog.room,
      dog.x,
      dog.y,
      BALANCE.LIFESTYLE.OWNER.DOG_COLLISION_RADIUS,
    );
};

const validCoordinate = (value: number): boolean =>
  Number.isFinite(value) &&
  value >= BALANCE.LIFESTYLE.PLACEMENT.MIN_COORDINATE &&
  value <= BALANCE.LIFESTYLE.PLACEMENT.MAX_COORDINATE;

export const validatePadPlacement = (
  placement: PadPlacement,
  owner: OwnerSpatialState,
  dog: Pick<DogSpatialState, "room" | "x" | "y">,
): PlacementValidation => {
  const item = catalogById(placement.itemId);
  if (item === undefined || item.coverage === undefined) {
    return { ok: false, reason: "알 수 없는 패드 품목입니다." };
  }
  if (
    !validCoordinate(placement.x) || !validCoordinate(placement.y) ||
    item.coverage !== placement.coverage ||
    placement.x - placement.coverage < 0 ||
    placement.x + placement.coverage > 1 ||
    placement.y - placement.coverage < 0 ||
    placement.y + placement.coverage > 1
  ) {
    return { ok: false, reason: "패드가 방 경계를 벗어납니다." };
  }
  if (
    circleOverlapsOwnerOrDog(
      placement.room,
      placement.x,
      placement.y,
      placement.coverage,
      owner,
      dog,
    )
  ) {
    return { ok: false, reason: "보호자나 강아지 위에는 패드를 놓을 수 없습니다." };
  }
  return { ok: true, reason: null };
};

const rectanglesOverlap = (
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean =>
  Math.abs(first.x - second.x) * 2 < first.width + second.width &&
  Math.abs(first.y - second.y) * 2 < first.height + second.height;

const rectangleOverlapsCircle = (
  placement: BarrierPlacement,
  circle: { room: RoomId; x: number; y: number; radius: number },
): boolean => {
  if (placement.room !== circle.room) return false;
  const halfWidth = placement.width / 2;
  const halfHeight = placement.height / 2;
  const closestX = Math.max(
    placement.x - halfWidth,
    Math.min(circle.x, placement.x + halfWidth),
  );
  const closestY = Math.max(
    placement.y - halfHeight,
    Math.min(circle.y, placement.y + halfHeight),
  );
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.radius;
};

export const validateBarrierPlacement = (
  placement: BarrierPlacement,
  owner: OwnerSpatialState,
  dog: Pick<DogSpatialState, "room" | "x" | "y">,
  existing: readonly BarrierPlacement[] = [],
): PlacementValidation => {
  const item = catalogById(placement.itemId);
  if (item === undefined || item.panels === undefined) {
    return { ok: false, reason: "알 수 없는 칸막이 품목입니다." };
  }
  if (
    item.panels !== placement.panels ||
    !validCoordinate(placement.x) || !validCoordinate(placement.y) ||
    !isFiniteNumber(placement.width) || !isFiniteNumber(placement.height) ||
    placement.width < BALANCE.LIFESTYLE.PLACEMENT.MIN_BARRIER_SIZE ||
    placement.height < BALANCE.LIFESTYLE.PLACEMENT.MIN_BARRIER_SIZE ||
    placement.width > BALANCE.LIFESTYLE.PLACEMENT.MAX_BARRIER_SIZE ||
    placement.height > BALANCE.LIFESTYLE.PLACEMENT.MAX_BARRIER_SIZE ||
    placement.x - placement.width / 2 < 0 ||
    placement.x + placement.width / 2 > 1 ||
    placement.y - placement.height / 2 < 0 ||
    placement.y + placement.height / 2 > 1
  ) {
    return { ok: false, reason: "칸막이 크기나 위치가 올바르지 않습니다." };
  }
  if (
    placement.panels === 4 &&
    placement.width * placement.height <
      BALANCE.LIFESTYLE.PLACEMENT.MIN_ENCLOSURE_AREA
  ) {
    return { ok: false, reason: "강아지가 머물기에는 구역이 너무 좁습니다." };
  }
  if (
    rectangleOverlapsCircle(placement, {
      room: owner.room,
      x: owner.x,
      y: owner.y,
      radius: owner.collisionRadius,
    }) ||
    rectangleOverlapsCircle(placement, {
      room: dog.room,
      x: dog.x,
      y: dog.y,
      radius: BALANCE.LIFESTYLE.OWNER.DOG_COLLISION_RADIUS,
    })
  ) {
    return { ok: false, reason: "보호자나 강아지 위에는 칸막이를 놓을 수 없습니다." };
  }
  const barrierRect = {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  };
  const blocksDoorway = BALANCE.LIFESTYLE.PLACEMENT.DOORWAYS[
    placement.room
  ].some((doorway) =>
    rectanglesOverlap(barrierRect, {
      x: doorway.x + doorway.width / 2,
      y: doorway.y + doorway.height / 2,
      width: doorway.width,
      height: doorway.height,
    })
  );
  if (blocksDoorway) {
    return { ok: false, reason: "출입구를 완전히 막을 수 없습니다." };
  }
  if (
    existing.some((other) =>
      other.room === placement.room &&
      rectanglesOverlap(barrierRect, other)
    )
  ) {
    return { ok: false, reason: "기존 칸막이와 겹칩니다." };
  }
  return { ok: true, reason: null };
};

export const isEconomyState = (value: unknown): value is EconomyState => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "money",
      "carePoints",
      "inventory",
      "unlockedItemIds",
      "salaryUpgrades",
      "ledger",
      "firstRewardIds",
      "clinicCouponAvailable",
      "preventiveVisitCompleted",
      "revision",
    ]) ||
    !isNonNegativeInteger(value.money) ||
    !isNonNegativeInteger(value.carePoints) ||
    !Array.isArray(value.unlockedItemIds) ||
    !value.unlockedItemIds.every(isCatalogItemId) ||
    new Set(value.unlockedItemIds).size !== value.unlockedItemIds.length ||
    !Array.isArray(value.salaryUpgrades) ||
    !value.salaryUpgrades.every(isSalaryUpgradeId) ||
    new Set(value.salaryUpgrades).size !== value.salaryUpgrades.length ||
    !Array.isArray(value.firstRewardIds) ||
    !value.firstRewardIds.every((id) => typeof id === "string") ||
    new Set(value.firstRewardIds).size !== value.firstRewardIds.length ||
    typeof value.clinicCouponAvailable !== "boolean" ||
    typeof value.preventiveVisitCompleted !== "boolean" ||
    !isNonNegativeInteger(value.revision) ||
    !Array.isArray(value.ledger)
  ) {
    return false;
  }
  const inventory = value.inventory;
  if (
    !isRecord(inventory) ||
    !hasExactKeys(inventory, CATALOG_ITEM_IDS) ||
    !CATALOG_ITEM_IDS.every((id) =>
      isNonNegativeInteger(inventory[id]) &&
      (inventory[id] as number) <=
        BALANCE.LIFESTYLE.ECONOMY.MAX_INVENTORY
    )
  ) {
    return false;
  }
  const validLedger = value.ledger.every((entry) =>
    isRecord(entry) &&
    hasExactKeys(entry, [
      "id",
      "kind",
      "moneyDelta",
      "carePointDelta",
      "itemId",
      "quantityDelta",
      "revision",
    ]) &&
    typeof entry.id === "string" && entry.id.length > 0 &&
    [
      "purchase",
      "consume",
      "salary",
      "careReward",
      "clinic",
      "upgrade",
    ].includes(
      entry.kind as string,
    ) &&
    Number.isInteger(entry.moneyDelta) &&
    Number.isInteger(entry.carePointDelta) &&
    (entry.itemId === null || isCatalogItemId(entry.itemId)) &&
    Number.isInteger(entry.quantityDelta) &&
    isNonNegativeInteger(entry.revision)
  );
  if (!validLedger) return false;
  const state = value as unknown as EconomyState;
  const ledger = state.ledger;
  if (
    new Set(ledger.map((entry) => entry.id)).size !== ledger.length ||
    state.revision !== ledger.length ||
    !ledger.every((entry, index) => entry.revision === index + 1)
  ) {
    return false;
  }
  const kindsAreConsistent = ledger.every((entry) => {
    if (entry.kind === "purchase") {
      const item = entry.itemId === null
        ? undefined
        : catalogById(entry.itemId);
      return item !== undefined &&
        entry.id.length > 0 &&
        entry.moneyDelta === -item.price * entry.quantityDelta &&
        entry.carePointDelta === 0 &&
        entry.itemId !== null &&
        entry.itemId !== "clinic-preventive" &&
        entry.quantityDelta > 0;
    }
    if (entry.kind === "consume") {
      return entry.moneyDelta === 0 &&
        entry.carePointDelta === 0 &&
        entry.itemId !== null &&
        entry.itemId !== "clinic-preventive" &&
        entry.quantityDelta < 0;
    }
    if (entry.kind === "salary") {
      return entry.id.startsWith("salary:") &&
        entry.moneyDelta >= BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY &&
        entry.carePointDelta === 0 &&
        entry.itemId === null &&
        entry.quantityDelta === 0;
    }
    if (entry.kind === "careReward") {
      return entry.id.startsWith("care:") &&
        entry.moneyDelta === 0 &&
        entry.carePointDelta > 0 &&
        entry.itemId === null &&
        entry.quantityDelta === 0;
    }
    if (entry.kind === "clinic") {
      const clinicPrice = catalogById("clinic-preventive")!.price;
      return (entry.moneyDelta === 0 ||
          entry.moneyDelta === -clinicPrice) &&
        entry.carePointDelta === 0 &&
        entry.itemId === "clinic-preventive" &&
        entry.quantityDelta === 0;
    }
    const upgrade = entry.id.startsWith("upgrade:")
      ? upgradeById(entry.id.replace(/^upgrade:/, "") as SalaryUpgradeId)
      : undefined;
    return upgrade !== undefined &&
      entry.moneyDelta === 0 &&
      entry.carePointDelta === -upgrade.carePointCost &&
      entry.itemId === null &&
      entry.quantityDelta === 0;
  });
  if (!kindsAreConsistent) return false;
  let replayedMoney = BALANCE.LIFESTYLE.ECONOMY.STARTER_MONEY;
  let replayedCarePoints = 0;
  const replayedInventory = createInventory();
  const ledgerPrefixesAreNonNegative = ledger.every((entry) => {
    replayedMoney += entry.moneyDelta;
    replayedCarePoints += entry.carePointDelta;
    if (entry.itemId !== null) {
      replayedInventory[entry.itemId] += entry.quantityDelta;
    }
    return replayedMoney >= 0 &&
      replayedCarePoints >= 0 &&
      CATALOG_ITEM_IDS.every((id) => replayedInventory[id] >= 0);
  });
  if (!ledgerPrefixesAreNonNegative) return false;
  const replayedSalaryUpgrades: SalaryUpgradeId[] = [];
  const salariesAreCanonical = ledger.every((entry) => {
    if (entry.kind === "upgrade") {
      const upgradeId = entry.id.replace(/^upgrade:/, "") as SalaryUpgradeId;
      if (upgradeById(upgradeId) === undefined) return false;
      replayedSalaryUpgrades.push(upgradeId);
      return true;
    }
    if (entry.kind !== "salary") return true;
    const bonusRate = Math.min(
      BALANCE.LIFESTYLE.ECONOMY.WORK.MAX_SALARY_BONUS_RATE,
      replayedSalaryUpgrades.reduce(
        (sum, id) => sum + (upgradeById(id)?.bonusRate ?? 0),
        0,
      ),
    );
    return entry.moneyDelta === Math.round(
      BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY * (1 + bonusRate),
    );
  });
  if (!salariesAreCanonical) return false;

  const expectedMoney = BALANCE.LIFESTYLE.ECONOMY.STARTER_MONEY +
    ledger.reduce((sum, entry) => sum + entry.moneyDelta, 0);
  const expectedCarePoints = ledger.reduce(
    (sum, entry) => sum + entry.carePointDelta,
    0,
  );
  const inventoryMatches = CATALOG_ITEM_IDS.every((id) =>
    state.inventory[id] ===
      BALANCE.LIFESTYLE.ECONOMY.STARTER_INVENTORY[id] +
        ledger.reduce(
          (sum, entry) =>
            sum + (entry.itemId === id ? entry.quantityDelta : 0),
          0,
        )
  );
  const rewardedIds = ledger
    .filter((entry) => entry.kind === "careReward")
    .map((entry) => entry.id.replace(/^care:/, ""));
  const upgradeIds = ledger
    .filter((entry) => entry.kind === "upgrade")
    .map((entry) => entry.id.replace(/^upgrade:/, ""));
  const lifetimeCarePoints = ledger.reduce(
    (sum, entry) =>
      sum + (entry.kind === "careReward" ? entry.carePointDelta : 0),
    0,
  );
  const expectedUnlocks = CATALOG.filter((item) =>
    item.unlockCarePoints <= lifetimeCarePoints
  ).map((item) => item.id);
  const sameSet = (first: readonly string[], second: readonly string[]) =>
    first.length === second.length &&
    first.every((entry) => second.includes(entry));
  return state.money === expectedMoney &&
    state.carePoints === expectedCarePoints &&
    inventoryMatches &&
    sameSet(state.firstRewardIds, rewardedIds) &&
    sameSet(state.salaryUpgrades, upgradeIds) &&
    sameSet(state.unlockedItemIds, expectedUnlocks) &&
    state.preventiveVisitCompleted ===
      ledger.some((entry) => entry.kind === "clinic");
};

export const isWorkState = (value: unknown): value is WorkState => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
    "activeGigId",
    "progress",
    "completedBlocks",
    "minutesInBlock",
    "active",
    "continuityEligible",
    "paidGigIds",
    "lastPayout",
      "alert",
    ]) ||
    (value.activeGigId !== null &&
      typeof value.activeGigId !== "string") ||
    ![0, 25, 50, 75, 100].includes(value.progress as number) ||
    !isNonNegativeInteger(value.completedBlocks) ||
    (value.completedBlocks as number) > 4 ||
    !isNonNegativeInteger(value.minutesInBlock) ||
    (value.minutesInBlock as number) >=
      BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES ||
    typeof value.active !== "boolean" ||
    typeof value.continuityEligible !== "boolean" ||
    !Array.isArray(value.paidGigIds) ||
    !value.paidGigIds.every((id) => typeof id === "string") ||
    new Set(value.paidGigIds).size !== value.paidGigIds.length ||
    !isNonNegativeInteger(value.lastPayout) ||
    (value.alert !== null &&
      (!isRecord(value.alert) ||
        !hasExactKeys(value.alert, [
        "id",
        "cueLabel",
        "publicClues",
        "interruptPreview",
        "continuePreview",
        ]) ||
        typeof value.alert.id !== "string" ||
        typeof value.alert.cueLabel !== "string" ||
        !Array.isArray(value.alert.publicClues) ||
        !value.alert.publicClues.every((clue) => typeof clue === "string") ||
        typeof value.alert.interruptPreview !== "string" ||
        typeof value.alert.continuePreview !== "string"))
  ) {
    return false;
  }
  const state = value as unknown as WorkState;
  return state.progress ===
      state.completedBlocks *
        BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_PROGRESS &&
    (state.activeGigId !== null ||
      (state.progress === 0 &&
        state.completedBlocks === 0 &&
        state.minutesInBlock === 0 &&
        !state.active &&
        state.alert === null)) &&
    (!state.active ||
      (state.activeGigId !== null &&
        state.progress < 100 &&
        state.alert === null)) &&
    (state.alert === null ||
      (state.activeGigId !== null &&
        state.progress === 50 &&
        state.completedBlocks === 2 &&
        !state.active &&
        state.alert.id === `work-alert:${state.activeGigId}:2`)) &&
    (state.progress !== 100 ||
      (state.activeGigId !== null &&
        !state.active &&
        state.alert === null &&
        state.paidGigIds.includes(state.activeGigId)));
};

const isPadPlacement = (value: unknown): value is PadPlacement =>
  isRecord(value) &&
  hasExactKeys(value, ["itemId", "room", "x", "y", "coverage"]) &&
  isPadItemId(value.itemId) &&
  ["living", "kitchen", "toilet"].includes(value.room as string) &&
  isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
  isFiniteNumber(value.coverage);

const isBarrierPlacement = (value: unknown): value is BarrierPlacement =>
  isRecord(value) &&
  hasExactKeys(value, [
    "id",
    "itemId",
    "room",
    "x",
    "y",
    "width",
    "height",
    "panels",
  ]) &&
  typeof value.id === "string" &&
  isBarrierItemId(value.itemId) &&
  ["living", "kitchen", "toilet"].includes(value.room as string) &&
  isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
  isFiniteNumber(value.width) && isFiniteNumber(value.height) &&
  [1, 2, 4].includes(value.panels as number);

export const isEnvironmentState = (
  value: unknown,
): value is EnvironmentState => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["selectedPadId", "padPlacement", "barriers"]) ||
    !isPadItemId(value.selectedPadId) ||
    (value.padPlacement !== null && !isPadPlacement(value.padPlacement)) ||
    !Array.isArray(value.barriers) ||
    !value.barriers.every(isBarrierPlacement)
  ) {
    return false;
  }
  const environment = value as unknown as EnvironmentState;
  const pad = environment.padPlacement;
  if (pad !== null) {
    const item = catalogById(pad.itemId);
    if (
      environment.selectedPadId !== pad.itemId ||
      item?.coverage !== pad.coverage ||
      !validCoordinate(pad.x) ||
      !validCoordinate(pad.y) ||
      pad.x - pad.coverage < 0 ||
      pad.x + pad.coverage > 1 ||
      pad.y - pad.coverage < 0 ||
      pad.y + pad.coverage > 1
    ) {
      return false;
    }
  }
  if (
    new Set(environment.barriers.map((barrier) => barrier.id)).size !==
    environment.barriers.length
  ) {
    return false;
  }
  return environment.barriers.every((barrier, index) => {
    const item = catalogById(barrier.itemId);
    const withinBounds = item?.panels === barrier.panels &&
      barrier.id.length > 0 &&
      validCoordinate(barrier.x) &&
      validCoordinate(barrier.y) &&
      barrier.width >= BALANCE.LIFESTYLE.PLACEMENT.MIN_BARRIER_SIZE &&
      barrier.height >= BALANCE.LIFESTYLE.PLACEMENT.MIN_BARRIER_SIZE &&
      barrier.width <= BALANCE.LIFESTYLE.PLACEMENT.MAX_BARRIER_SIZE &&
      barrier.height <= BALANCE.LIFESTYLE.PLACEMENT.MAX_BARRIER_SIZE &&
      barrier.x - barrier.width / 2 >= 0 &&
      barrier.x + barrier.width / 2 <= 1 &&
      barrier.y - barrier.height / 2 >= 0 &&
      barrier.y + barrier.height / 2 <= 1 &&
      (barrier.panels !== 4 ||
        barrier.width * barrier.height >=
          BALANCE.LIFESTYLE.PLACEMENT.MIN_ENCLOSURE_AREA);
    if (!withinBounds) return false;
    const blocksDoorway = BALANCE.LIFESTYLE.PLACEMENT.DOORWAYS[
      barrier.room
    ].some((doorway) =>
      rectanglesOverlap(barrier, {
        x: doorway.x + doorway.width / 2,
        y: doorway.y + doorway.height / 2,
        width: doorway.width,
        height: doorway.height,
      })
    );
    return !blocksDoorway &&
      environment.barriers.slice(0, index).every((previous) =>
        previous.room !== barrier.room ||
        !rectanglesOverlap(previous, barrier)
      );
  });
};
