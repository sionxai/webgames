import { BALANCE, ROOMS, SIGNALS } from "../constants/balance";
import { createRng, type WaitdogRng } from "../core/rng";
import {
  advanceEncounterInputSeconds,
  dismissEncounterOutcome as dismissEncounterOutcomeState,
  encounterCarePoints,
  encounterOutcomeDelta,
  ENCOUNTER_IDS,
  getEncounterPublicView,
  isEncounterDirectorState,
  markEncounterResultApplied,
  requestEncounterHint as requestEncounterHintState,
  selectEncounterCause as selectEncounterCauseState,
  selectEncounterReinforcement as selectEncounterReinforcementState,
  selectEncounterResponse as selectEncounterResponseState,
  startEncounterById as startEncounterByIdState,
  startNextEncounter as startNextEncounterState,
  createEncounterDirectorState,
  type EncounterTransition,
} from "./encounters";
import {
  advanceWorkMilliseconds,
  advanceWorkMinutes,
  awardCarePoints,
  buySalaryUpgrade as buySalaryUpgradeState,
  CATALOG,
  consumeItem,
  createEconomyState,
  createEnvironmentState,
  createWorkState,
  grantClinicCoupon,
  isEconomyState,
  isEnvironmentState,
  isFoodItemId,
  isWorkState,
  ownerDogFootprintSeparation,
  ownerDogFootprintsOverlap,
  purchaseItem as purchaseCatalogItem,
  resolveWorkAlert as resolveWorkAlertState,
  SALARY_UPGRADES,
  salaryBonusRate,
  startWorkGig,
  validateBarrierPlacement,
  validatePadPlacement,
  type WorkTransition,
} from "./economy";
import type {
  ActionId,
  ActionUtilityTrace,
  ActivePoop,
  DecisionTrace,
  DigestionItem,
  DogActivityId,
  DogSpatialState,
  DogSpatialView,
  DogSpatialWaypoint,
  DogStats,
  DogView,
  EconomyState,
  EncounterDirectorState,
  EncounterId,
  EncounterPublicView,
  EnvironmentState,
  EventLog,
  FoodItemId,
  InterventionKind,
  InterventionResult,
  LearningMemory,
  LifestyleActionResult,
  MatSkill,
  MemoryKey,
  OwnerState,
  OwnerSpatialState,
  PadItemId,
  BarrierItemId,
  BarrierPlacement,
  CatalogItemId,
  SalaryUpgradeId,
  Personality,
  PoopPrediction,
  RoomId,
  SignalType,
  Visibility,
  WaitdogFullState,
  WaitdogSim,
  WaitdogSimOptions,
  WorkState,
} from "../types";

interface ScheduledSignal {
  at: number;
  type: SignalType;
  emitted: boolean;
}

interface LastBehavior {
  action: ActionId;
  at: number;
  room: RoomId;
}

export interface WaitdogUiEvent {
  t: number;
  type: string;
  room: RoomId | null;
  visibility: Exclude<Visibility, "hidden">;
  detail: Record<string, unknown>;
}

export interface WaitdogUiView extends DogView {
  day: number;
  minuteOfDay: number;
  owner: Pick<Required<OwnerState>, "room" | "focusLocked">;
  roomVisibility: Record<RoomId, Visibility>;
  blocked: boolean;
  activePoop: Pick<ActivePoop, "room" | "location"> | null;
  recentEvents: WaitdogUiEvent[];
  poopRevision: number;
  ownerSpatial: OwnerSpatialState & { radius: number };
  activeEncounter: EncounterPublicView | null;
  pausedForEncounter: boolean;
  work: WaitdogWorkView;
  economy: WaitdogEconomyView;
  inventory: WaitdogInventoryView[];
  catalog: WaitdogCatalogView[];
  clinic: {
    couponAvailable: boolean;
    preventiveVisitCompleted: boolean;
  };
  upgrades: WaitdogUpgradeView[];
  environmentPlacements: EnvironmentState;
  ownerDogOverlap: boolean;
  interaction: WaitdogInteractionView;
}

export interface WaitdogInteractionView {
  encounterDistance: number | null;
  encounterReady: boolean;
  nearbyTarget: WorldTargetId | null;
  directControlEnabled: boolean;
  targets: WorldInteractionTarget[];
  contextActions: WorldContextAction[];
}

export type WorldTargetId =
  | "dog"
  | "cue"
  | "computer"
  | "foodBowl"
  | "waterBowl"
  | "activePoop"
  | "bath"
  | `door:${RoomId}`;

export type WorldTargetKind =
  | "dog"
  | "cue"
  | "computer"
  | "foodBowl"
  | "waterBowl"
  | "activePoop"
  | "bath"
  | "door";

export interface WorldContextAction {
  id: string;
  label: string;
  enabled: boolean;
  reason: string | null;
  itemId?: CatalogItemId;
}

export interface WorldInteractionTarget {
  id: WorldTargetId;
  kind: WorldTargetKind;
  room: RoomId;
  x: number;
  y: number;
  distance: number | null;
  nearby: boolean;
  actions: WorldContextAction[];
}

export interface WaitdogWorkView {
  state: "idle" | "moving" | "ready" | "working" | "alert" | "complete";
  active: boolean;
  progress: number;
  seated: boolean;
  canStart: boolean;
  blockMinutes: number;
  salaryPreview: number;
  alert: WorkState["alert"];
  activeGigId: string | null;
}

export interface WaitdogEconomyView {
  money: number;
  carePoints: number;
  salaryBonusPercent: number;
}

export interface WaitdogInventoryView {
  itemId: CatalogItemId;
  count: number;
  effectSummary: string;
}

export interface WaitdogCatalogView {
  itemId: CatalogItemId;
  category: string;
  label: string;
  price: number;
  effectSummary: string;
  unlockCarePoints: number;
  locked: boolean;
  coverage?: number;
  panels?: 1 | 2 | 4;
}

export interface WaitdogUpgradeView {
  id: SalaryUpgradeId;
  label: string;
  carePointCost: number;
  bonusPercent: number;
  purchased: boolean;
}

export type OwnerMoveTarget =
  | { room: RoomId; x: number; y: number }
  | { hotspotId: "computer" | "store" | "clinic" };

export interface OwnerDirectMoveInput {
  dx: number;
  dy: number;
  elapsedMs?: number;
}

export interface OwnerClickMoveTarget {
  room: RoomId;
  x: number;
  y: number;
  elapsedMs?: number;
}

export type OwnerEncounterAction =
  | { type: "observe" }
  | { type: "response"; choiceId: string }
  | {
    type: "reinforcement";
    choiceId: "praise" | "treat";
  };

export type ItemPlacementTarget =
  | { room: RoomId; x: number; y: number }
  | {
    room: RoomId;
    x: number;
    y: number;
    width: number;
    height: number;
    placementId?: string;
  };

export interface WaitdogUiSim extends WaitdogSim {
  getDogView(): WaitdogUiView;
  serialize(): WaitdogSnapshot;
  restore(snapshot: unknown): void;
  ensureFirstEncounter(): LifestyleActionResult;
  suggestAutoEncounter(excludeId?: EncounterId | null): EncounterId | null;
  startNextEncounter(): LifestyleActionResult;
  startEncounter(encounterId: EncounterId): LifestyleActionResult;
  selectEncounterCause(choiceId: string): LifestyleActionResult;
  selectEncounterResponse(choiceId: string): LifestyleActionResult;
  selectEncounterReinforcement(choiceId: string): LifestyleActionResult;
  advanceEncounterInput(seconds: number): LifestyleActionResult;
  requestEncounterHint(): LifestyleActionResult;
  dismissEncounterOutcome(): LifestyleActionResult;
  moveOwnerTo(target: OwnerMoveTarget): LifestyleActionResult;
  moveOwnerBy(input: OwnerDirectMoveInput): LifestyleActionResult;
  stepOwnerToward(target: OwnerClickMoveTarget): LifestyleActionResult;
  performEncounterAction(action: OwnerEncounterAction): LifestyleActionResult;
  performWorldAction(actionId: string): LifestyleActionResult;
  sitAtComputer(gigId?: string): LifestyleActionResult;
  advanceWorkHold(elapsedMs: number): LifestyleActionResult;
  performWorkBlock(gigId?: string): LifestyleActionResult;
  resolveWorkAlert(choice: "interrupt" | "continue"): LifestyleActionResult;
  purchaseItem(
    itemId: CatalogItemId,
    quantity?: number,
    transactionId?: string,
  ): LifestyleActionResult;
  useItem(
    itemId: CatalogItemId,
    quantity?: number,
    transactionId?: string,
  ): LifestyleActionResult;
  fillFoodBowl(
    itemId: FoodItemId,
    transactionId?: string,
  ): LifestyleActionResult;
  fillWaterBowl(): LifestyleActionResult;
  cleanWaterBowl(): LifestyleActionResult;
  placeItem(
    itemId: PadItemId | BarrierItemId,
    target: ItemPlacementTarget,
    transactionId?: string,
  ): LifestyleActionResult;
  scheduleClinic(transactionId?: string): LifestyleActionResult;
  buyUpgrade(upgradeId: SalaryUpgradeId): LifestyleActionResult;
}

export const WORLD_STATIONS = {
  computer: { ...BALANCE.LIFESTYLE.OWNER.HOTSPOT.computer },
  foodBowl: { ...BALANCE.SPATIAL.TARGET.FOOD },
  waterBowl: { ...BALANCE.SPATIAL.TARGET.WATER },
  bath: { ...BALANCE.LIFESTYLE.OWNER.BATH },
} as const;

export interface WaitdogSnapshotV2 {
  version: 2;
  seed: number;
  rngCursor: number;
  day: number;
  minuteOfDay: number;
  absoluteMinute: number;
  dogRoom: RoomId;
  owner: Required<OwnerState>;
  personality: Personality;
  stats: DogStats;
  memory: LearningMemory;
  matSkill: MatSkill;
  matSkillOwnerAway: number;
  blocked: boolean;
  currentAction: ActionId | "idle";
  actionStartedAt: number;
  digestionQueue: DigestionItem[];
  activePoop: ActivePoop | null;
  pendingEatAt: number | null;
  poopDueAt: number | null;
  pendingPressurePerMinute: number | null;
  scheduledSignals: ScheduledSignal[];
  lastBehavior: LastBehavior | null;
  lastCalmSuccessAt: number | null;
  cleanupUntil: number | null;
  lastDigestedFeedAt: number | null;
  poopDelayHistory: number[];
  log: EventLog[];
  poopRevision: number;
  spatial: DogSpatialState;
  opportunityRevision: number;
  visibleOpportunityRevision: number;
}

export type WaitdogSnapshotV1 = Omit<
  WaitdogSnapshotV2,
  | "version"
  | "spatial"
  | "opportunityRevision"
  | "visibleOpportunityRevision"
> & {
  version: 1;
};

export interface WaitdogSnapshotV3
  extends Omit<WaitdogSnapshotV2, "version"> {
  version: 3;
  ownerSpatial: OwnerSpatialState;
  encounterDirector: EncounterDirectorState;
  economy: EconomyState;
  work: Omit<WorkState, "seated">;
  environment: Omit<EnvironmentState, "foodBowl" | "waterBowl">;
}

export interface WaitdogSnapshot
  extends Omit<
    WaitdogSnapshotV3,
    "version" | "work" | "environment"
  > {
  version: 4;
  work: WorkState;
  environment: EnvironmentState;
}

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) {
    return BALANCE.NUMBER.ZERO;
  }
  return Math.max(
    BALANCE.NUMBER.ZERO,
    Math.min(BALANCE.NUMBER.ONE_HUNDRED, value),
  );
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isRoom = (value: string): value is RoomId =>
  (ROOMS as readonly string[]).includes(value);

const ACTIONS: ReadonlyArray<ActionId | "idle"> = [
  "idle",
  "eatPoop",
  "moveToMat",
  "watchOwner",
  "flee",
  "sniffLeave",
  "zoomies",
];

const ACTIVITIES: readonly DogActivityId[] = [
  "idle",
  "rest",
  "seekFood",
  "seekWater",
  "followOwner",
  "play",
  "wander",
  "patrol",
  "eatPoop",
  "moveToMat",
  "watchOwner",
  "flee",
  "sniffLeave",
  "zoomies",
  "sniffFloor",
  "circle",
  "poop",
];

const VISIBILITIES: readonly Visibility[] = ["seen", "heard", "hidden"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBoundedNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= BALANCE.NUMBER.ZERO &&
  value <= BALANCE.NUMBER.ONE_HUNDRED;

const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) &&
  value >= BALANCE.NUMBER.ZERO;

const isNullableInteger = (value: unknown): value is number | null =>
  value === null || isNonNegativeInteger(value);

const hasBoundedNumbers = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> =>
  isRecord(value) && hasExactKeys(value, keys) &&
  keys.every((key) => isBoundedNumber(value[key]));

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return true;
  if (isFiniteNumber(value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
};

const SNAPSHOT_V1_KEYS: ReadonlyArray<keyof WaitdogSnapshotV1> = [
  "version",
  "seed",
  "rngCursor",
  "day",
  "minuteOfDay",
  "absoluteMinute",
  "dogRoom",
  "owner",
  "personality",
  "stats",
  "memory",
  "matSkill",
  "matSkillOwnerAway",
  "blocked",
  "currentAction",
  "actionStartedAt",
  "digestionQueue",
  "activePoop",
  "pendingEatAt",
  "poopDueAt",
  "pendingPressurePerMinute",
  "scheduledSignals",
  "lastBehavior",
  "lastCalmSuccessAt",
  "cleanupUntil",
  "lastDigestedFeedAt",
  "poopDelayHistory",
  "log",
  "poopRevision",
];

const SNAPSHOT_V2_KEYS: ReadonlyArray<keyof WaitdogSnapshotV2> = [
  ...SNAPSHOT_V1_KEYS,
  "spatial",
  "opportunityRevision",
  "visibleOpportunityRevision",
];

const SNAPSHOT_V3_KEYS: ReadonlyArray<keyof WaitdogSnapshotV3> = [
  ...SNAPSHOT_V2_KEYS,
  "ownerSpatial",
  "encounterDirector",
  "economy",
  "work",
  "environment",
];

const SNAPSHOT_KEYS: ReadonlyArray<keyof WaitdogSnapshot> = [
  ...SNAPSHOT_V3_KEYS,
];

const invalidSnapshot = (): never => {
  throw new RangeError("snapshot is not a valid Waitdog simulation snapshot");
};

const requireNonNegative = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < BALANCE.NUMBER.ZERO) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
  return Math.floor(value);
};

const requirePositiveVolume = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= BALANCE.NUMBER.ZERO) {
    throw new RangeError(`${label} must be a finite positive number`);
  }
  return Math.min(BALANCE.NUMBER.ONE_HUNDRED, value);
};

class WaitdogSimulation implements WaitdogUiSim {
  private rng: WaitdogRng;
  private seed: number;
  private rngCursor = 0;
  private day: number = BALANCE.NUMBER.ONE;
  private minuteOfDay: number = BALANCE.TIME.DAY_START;
  private absoluteMinute: number = BALANCE.TIME.DAY_START;
  private dogRoom: RoomId;
  private owner: Required<OwnerState>;
  private readonly personality: Personality;
  private readonly stats: DogStats = clone(BALANCE.INITIAL.STATS);
  private readonly memory: LearningMemory = clone(BALANCE.INITIAL.MEMORY);
  private readonly matSkill: MatSkill = {
    living: BALANCE.INITIAL.MAT_SKILL,
    kitchen: BALANCE.INITIAL.MAT_SKILL,
    toilet: BALANCE.INITIAL.MAT_SKILL,
  };
  private matSkillOwnerAway: number = BALANCE.INITIAL.MAT_SKILL_OWNER_AWAY;
  private blocked = false;
  private currentAction: ActionId | "idle" = "idle";
  private actionStartedAt: number = BALANCE.TIME.DAY_START;
  private digestionQueue: DigestionItem[] = [];
  private activePoop: ActivePoop | null = null;
  private pendingEatAt: number | null = null;
  private poopDueAt: number | null = null;
  private pendingPressurePerMinute: number | null = null;
  private scheduledSignals: ScheduledSignal[] = [];
  private lastBehavior: LastBehavior | null = null;
  private lastCalmSuccessAt: number | null = null;
  private cleanupUntil: number | null = null;
  private lastDigestedFeedAt: number | null = null;
  private readonly poopDelayHistory: number[] = [];
  private readonly log: EventLog[] = [];
  private poopRevision = 0;
  private spatial: DogSpatialState;
  private opportunityRevision = 0;
  private visibleOpportunityRevision = 0;
  private ownerSpatial: OwnerSpatialState;
  private encounterDirector: EncounterDirectorState =
    createEncounterDirectorState();
  private economy: EconomyState = createEconomyState();
  private work: WorkState = createWorkState();
  private environment: EnvironmentState = createEnvironmentState();

  constructor(seed: number, opts: WaitdogSimOptions = {}) {
    if (!Number.isFinite(seed)) {
      throw new RangeError("seed must be finite");
    }
    this.seed = seed;
    this.rng = this.createCountedRng(seed);
    this.dogRoom = opts.dogRoom ?? "living";
    if (!isRoom(this.dogRoom)) {
      throw new RangeError("dogRoom must be a known room");
    }
    const initialPosition = BALANCE.SPATIAL.INITIAL[this.dogRoom];
    this.spatial = {
      room: this.dogRoom,
      x: initialPosition.x,
      y: initialPosition.y,
      targetRoom: this.dogRoom,
      targetX: initialPosition.x,
      targetY: initialPosition.y,
      route: [],
      activity: "idle",
      moving: false,
      nextActivityAt: this.absoluteMinute +
        BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES,
    };
    this.owner = this.normalizeOwner(
      opts.owner ?? { room: "living", focusLocked: false },
    );
    const ownerPosition = BALANCE.LIFESTYLE.OWNER.INITIAL[this.owner.room];
    this.ownerSpatial = {
      room: this.owner.room,
      x: ownerPosition.x,
      y: ownerPosition.y,
      targetRoom: this.owner.room,
      targetX: ownerPosition.x,
      targetY: ownerPosition.y,
      route: [],
      activity: "idle",
      destinationActivity: "idle",
      moving: false,
      collisionRadius: BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS,
    };
    this.personality = {
      foodDrive: this.personalityValue(),
      impulsivity: this.personalityValue(),
      sensitivity: this.personalityValue(),
      sociability: this.personalityValue(),
      adaptability: this.personalityValue(),
    };
    this.record("dayStart", this.dogRoom, { day: this.day });
  }

  advanceMinutes(minutes: number): void {
    const requested = requireNonNegative(minutes, "minutes");
    if (this.encounterDirector.active !== null) {
      return;
    }
    const available = Math.max(
      BALANCE.NUMBER.ZERO,
      BALANCE.TIME.DAY_END - this.minuteOfDay,
    );
    const ticks = Math.min(requested, available);
    for (
      let elapsed = BALANCE.NUMBER.ZERO;
      elapsed < ticks;
      elapsed += BALANCE.TIME.TICK_MINUTES
    ) {
      this.tick();
    }
  }

  feed(volume: number): void {
    if (this.encounterDirector.active !== null) return;
    const safeVolume = requirePositiveVolume(volume, "volume");
    const variation = this.rng.range(
      -BALANCE.DIGESTION.VARIANCE_MINUTES,
      BALANCE.DIGESTION.VARIANCE_MINUTES,
    );
    const stressDelay = (this.stats.stress / BALANCE.NUMBER.ONE_HUNDRED) *
      BALANCE.DIGESTION.STRESS_DELAY_MAX_MINUTES;
    const dueAt = Math.round(
      this.absoluteMinute + BALANCE.DIGESTION.BASE_MINUTES + variation +
        stressDelay,
    );
    this.digestionQueue.push({
      fedAt: this.absoluteMinute,
      dueAt,
      volume: safeVolume,
    });
    this.stats.hunger = clamp(
      this.stats.hunger -
        safeVolume * BALANCE.PHYSIOLOGY.FEED_HUNGER_REDUCTION_PER_VOLUME,
    );
    this.stats.comfort = clamp(
      this.stats.comfort +
        safeVolume * BALANCE.PHYSIOLOGY.FEED_COMFORT_GAIN_PER_VOLUME,
    );
    this.record("feed", this.dogRoom, { volume: safeVolume, dueAt });
    this.clampAll();
  }

  water(
    volume: number = BALANCE.PHYSIOLOGY.WATER_DEFAULT_VOLUME,
  ): void {
    if (this.encounterDirector.active !== null) return;
    const safeVolume = requirePositiveVolume(volume, "volume");
    this.stats.thirst = clamp(
      this.stats.thirst -
        safeVolume * BALANCE.PHYSIOLOGY.WATER_THIRST_REDUCTION_PER_VOLUME,
    );
    this.record("water", this.dogRoom, { volume: safeVolume });
  }

  walk(minutes: number): void {
    if (this.encounterDirector.active !== null) return;
    const duration = this.activityDuration(minutes);
    this.record("walk", this.dogRoom, { minutes: duration });
    this.stats.hunger += duration * BALANCE.PHYSIOLOGY.WALK_HUNGER_PER_MINUTE;
    this.stats.thirst += duration * BALANCE.PHYSIOLOGY.WALK_THIRST_PER_MINUTE;
    this.stats.fatigue += duration * BALANCE.PHYSIOLOGY.WALK_FATIGUE_PER_MINUTE;
    this.stats.stress -= duration *
      BALANCE.PHYSIOLOGY.WALK_STRESS_REDUCTION_PER_MINUTE;
    this.stats.boredom -= duration *
      BALANCE.PHYSIOLOGY.WALK_BOREDOM_REDUCTION_PER_MINUTE;
    this.accelerateDigestion(
      duration * BALANCE.DIGESTION.WALK_CORRECTION_PER_MINUTE,
    );
    this.clampAll();
    this.advanceMinutes(duration);
  }

  play(minutes: number): void {
    if (this.encounterDirector.active !== null) return;
    const duration = this.activityDuration(minutes);
    this.record("play", this.dogRoom, { minutes: duration });
    this.stats.hunger += duration * BALANCE.PHYSIOLOGY.PLAY_HUNGER_PER_MINUTE;
    this.stats.thirst += duration * BALANCE.PHYSIOLOGY.PLAY_THIRST_PER_MINUTE;
    this.stats.fatigue += duration * BALANCE.PHYSIOLOGY.PLAY_FATIGUE_PER_MINUTE;
    this.stats.stress -= duration *
      BALANCE.PHYSIOLOGY.PLAY_STRESS_REDUCTION_PER_MINUTE;
    this.stats.excitement += duration *
      BALANCE.PHYSIOLOGY.PLAY_EXCITEMENT_PER_MINUTE;
    this.stats.boredom -= duration *
      BALANCE.PHYSIOLOGY.PLAY_BOREDOM_REDUCTION_PER_MINUTE;
    this.accelerateDigestion(
      duration * BALANCE.DIGESTION.PLAY_CORRECTION_PER_MINUTE,
    );
    this.clampAll();
    this.advanceMinutes(duration);
  }

  setOwner(owner: OwnerState): void {
    if (this.encounterDirector.active !== null) return;
    if (
      this.work.alert !== null &&
      owner.room !== this.owner.room
    ) {
      return;
    }
    const previousRoom = this.owner.room;
    if (owner.room !== previousRoom) this.leaveWorkSeatForMovement();
    this.owner = this.normalizeOwner(owner);
    if (previousRoom !== this.owner.room) {
      this.relocateOwnerSpatial(this.owner.room);
    }
    this.record("ownerState", this.owner.room, {
      focusLocked: this.owner.focusLocked,
      away: this.owner.away,
    });
  }

  intervene(kind: InterventionKind): InterventionResult {
    if (this.encounterDirector.active !== null) {
      return {
        kind,
        interrupted: this.owner.focusLocked,
        success: false,
      };
    }
    const interrupted = this.owner.focusLocked;
    let success = true;
    let attributedTo: ActionId | undefined;

    switch (kind) {
      case "calmCall": {
        const probability = BALANCE.INTERVENTION.CALM_BASE_CHANCE +
          this.memory.recallTrust * BALANCE.INTERVENTION.CALM_RECALL_FACTOR -
          this.stats.excitement * BALANCE.INTERVENTION.CALM_EXCITEMENT_FACTOR;
        success = this.rng.chance(probability);
        if (success) {
          this.dogRoom = this.owner.room;
          this.relocateSpatial(this.owner.room);
          this.changeMemory(
            "approachSafety",
            BALANCE.LEARNING.CALM_APPROACH_GAIN,
          );
          this.lastCalmSuccessAt = this.absoluteMinute;
          this.setBehavior("watchOwner");
        }
        break;
      }
      case "matCommand": {
        const skill = this.owner.away
          ? this.matSkillOwnerAway
          : this.matSkill[this.dogRoom];
        const probability = BALANCE.INTERVENTION.MAT_BASE_CHANCE +
          skill * BALANCE.INTERVENTION.MAT_SKILL_FACTOR -
          this.stats.stress * BALANCE.INTERVENTION.MAT_STRESS_FACTOR;
        success = this.rng.chance(probability);
        if (success) {
          this.setBehavior("moveToMat");
          this.cancelPendingEat();
        } else if (this.owner.away) {
          this.matSkillOwnerAway = clamp(
            this.matSkillOwnerAway - BALANCE.LEARNING.MAT_FAILURE_LOSS,
          );
        } else {
          this.matSkill[this.dogRoom] = clamp(
            this.matSkill[this.dogRoom] - BALANCE.LEARNING.MAT_FAILURE_LOSS,
          );
        }
        break;
      }
      case "praise":
      case "treat": {
        attributedTo = this.rewardRecentBehavior();
        if (
          kind === "treat" &&
          this.lastCalmSuccessAt !== null &&
          this.absoluteMinute - this.lastCalmSuccessAt <=
            BALANCE.TIME.CALM_REWARD_WINDOW_MINUTES
        ) {
          this.changeMemory("recallTrust", BALANCE.LEARNING.CALM_RECALL_GAIN);
          this.lastCalmSuccessAt = null;
        }
        break;
      }
      case "toyLure": {
        const probability = BALANCE.INTERVENTION.TOY_BASE_CHANCE +
          this.stats.boredom * BALANCE.INTERVENTION.TOY_BOREDOM_FACTOR -
          this.personality.foodDrive *
            BALANCE.INTERVENTION.TOY_FOOD_DRIVE_FACTOR;
        success = this.rng.chance(probability);
        if (success) {
          this.cancelPendingEat();
          this.setBehavior("sniffLeave");
        }
        break;
      }
      case "block": {
        this.blocked = !this.blocked;
        if (this.isEffectivelyBlocked() && this.pendingEatAt !== null) {
          this.cancelPendingEat();
          this.setBehavior("sniffLeave");
        }
        break;
      }
      case "scold": {
        const stopped = this.rng.chance(BALANCE.INTERVENTION.SCOLD_STOP_CHANCE);
        success = stopped;
        if (stopped) {
          this.cancelPendingEat();
          this.currentAction = "idle";
          this.stopSpatialActivity();
        }
        this.stats.excitement += BALANCE.INTERVENTION.SCOLD_EXCITEMENT_GAIN;
        this.stats.stress += BALANCE.INTERVENTION.SCOLD_STRESS_GAIN;
        this.changeMemory(
          "approachSafety",
          -BALANCE.LEARNING.SCOLD_APPROACH_LOSS,
        );
        this.changeMemory(
          "snatchExpectation",
          BALANCE.LEARNING.SCOLD_SNATCH_GAIN,
        );
        this.changeMemory(
          "hiddenPoopTendency",
          BALANCE.LEARNING.SCOLD_HIDDEN_GAIN,
        );
        break;
      }
      case "cleanup": {
        const activeMinutesRemaining = BALANCE.TIME.DAY_END - this.minuteOfDay;
        success = this.activePoop !== null &&
          activeMinutesRemaining >= BALANCE.TIME.CLEANUP_MINUTES;
        if (success) {
          this.activePoop = null;
          this.cancelPendingEat();
          if (this.currentAction === "eatPoop") {
            this.currentAction = "idle";
            this.stopSpatialActivity();
          }
          this.cleanupUntil = this.absoluteMinute +
            BALANCE.TIME.CLEANUP_MINUTES;
        }
        break;
      }
    }

    this.clampAll();
    this.record("intervention", this.dogRoom, {
      kind,
      success,
      interrupted,
      attributedTo: attributedTo ?? null,
      blocked: this.isEffectivelyBlocked(),
    });
    if (kind === "cleanup" && success) {
      this.advanceMinutes(BALANCE.TIME.CLEANUP_MINUTES);
    }
    return { kind, interrupted, success, attributedTo };
  }

  ensureFirstEncounter(): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: true, reason: null };
    }
    if (
      this.encounterDirector.completedCount > 0 ||
      this.encounterDirector.nextRevision > 0
    ) {
      return { ok: false, reason: "첫 encounter는 이미 시작되었습니다." };
    }
    return this.startNextEncounter();
  }

  startNextEncounter(): LifestyleActionResult {
    if (this.work.active) {
      return { ok: false, reason: "진행 중인 업무를 먼저 마쳐야 합니다." };
    }
    if (this.work.alert !== null) {
      return { ok: false, reason: "업무 알림에 먼저 응답해 주세요." };
    }
    return this.commitEncounterTransition(
      startNextEncounterState(this.encounterDirector, this.seed),
    );
  }

  startEncounter(encounterId: EncounterId): LifestyleActionResult {
    if (this.work.active) {
      return { ok: false, reason: "진행 중인 업무를 먼저 마쳐야 합니다." };
    }
    if (this.work.alert !== null) {
      return { ok: false, reason: "업무 알림에 먼저 응답해 주세요." };
    }
    if (!(ENCOUNTER_IDS as readonly unknown[]).includes(encounterId)) {
      return { ok: false, reason: "알 수 없는 encounter입니다." };
    }
    return this.commitEncounterTransition(
      startEncounterByIdState(this.encounterDirector, encounterId, this.seed),
    );
  }

  selectEncounterCause(choiceId: string): LifestyleActionResult {
    return this.commitEncounterTransition(
      selectEncounterCauseState(this.encounterDirector, choiceId),
    );
  }

  selectEncounterResponse(choiceId: string): LifestyleActionResult {
    return this.commitEncounterTransition(
      selectEncounterResponseState(this.encounterDirector, choiceId),
    );
  }

  selectEncounterReinforcement(choiceId: string): LifestyleActionResult {
    const active = this.encounterDirector.active;
    const treatId = active?.stage === "reinforcement" &&
        active.requiredReinforcement === "treat"
      ? this.availableTreatId()
      : null;
    if (
      active?.stage === "reinforcement" &&
      active.requiredReinforcement === "treat" &&
      choiceId === "treat" &&
      treatId === null
    ) {
      return {
        ok: false,
        reason: "후속 보상에 사용할 간식 재고가 없습니다.",
      };
    }

    const transition = selectEncounterReinforcementState(
      this.encounterDirector,
      choiceId,
      active?.stage === "reinforcement" &&
        active.requiredReinforcement === "treat" &&
        choiceId === "praise" &&
        treatId === null,
    );
    let inventoryDelta: Partial<EconomyState["inventory"]> = {};
    if (transition.completedNow && treatId !== null && active !== null) {
      const consumed = consumeItem(
        this.economy,
        treatId,
        1,
        `encounter-reward:${active.instanceId}`,
      );
      if (!consumed.ok) {
        return { ok: false, reason: consumed.reason };
      }
      this.economy = consumed.state;
      inventoryDelta = { [treatId]: -1 };
    }
    return this.commitEncounterTransition(transition, inventoryDelta);
  }

  performEncounterAction(
    action: OwnerEncounterAction,
  ): LifestyleActionResult {
    if (!isRecord(action)) {
      return { ok: false, reason: "상호작용 입력이 올바르지 않습니다." };
    }
    const active = this.encounterDirector.active;
    if (active === null) {
      return { ok: false, reason: "가까이에서 확인할 encounter가 없습니다." };
    }
    if (
      action.type !== "observe" &&
      action.type !== "response" &&
      action.type !== "reinforcement"
    ) {
      return { ok: false, reason: "알 수 없는 encounter 상호작용입니다." };
    }
    if (
      action.type === "response" &&
      typeof action.choiceId !== "string"
    ) {
      return { ok: false, reason: "대응 선택지가 올바르지 않습니다." };
    }
    if (
      action.type === "reinforcement" &&
      action.choiceId !== "praise" &&
      action.choiceId !== "treat"
    ) {
      return { ok: false, reason: "후속 보상 선택지가 올바르지 않습니다." };
    }
    if (
      !this.encounterInteractionState().ready &&
      !this.activeEncounterWasAutomaticallyStarted()
    ) {
      return {
        ok: false,
        reason: "상황 신호 가까이 이동한 뒤 상호작용해 주세요.",
      };
    }
    if (action.type === "observe") {
      return this.commitEncounterTransition(
        selectEncounterCauseState(
          this.encounterDirector,
          active.hiddenCauseId,
        ),
      );
    }
    if (action.type === "response") {
      return this.selectEncounterResponse(action.choiceId);
    }
    return this.selectEncounterReinforcement(action.choiceId);
  }

  advanceEncounterInput(seconds: number): LifestyleActionResult {
    return this.commitEncounterTransition(
      advanceEncounterInputSeconds(this.encounterDirector, seconds),
    );
  }

  requestEncounterHint(): LifestyleActionResult {
    return this.commitEncounterTransition(
      requestEncounterHintState(this.encounterDirector, this.day),
    );
  }

  dismissEncounterOutcome(): LifestyleActionResult {
    const transition = dismissEncounterOutcomeState(this.encounterDirector);
    this.encounterDirector = transition.state;
    if (transition.ok) {
      this.ownerSpatial.activity = this.work.active ? "working" : "idle";
      this.ownerSpatial.destinationActivity = this.ownerSpatial.activity;
      this.record("encounterDismissed", this.dogRoom, {});
    }
    return { ok: transition.ok, reason: transition.reason };
  }

  moveOwnerTo(target: OwnerMoveTarget): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (this.work.alert !== null) {
      return { ok: false, reason: "업무 알림에 먼저 응답해 주세요." };
    }
    if (!isRecord(target)) {
      return { ok: false, reason: "보호자 목적지가 올바르지 않습니다." };
    }
    let destination: { room: RoomId; x: number; y: number };
    if ("hotspotId" in target) {
      if (
        !["computer", "store", "clinic"].includes(
          target.hotspotId as string,
        )
      ) {
        return { ok: false, reason: "알 수 없는 보호자 목적지입니다." };
      }
      destination = BALANCE.LIFESTYLE.OWNER.HOTSPOT[
        target.hotspotId as keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT
      ];
    } else {
      destination = target;
    }
    if (
      !isRoom(destination.room) ||
      !isFiniteNumber(destination.x) ||
      !isFiniteNumber(destination.y) ||
      destination.x < BALANCE.SPATIAL.MIN_COORDINATE ||
      destination.x > BALANCE.SPATIAL.MAX_COORDINATE ||
      destination.y < BALANCE.SPATIAL.MIN_COORDINATE ||
      destination.y > BALANCE.SPATIAL.MAX_COORDINATE
    ) {
      return { ok: false, reason: "보호자 목적지가 올바르지 않습니다." };
    }
    this.leaveWorkSeatForMovement();
    this.setOwnerSpatialGoal(
      destination.room,
      destination.x,
      destination.y,
      "idle",
    );
    this.record("ownerMove", this.owner.room, {
      targetRoom: destination.room,
      targetX: this.clampCoordinate(destination.x),
      targetY: this.clampCoordinate(destination.y),
    });
    return { ok: true, reason: null };
  }

  moveOwnerBy(input: OwnerDirectMoveInput): LifestyleActionResult {
    if (
      !isRecord(input) ||
      !isFiniteNumber(input.dx) ||
      !isFiniteNumber(input.dy) ||
      Math.abs(input.dx) > BALANCE.NUMBER.ONE ||
      Math.abs(input.dy) > BALANCE.NUMBER.ONE ||
      (input.elapsedMs !== undefined &&
        (!isFiniteNumber(input.elapsedMs) ||
          input.elapsedMs <= 0 ||
          input.elapsedMs >
            BALANCE.LIFESTYLE.OWNER.MAX_INPUT_DELTA_MS))
    ) {
      return {
        ok: false,
        reason: "직접 이동 벡터는 -1부터 1 사이의 유한값이어야 합니다.",
      };
    }
    const componentScale = Math.max(Math.abs(input.dx), Math.abs(input.dy));
    if (componentScale === BALANCE.NUMBER.ZERO) {
      return { ok: false, reason: "0벡터로는 보호자를 이동할 수 없습니다." };
    }
    const scaledX = input.dx / componentScale;
    const scaledY = input.dy / componentScale;
    const magnitude = Math.hypot(scaledX, scaledY);
    const blockedReason = this.directControlBlockedReason();
    if (blockedReason !== null) {
      return { ok: false, reason: blockedReason };
    }
    this.leaveWorkSeatForMovement();

    const directionX = scaledX / magnitude;
    const directionY = scaledY / magnitude;
    const step = this.ownerStepDistance(input.elapsedMs);
    const nextX = this.ownerSpatial.x + directionX * step;
    const nextY = this.ownerSpatial.y + directionY * step;
    const transition = this.directDoorTransition(nextX, nextY, directionX);
    const prior = {
      room: this.ownerSpatial.room,
      x: this.ownerSpatial.x,
      y: this.ownerSpatial.y,
    };
    const moved = transition === null
      ? this.tryMoveOwnerWithinRoom(nextX, nextY)
      : this.trySetOwnerPosition(
        transition.room,
        transition.x,
        transition.y,
      );
    if (
      !moved ||
      prior.room === this.ownerSpatial.room &&
      prior.x === this.ownerSpatial.x &&
      prior.y === this.ownerSpatial.y
    ) {
      return { ok: false, reason: "벽 바깥으로 이동할 수 없습니다." };
    }
    this.finishDirectOwnerStep();
    return { ok: true, reason: null };
  }

  stepOwnerToward(target: OwnerClickMoveTarget): LifestyleActionResult {
    if (
      !isRecord(target) ||
      !isRoom(target.room) ||
      !isFiniteNumber(target.x) ||
      !isFiniteNumber(target.y) ||
      target.x < BALANCE.SPATIAL.MIN_COORDINATE ||
      target.x > BALANCE.SPATIAL.MAX_COORDINATE ||
      target.y < BALANCE.SPATIAL.MIN_COORDINATE ||
      target.y > BALANCE.SPATIAL.MAX_COORDINATE ||
      (target.elapsedMs !== undefined &&
        (!isFiniteNumber(target.elapsedMs) ||
          target.elapsedMs <= 0 ||
          target.elapsedMs >
            BALANCE.LIFESTYLE.OWNER.MAX_INPUT_DELTA_MS))
    ) {
      return { ok: false, reason: "클릭 이동 목적지가 올바르지 않습니다." };
    }
    const blockedReason = this.directControlBlockedReason();
    if (blockedReason !== null) {
      return { ok: false, reason: blockedReason };
    }
    this.leaveWorkSeatForMovement();

    const finalTarget: DogSpatialWaypoint = {
      room: target.room,
      x: target.x,
      y: target.y,
    };
    const [waypoint] = this.spatialWaypoints(
      this.ownerSpatial.room,
      finalTarget,
    );
    const prior = {
      room: this.ownerSpatial.room,
      x: this.ownerSpatial.x,
      y: this.ownerSpatial.y,
    };
    if (this.ownerSpatial.room !== waypoint.room) {
      const transition = this.transitionPoints(
        this.ownerSpatial.room,
        waypoint.room,
      );
      if (transition === null) {
        return { ok: false, reason: "연결되지 않은 방으로 이동할 수 없습니다." };
      }
      const arrived = this.moveOwnerFixedStepToward(
        transition.exit.x,
        transition.exit.y,
        target.elapsedMs,
      );
      if (arrived) {
        this.trySetOwnerPosition(
          waypoint.room,
          transition.entry.x,
          transition.entry.y,
        );
      }
    } else {
      this.moveOwnerFixedStepToward(
        waypoint.x,
        waypoint.y,
        target.elapsedMs,
      );
    }
    if (
      prior.room === this.ownerSpatial.room &&
      prior.x === this.ownerSpatial.x &&
      prior.y === this.ownerSpatial.y
    ) {
      return { ok: false, reason: "보호자가 이미 클릭 목적지에 있습니다." };
    }
    this.finishDirectOwnerStep();
    return { ok: true, reason: null };
  }

  sitAtComputer(
    gigId = `day-${this.day}-freelance`,
  ): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (!this.ownerNearHotspot("computer")) {
      return { ok: false, reason: "보호자를 컴퓨터 앞으로 이동시켜 주세요." };
    }
    if (this.work.alert !== null) {
      return { ok: false, reason: "업무 알림에 먼저 응답해 주세요." };
    }
    const started = startWorkGig(this.work, gigId);
    if (!started.ok) {
      return { ok: false, reason: started.reason };
    }
    const computer = WORLD_STATIONS.computer;
    if (
      this.ownerPositionOverlapsDog(
        computer.room,
        computer.x,
        computer.y,
      )
    ) {
      return {
        ok: false,
        reason: "강아지가 컴퓨터 앞에 있어 잠시 기다려 주세요.",
      };
    }
    this.work = started.state;
    this.snapOwnerToHotspot("computer");
    this.ownerSpatial.activity = "working";
    this.ownerSpatial.destinationActivity = "working";
    return { ok: true, reason: null };
  }

  advanceWorkHold(elapsedMs: number): LifestyleActionResult {
    if (
      !isFiniteNumber(elapsedMs) ||
      elapsedMs <= 0 ||
      elapsedMs > 60_000
    ) {
      return { ok: false, reason: "누르고 있던 시간이 올바르지 않습니다." };
    }
    if (!this.work.seated || !this.ownerAtHotspot("computer")) {
      return { ok: false, reason: "컴퓨터에 앉은 뒤 업무 키를 눌러 주세요." };
    }
    if (this.work.alert !== null) {
      return { ok: false, reason: "업무 알림에 먼저 응답해 주세요." };
    }
    const priorProgress = this.work.progress;
    const transition = advanceWorkMilliseconds(
      this.economy,
      this.work,
      elapsedMs,
    );
    if (!transition.ok) {
      return { ok: false, reason: transition.reason };
    }
    this.economy = transition.economy;
    this.work = transition.work;
    this.syncOwnerAfterWorkTransition(transition, priorProgress);
    return { ok: true, reason: null };
  }

  performWorkBlock(
    gigId = `day-${this.day}-freelance`,
  ): LifestyleActionResult {
    if (
      this.minuteOfDay + BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES >
      BALANCE.TIME.DAY_END
    ) {
      return { ok: false, reason: "오늘은 업무 한 블록을 마칠 시간이 부족합니다." };
    }
    const seated = this.sitAtComputer(gigId);
    if (!seated.ok) return seated;
    const priorProgress = this.work.progress;
    this.advanceMinutes(BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES);
    const transition = advanceWorkMinutes(
      this.economy,
      this.work,
      BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES,
    );
    if (!transition.ok) {
      return { ok: false, reason: transition.reason };
    }
    this.economy = transition.economy;
    this.work = transition.work;
    this.syncOwnerAfterWorkTransition(transition, priorProgress);
    if (this.work.progress === priorProgress) {
      return { ok: false, reason: "업무 진행도를 올리지 못했습니다." };
    }
    return { ok: true, reason: null };
  }

  resolveWorkAlert(choice: "interrupt" | "continue"): LifestyleActionResult {
    if (choice === "continue" && !this.ownerAtHotspot("computer")) {
      return { ok: false, reason: "컴퓨터 앞에서만 업무를 계속할 수 있습니다." };
    }
    const transition = resolveWorkAlertState(this.work, choice);
    this.work = transition.state;
    if (transition.ok) {
      this.ownerSpatial.activity = choice === "continue"
        ? "working"
        : "idle";
      this.ownerSpatial.destinationActivity = this.ownerSpatial.activity;
      this.record("workAlertResolved", this.owner.room, { choice });
    }
    return { ok: transition.ok, reason: transition.reason };
  }

  purchaseItem(
    itemId: CatalogItemId,
    quantity = 1,
    transactionId?: string,
  ): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    const transition = purchaseCatalogItem(
      this.economy,
      itemId,
      quantity,
      transactionId,
    );
    this.economy = transition.state;
    return { ok: transition.ok, reason: transition.reason };
  }

  useItem(
    itemId: CatalogItemId,
    quantity = 1,
    transactionId?: string,
  ): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션에서는 상황형 선택지를 사용해 주세요." };
    }
    const item = CATALOG.find((candidate) => candidate.id === itemId);
    if (
      item === undefined ||
      item.category === "pad" ||
      item.category === "barrier" ||
      item.category === "clinic"
    ) {
      return { ok: false, reason: "이 품목은 현재 방식으로 사용할 수 없습니다." };
    }
    if (item.category === "food") {
      return {
        ok: false,
        reason: "사료 그릇 가까이에서 사료를 골라 넣어 주세요.",
      };
    }
    const transition = consumeItem(
      this.economy,
      itemId,
      quantity,
      transactionId,
    );
    if (!transition.ok) {
      return { ok: false, reason: transition.reason };
    }
    this.economy = transition.state;
    if (item.category === "treat") {
      this.stats.stress = clamp(this.stats.stress - quantity);
      this.stats.comfort = clamp(this.stats.comfort + quantity);
    } else {
      this.stats.stress = clamp(this.stats.stress - 3 * quantity);
      this.stats.comfort = clamp(this.stats.comfort + 4 * quantity);
    }
    this.clampAll();
    return { ok: true, reason: null };
  }

  fillFoodBowl(
    itemId: FoodItemId,
    transactionId = `food-bowl:${this.economy.revision + 1}`,
  ): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (!isFoodItemId(itemId)) {
      return { ok: false, reason: "알 수 없는 사료입니다." };
    }
    if (!this.ownerNearStation(WORLD_STATIONS.foodBowl)) {
      return { ok: false, reason: "사료 그릇 가까이 이동해 주세요." };
    }
    if (this.environment.foodBowl.level > 0) {
      return { ok: false, reason: "사료 그릇에 아직 사료가 남아 있습니다." };
    }
    const consumed = consumeItem(
      this.economy,
      itemId,
      1,
      transactionId,
    );
    if (!consumed.ok) {
      return { ok: false, reason: consumed.reason };
    }
    this.economy = consumed.state;
    this.environment = {
      ...this.environment,
      foodBowl: {
        itemId,
        level: BALANCE.LIFESTYLE.ECONOMY.BOWLS.FOOD_FILL_LEVEL,
      },
    };
    this.setSpatialGoal(
      WORLD_STATIONS.foodBowl.room,
      WORLD_STATIONS.foodBowl.x,
      WORLD_STATIONS.foodBowl.y,
      "seekFood",
    );
    this.record("foodBowlFilled", WORLD_STATIONS.foodBowl.room, {
      itemId,
      level: this.environment.foodBowl.level,
    });
    return { ok: true, reason: null };
  }

  fillWaterBowl(): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (!this.ownerNearStation(WORLD_STATIONS.waterBowl)) {
      return { ok: false, reason: "물그릇 가까이 이동해 주세요." };
    }
    if (!this.environment.waterBowl.clean) {
      return { ok: false, reason: "물그릇을 먼저 씻어 주세요." };
    }
    if (
      this.environment.waterBowl.level ===
        BALANCE.LIFESTYLE.ECONOMY.BOWLS.WATER_FILL_LEVEL
    ) {
      return { ok: false, reason: "물그릇이 이미 가득 차 있습니다." };
    }
    this.environment = {
      ...this.environment,
      waterBowl: {
        level: BALANCE.LIFESTYLE.ECONOMY.BOWLS.WATER_FILL_LEVEL,
        clean: true,
      },
    };
    this.setSpatialGoal(
      WORLD_STATIONS.waterBowl.room,
      WORLD_STATIONS.waterBowl.x,
      WORLD_STATIONS.waterBowl.y,
      "seekWater",
    );
    this.record("waterBowlFilled", WORLD_STATIONS.waterBowl.room, {
      level: this.environment.waterBowl.level,
    });
    return { ok: true, reason: null };
  }

  cleanWaterBowl(): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (!this.ownerNearStation(WORLD_STATIONS.waterBowl)) {
      return { ok: false, reason: "물그릇 가까이 이동해 주세요." };
    }
    if (this.environment.waterBowl.clean) {
      return { ok: false, reason: "물그릇은 이미 깨끗합니다." };
    }
    this.environment = {
      ...this.environment,
      waterBowl: { level: 0, clean: true },
    };
    this.record("waterBowlCleaned", WORLD_STATIONS.waterBowl.room, {});
    return { ok: true, reason: null };
  }

  performWorldAction(actionId: string): LifestyleActionResult {
    if (typeof actionId !== "string" || actionId.length === 0) {
      return { ok: false, reason: "월드 상호작용 입력이 올바르지 않습니다." };
    }
    const interaction = this.worldInteractionState();
    const action = interaction.contextActions.find((candidate) =>
      candidate.id === actionId
    );
    if (action === undefined) {
      return { ok: false, reason: "가까이에서 사용할 수 없는 행동입니다." };
    }
    if (!action.enabled) {
      return { ok: false, reason: action.reason };
    }
    if (actionId === "encounter:observe") {
      return this.performEncounterAction({ type: "observe" });
    }
    if (actionId.startsWith("encounter:response:")) {
      return this.performEncounterAction({
        type: "response",
        choiceId: actionId.slice("encounter:response:".length),
      });
    }
    if (actionId.startsWith("encounter:reinforce:")) {
      const choiceId = actionId.slice("encounter:reinforce:".length);
      if (choiceId !== "praise" && choiceId !== "treat") {
        return { ok: false, reason: "후속 보상 입력이 올바르지 않습니다." };
      }
      return this.performEncounterAction({
        type: "reinforcement",
        choiceId,
      });
    }
    if (actionId === "encounter:dismiss") {
      return this.dismissEncounterOutcome();
    }
    if (actionId === "work:sit") return this.sitAtComputer();
    if (actionId.startsWith("food:")) {
      const itemId = actionId.slice("food:".length);
      return isFoodItemId(itemId)
        ? this.fillFoodBowl(itemId)
        : { ok: false, reason: "알 수 없는 사료입니다." };
    }
    if (actionId === "water:fill") return this.fillWaterBowl();
    if (actionId === "water:clean") return this.cleanWaterBowl();
    if (actionId === "poop:cleanup") {
      const result = this.intervene("cleanup");
      return {
        ok: result.success,
        reason: result.success ? null : "가까운 배변 흔적을 치울 수 없습니다.",
      };
    }
    if (actionId.startsWith("bath:")) {
      const itemId = actionId.slice("bath:".length);
      if (itemId !== "shampoo-gentle" && itemId !== "shampoo-quick") {
        return { ok: false, reason: "알 수 없는 목욕 용품입니다." };
      }
      return this.useItem(itemId);
    }
    if (actionId.startsWith("door:")) {
      const room = actionId.slice("door:".length);
      return isRoom(room)
        ? this.moveOwnerThroughDoor(room)
        : { ok: false, reason: "연결되지 않은 문입니다." };
    }
    return { ok: false, reason: "알 수 없는 월드 행동입니다." };
  }

  placeItem(
    itemId: PadItemId | BarrierItemId,
    target: ItemPlacementTarget,
    transactionId?: string,
  ): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    if (
      !isRecord(target) ||
      typeof target.room !== "string" ||
      !isRoom(target.room) ||
      !isFiniteNumber(target.x) ||
      !isFiniteNumber(target.y)
    ) {
      return { ok: false, reason: "배치 위치가 올바르지 않습니다." };
    }
    const item = CATALOG.find((candidate) => candidate.id === itemId);
    if (item === undefined) {
      return { ok: false, reason: "배치할 수 없는 품목입니다." };
    }
    if (item.category === "pad" && item.coverage !== undefined) {
      const placement = {
        itemId: itemId as PadItemId,
        room: target.room,
        x: target.x,
        y: target.y,
        coverage: item.coverage,
      };
      const validation = validatePadPlacement(
        placement,
        this.ownerSpatial,
        this.spatial,
      );
      if (!validation.ok) return validation;
      const consumed = consumeItem(
        this.economy,
        itemId,
        1,
        transactionId ?? `place-pad:${this.economy.revision + 1}`,
      );
      if (!consumed.ok) return { ok: false, reason: consumed.reason };
      this.economy = consumed.state;
      this.environment = {
        ...this.environment,
        selectedPadId: placement.itemId,
        padPlacement: placement,
      };
      return { ok: true, reason: null };
    }
    if (
      item.category !== "barrier" ||
      item.panels === undefined ||
      !("width" in target)
    ) {
      return { ok: false, reason: "칸막이 크기와 위치가 필요합니다." };
    }
    const placementId = target.placementId ??
      `barrier:${this.economy.revision + 1}`;
    if (
      this.environment.barriers.some((barrier) =>
        barrier.id === placementId
      )
    ) {
      return { ok: false, reason: "이미 사용 중인 칸막이 배치 ID입니다." };
    }
    const placement: BarrierPlacement = {
      id: placementId,
      itemId: itemId as BarrierItemId,
      room: target.room,
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      panels: item.panels,
    };
    const validation = validateBarrierPlacement(
      placement,
      this.ownerSpatial,
      this.spatial,
      this.environment.barriers,
    );
    if (!validation.ok) return validation;
    const consumed = consumeItem(
      this.economy,
      itemId,
      1,
      transactionId ?? `place-barrier:${placementId}`,
    );
    if (!consumed.ok) return { ok: false, reason: consumed.reason };
    this.economy = consumed.state;
    this.environment = {
      ...this.environment,
      barriers: [...this.environment.barriers, placement],
    };
    this.enforceEnvironmentBarrierBlock();
    return { ok: true, reason: null };
  }

  scheduleClinic(transactionId?: string): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    const transition = purchaseCatalogItem(
      this.economy,
      "clinic-preventive",
      1,
      transactionId,
    );
    this.economy = transition.state;
    return { ok: transition.ok, reason: transition.reason };
  }

  buyUpgrade(upgradeId: SalaryUpgradeId): LifestyleActionResult {
    if (this.encounterDirector.active !== null) {
      return { ok: false, reason: "활성 미션을 먼저 마쳐야 합니다." };
    }
    const transition = buySalaryUpgradeState(this.economy, upgradeId);
    this.economy = transition.state;
    return { ok: transition.ok, reason: transition.reason };
  }

  serialize(): WaitdogSnapshot {
    return clone({
      version: 4,
      seed: this.seed,
      rngCursor: this.rngCursor,
      day: this.day,
      minuteOfDay: this.minuteOfDay,
      absoluteMinute: this.absoluteMinute,
      dogRoom: this.dogRoom,
      owner: this.owner,
      personality: this.personality,
      stats: this.stats,
      memory: this.memory,
      matSkill: this.matSkill,
      matSkillOwnerAway: this.matSkillOwnerAway,
      blocked: this.blocked,
      currentAction: this.currentAction,
      actionStartedAt: this.actionStartedAt,
      digestionQueue: this.digestionQueue,
      activePoop: this.activePoop,
      pendingEatAt: this.pendingEatAt,
      poopDueAt: this.poopDueAt,
      pendingPressurePerMinute: this.pendingPressurePerMinute,
      scheduledSignals: this.scheduledSignals,
      lastBehavior: this.lastBehavior,
      lastCalmSuccessAt: this.lastCalmSuccessAt,
      cleanupUntil: this.cleanupUntil,
      lastDigestedFeedAt: this.lastDigestedFeedAt,
      poopDelayHistory: this.poopDelayHistory,
      log: this.log,
      poopRevision: this.poopRevision,
      spatial: this.spatial,
      opportunityRevision: this.opportunityRevision,
      visibleOpportunityRevision: this.visibleOpportunityRevision,
      ownerSpatial: this.ownerSpatial,
      encounterDirector: this.encounterDirector,
      economy: this.economy,
      work: this.work,
      environment: this.environment,
    });
  }

  restore(snapshot: unknown): void {
    let candidate: unknown;
    try {
      candidate = clone(snapshot);
    } catch {
      invalidSnapshot();
    }
    const restored = this.isValidSnapshot(candidate)
      ? candidate
      : this.isValidSnapshotV3(candidate)
      ? this.migrateSnapshotV3(candidate)
      : this.isValidSnapshotV2(candidate)
      ? this.migrateSnapshotV3(this.migrateSnapshotV2(candidate))
      : this.isValidSnapshotV1(candidate)
      ? this.migrateSnapshotV3(
        this.migrateSnapshotV2(this.migrateSnapshotV1(candidate)),
      )
      : invalidSnapshot();

    this.seed = restored.seed;
    this.rng = this.createCountedRng(restored.seed, restored.rngCursor);
    this.day = restored.day;
    this.minuteOfDay = restored.minuteOfDay;
    this.absoluteMinute = restored.absoluteMinute;
    this.dogRoom = restored.dogRoom;
    this.owner = restored.owner;
    Object.assign(this.personality, restored.personality);
    Object.assign(this.stats, restored.stats);
    Object.assign(this.memory, restored.memory);
    Object.assign(this.matSkill, restored.matSkill);
    this.matSkillOwnerAway = restored.matSkillOwnerAway;
    this.blocked = restored.blocked;
    this.currentAction = restored.currentAction;
    this.actionStartedAt = restored.actionStartedAt;
    this.digestionQueue = restored.digestionQueue;
    this.activePoop = restored.activePoop;
    this.pendingEatAt = restored.pendingEatAt;
    this.poopDueAt = restored.poopDueAt;
    this.pendingPressurePerMinute = restored.pendingPressurePerMinute;
    this.scheduledSignals = restored.scheduledSignals;
    this.lastBehavior = restored.lastBehavior;
    this.lastCalmSuccessAt = restored.lastCalmSuccessAt;
    this.cleanupUntil = restored.cleanupUntil;
    this.lastDigestedFeedAt = restored.lastDigestedFeedAt;
    this.poopDelayHistory.splice(
      BALANCE.NUMBER.ZERO,
      this.poopDelayHistory.length,
      ...restored.poopDelayHistory,
    );
    this.log.splice(BALANCE.NUMBER.ZERO, this.log.length, ...restored.log);
    this.poopRevision = restored.poopRevision;
    this.spatial = restored.spatial;
    this.opportunityRevision = restored.opportunityRevision;
    this.visibleOpportunityRevision = restored.visibleOpportunityRevision;
    this.ownerSpatial = restored.ownerSpatial;
    this.encounterDirector = restored.encounterDirector;
    this.economy = restored.economy;
    this.work = restored.work;
    this.environment = restored.environment;
  }

  getDogView(): WaitdogUiView {
    const visibility = this.visibilityFor(this.dogRoom);
    const seen = visibility === "seen";
    const roomVisibility: Record<RoomId, Visibility> = {
      living: this.visibilityFor("living"),
      kitchen: this.visibilityFor("kitchen"),
      toilet: this.visibilityFor("toilet"),
    };
    const activePoop =
      this.activePoop !== null &&
        roomVisibility[this.activePoop.room] === "seen"
        ? { room: this.activePoop.room, location: this.activePoop.location }
        : null;
    const spatial: DogSpatialView = seen
      ? {
        room: this.spatial.room,
        x: this.spatial.x,
        y: this.spatial.y,
        targetRoom: this.spatial.targetRoom,
        targetX: this.spatial.targetX,
        targetY: this.spatial.targetY,
        activity: this.spatial.activity,
        moving: this.spatial.moving,
      }
      : {
        room: null,
        x: null,
        y: null,
        targetRoom: null,
        targetX: null,
        targetY: null,
        activity: null,
        moving: null,
      };
    const recentEvents = this.log
      .filter((event) => event.visibility !== "hidden")
      .slice(-12)
      .map<WaitdogUiEvent>((event) =>
        event.visibility === "heard"
          ? {
            t: event.t,
            type: "sound",
            room: null,
            visibility: "heard",
            detail: {},
          }
          : {
            t: event.t,
            type: event.type,
            room: event.room,
            visibility: "seen",
            detail:
              event.type === "action" &&
                  typeof event.detail.action === "string"
                ? { action: event.detail.action }
                : event.type === "ambientAction" &&
                    typeof event.detail.activity === "string"
                ? { activity: event.detail.activity }
                : this.isImportantOpportunityType(event.type) &&
                    typeof event.detail.source === "string"
                ? { source: event.detail.source }
                : {},
          }
      );
    const encounterInteraction = this.encounterInteractionState();
    const worldInteraction = this.worldInteractionState();
    const atComputer = this.ownerNearHotspot("computer");
    const workState: WaitdogWorkView["state"] = this.work.alert !== null
      ? "alert"
      : this.work.progress === 100
      ? "complete"
      : this.ownerTargetingHotspot("computer") && this.ownerSpatial.moving
      ? "moving"
      : this.work.seated && this.work.active &&
          this.ownerSpatial.activity === "working"
      ? "working"
      : atComputer
      ? "ready"
      : "idle";
    const salaryBonus = salaryBonusRate(this.economy);
    return {
      t: this.absoluteMinute,
      visibility,
      room: seen ? this.dogRoom : null,
      action: seen ? this.currentAction : null,
      spatial,
      opportunityRevision: this.visibleOpportunityRevision,
      observableStats: seen ? clone(this.stats) : {},
      day: this.day,
      minuteOfDay: this.minuteOfDay,
      owner: {
        room: this.owner.room,
        focusLocked: this.owner.focusLocked,
      },
      roomVisibility,
      blocked: this.isEffectivelyBlocked(),
      activePoop,
      recentEvents,
      poopRevision: this.poopRevision,
      ownerSpatial: {
        ...clone(this.ownerSpatial),
        radius: this.ownerSpatial.collisionRadius,
      },
      activeEncounter: getEncounterPublicView(this.encounterDirector),
      pausedForEncounter: this.encounterDirector.active !== null,
      work: {
        state: workState,
        active: this.work.active,
        progress: this.work.progress,
        seated: this.work.seated,
        canStart: this.encounterDirector.active === null &&
          atComputer &&
          this.work.alert === null &&
          !this.work.active &&
          this.work.progress < 100,
        blockMinutes: BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES,
        salaryPreview: Math.round(
          BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY * (1 + salaryBonus),
        ),
        alert: clone(this.work.alert),
        activeGigId: this.work.activeGigId,
      },
      economy: {
        money: this.economy.money,
        carePoints: this.economy.carePoints,
        salaryBonusPercent: Math.round(salaryBonus * 100),
      },
      inventory: CATALOG.map((item) => ({
        itemId: item.id,
        count: this.economy.inventory[item.id],
        effectSummary: item.effect,
      })),
      catalog: CATALOG.map((item) => ({
        itemId: item.id,
        category: item.category,
        label: item.label,
        price: item.price,
        effectSummary: item.effect,
        unlockCarePoints: item.unlockCarePoints,
        locked: !this.economy.unlockedItemIds.includes(item.id),
        ...(item.coverage === undefined ? {} : { coverage: item.coverage }),
        ...(item.panels === undefined ? {} : { panels: item.panels }),
      })),
      clinic: {
        couponAvailable: this.economy.clinicCouponAvailable,
        preventiveVisitCompleted: this.economy.preventiveVisitCompleted,
      },
      upgrades: SALARY_UPGRADES.map((upgrade) => ({
        id: upgrade.id,
        label: upgrade.label,
        carePointCost: upgrade.carePointCost,
        bonusPercent: Math.round(upgrade.bonusRate * 100),
        purchased: this.economy.salaryUpgrades.includes(upgrade.id),
      })),
      environmentPlacements: clone(this.environment),
      ownerDogOverlap: ownerDogFootprintsOverlap(
        this.ownerSpatial,
        this.spatial,
      ),
      interaction: {
        encounterDistance: encounterInteraction.distance,
        encounterReady: encounterInteraction.ready,
        nearbyTarget: worldInteraction.nearbyTarget,
        directControlEnabled:
          this.directControlBlockedReason() === null,
        targets: worldInteraction.targets,
        contextActions: worldInteraction.contextActions,
      },
    };
  }

  getFullState(): WaitdogFullState {
    return clone({
      day: this.day,
      minuteOfDay: this.minuteOfDay,
      absoluteMinute: this.absoluteMinute,
      dogRoom: this.dogRoom,
      owner: this.owner,
      stats: this.stats,
      personality: this.personality,
      memory: this.memory,
      matSkill: this.matSkill,
      matSkillOwnerAway: this.matSkillOwnerAway,
      blocked: this.isEffectivelyBlocked(),
      currentAction: this.currentAction,
      spatial: this.spatial,
      ownerSpatial: this.ownerSpatial,
      encounterDirector: this.encounterDirector,
      economy: this.economy,
      work: this.work,
      environment: this.environment,
      ownerDogOverlap: ownerDogFootprintsOverlap(
        this.ownerSpatial,
        this.spatial,
      ),
      opportunityRevision: this.opportunityRevision,
      digestionQueue: this.digestionQueue,
      activePoop: this.activePoop,
    });
  }

  getLog(): EventLog[] {
    return clone(this.log);
  }

  predictPoopWindow(): PoopPrediction {
    let start: number;
    let end: number;

    if (this.poopDueAt !== null) {
      start = this.poopDueAt;
      end = this.poopDueAt;
    } else if (this.digestionQueue.length > BALANCE.NUMBER.ZERO) {
      const earliest = this.digestionQueue.reduce((candidate, item) =>
        item.dueAt < candidate.dueAt ? item : candidate
      );
      start = earliest.dueAt + BALANCE.DIGESTION.POOP_DELAY_MINUTES_MIN;
      end = earliest.dueAt + BALANCE.DIGESTION.POOP_DELAY_MINUTES_MAX;
    } else if (this.poopDelayHistory.length > BALANCE.NUMBER.ZERO) {
      const average = this.poopDelayHistory.reduce((sum, value) =>
        sum + value, BALANCE.NUMBER.ZERO) /
        this.poopDelayHistory.length;
      start = this.absoluteMinute +
        Math.max(
          BALANCE.NUMBER.ONE,
          average - BALANCE.DIGESTION.VARIANCE_MINUTES,
        );
      end = this.absoluteMinute + average + BALANCE.DIGESTION.VARIANCE_MINUTES;
    } else {
      start = this.absoluteMinute + BALANCE.PREDICTION.FALLBACK_START_MINUTES;
      end = this.absoluteMinute + BALANCE.PREDICTION.FALLBACK_END_MINUTES;
    }

    const confidence = clamp(
      BALANCE.PREDICTION.BASE_CONFIDENCE +
        (this.digestionQueue.length > BALANCE.NUMBER.ZERO ||
            this.poopDueAt !== null
          ? BALANCE.PREDICTION.QUEUE_CONFIDENCE
          : BALANCE.NUMBER.ZERO) +
        this.poopDelayHistory.length * BALANCE.PREDICTION.SAMPLE_CONFIDENCE,
    );
    return { start, end, confidence };
  }

  newDay(): void {
    if (this.encounterDirector.active !== null) return;
    this.day += BALANCE.NUMBER.ONE;
    this.minuteOfDay = BALANCE.TIME.DAY_START;
    this.absoluteMinute =
      (this.day - BALANCE.NUMBER.ONE) * BALANCE.TIME.DAY_LENGTH +
      BALANCE.TIME.DAY_START;
    this.activePoop = null;
    this.pendingEatAt = null;
    this.resetPoopCycle();
    this.currentAction = "idle";
    this.lastBehavior = null;
    this.lastCalmSuccessAt = null;
    this.cleanupUntil = null;
    this.spatial.activity = "idle";
    this.spatial.moving = false;
    this.spatial.route = [];
    this.spatial.targetRoom = this.spatial.room;
    this.spatial.targetX = this.spatial.x;
    this.spatial.targetY = this.spatial.y;
    this.spatial.nextActivityAt = this.absoluteMinute +
      BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES;
    this.ownerSpatial.activity = "idle";
    this.ownerSpatial.destinationActivity = "idle";
    this.ownerSpatial.moving = false;
    this.ownerSpatial.route = [];
    this.ownerSpatial.targetRoom = this.ownerSpatial.room;
    this.ownerSpatial.targetX = this.ownerSpatial.x;
    this.ownerSpatial.targetY = this.ownerSpatial.y;
    this.work = {
      ...createWorkState(),
      paidGigIds: [...this.work.paidGigIds],
    };
    if (this.day === 2) {
      const coupon = grantClinicCoupon(this.economy, this.day);
      if (coupon.ok) this.economy = coupon.state;
    }
    this.record("dayStart", this.dogRoom, { day: this.day });
  }

  private tick(): void {
    this.minuteOfDay += BALANCE.TIME.TICK_MINUTES;
    this.absoluteMinute += BALANCE.TIME.TICK_MINUTES;
    this.stats.hunger += BALANCE.PHYSIOLOGY.HUNGER_PER_MINUTE;
    this.stats.thirst += BALANCE.PHYSIOLOGY.THIRST_PER_MINUTE;
    this.stats.fatigue += BALANCE.PHYSIOLOGY.FATIGUE_PER_MINUTE;
    this.stats.boredom += BALANCE.PHYSIOLOGY.BOREDOM_PER_MINUTE;
    this.stats.stress -= BALANCE.PHYSIOLOGY.STRESS_RECOVERY_PER_MINUTE;
    this.stats.excitement -= BALANCE.PHYSIOLOGY.EXCITEMENT_RECOVERY_PER_MINUTE;
    this.stats.comfort -= BALANCE.PHYSIOLOGY.COMFORT_DECAY_PER_MINUTE;

    this.advanceOwnerMovement();
    this.advanceSpatialMovement();
    this.consumeBowlIfReady();
    this.enforceEnvironmentBarrierBlock();
    this.startAmbientActivityIfDue();
    this.advancePendingPressure();
    this.completeDigestion();
    this.emitScheduledSignals();
    if (this.poopDueAt !== null && this.absoluteMinute >= this.poopDueAt) {
      this.stats.bowelPressure = clamp(
        Math.max(this.stats.bowelPressure, BALANCE.DIGESTION.PRESSURE_POOP),
      );
      this.poop();
    }
    if (
      this.pendingEatAt !== null && this.absoluteMinute >= this.pendingEatAt
    ) {
      this.completeEating();
    }
    if (
      this.cleanupUntil !== null && this.absoluteMinute >= this.cleanupUntil
    ) {
      this.cleanupUntil = null;
      this.record("cleanupComplete", this.owner.room, {});
    }
    if (
      this.currentAction !== "idle" &&
      this.currentAction !== "eatPoop" &&
      this.absoluteMinute - this.actionStartedAt >
        BALANCE.TIME.ACTION_MEMORY_MINUTES
    ) {
      this.currentAction = "idle";
    }
    this.clampAll();
  }

  private commitEncounterTransition(
    transition: EncounterTransition,
    inventoryDelta: Partial<EconomyState["inventory"]> = {},
    automatic = false,
  ): LifestyleActionResult {
    const previousActive = this.encounterDirector.active;
    this.encounterDirector = transition.state;
    if (previousActive === null && this.encounterDirector.active !== null) {
      this.record("encounterStarted", this.dogRoom, {
        encounterId: this.encounterDirector.active.encounterId,
        ...(automatic
          ? {
            automatic: true,
            instanceId: this.encounterDirector.active.instanceId,
          }
          : {}),
      });
    }
    if (this.encounterDirector.active !== null) {
      this.stopOwnerMovement("responding");
    }
    if (transition.completedNow) {
      this.applyEncounterCompletion(inventoryDelta);
    }
    return { ok: transition.ok, reason: transition.reason };
  }

  suggestAutoEncounter(
    excludeId: EncounterId | null = null,
  ): EncounterId | null {
    if (
      this.encounterDirector.active !== null ||
      this.work.active ||
      this.work.alert !== null ||
      this.minuteOfDay >= BALANCE.TIME.DAY_END
    ) {
      return null;
    }

    const references = BALANCE.LIFESTYLE.ENCOUNTER.AUTO_SCORE_REFERENCE;
    const candidates: Array<{
      encounterId: EncounterId;
      score: number;
      tiePriority: number;
    }> = [
      {
        encounterId: "potty",
        score: this.stats.bowelPressure / references.bowelPressure,
        tiePriority: 0,
      },
      {
        encounterId: "overexcited",
        score: this.stats.excitement / references.excitement,
        tiePriority: 1,
      },
      {
        encounterId: "anxiety",
        score: this.stats.stress / references.stress,
        tiePriority: 2,
      },
      {
        encounterId: "settle",
        score: this.stats.boredom / references.boredom,
        tiePriority: 3,
      },
    ];
    const dominant = candidates
      .filter((candidate) =>
        candidate.encounterId !== excludeId &&
        (candidate.encounterId !== "potty" || this.activePoop === null)
      )
      .sort((first, second) =>
        second.score - first.score ||
        first.tiePriority - second.tiePriority
      )[0];
    return dominant?.encounterId ?? null;
  }

  private activeEncounterWasAutomaticallyStarted(): boolean {
    const active = this.encounterDirector.active;
    if (active === null) return false;
    for (let index = this.log.length - 1; index >= 0; index -= 1) {
      const entry = this.log[index];
      if (entry?.type !== "encounterStarted") continue;
      return entry.detail.automatic === true &&
        entry.detail.instanceId === active.instanceId;
    }
    return false;
  }

  private applyEncounterCompletion(
    inventoryDelta: Partial<EconomyState["inventory"]>,
  ): void {
    const active = this.encounterDirector.active;
    if (
      active === null ||
      active.stage !== "result" ||
      active.result === null ||
      active.resultApplied
    ) {
      return;
    }
    const delta = encounterOutcomeDelta(active.encounterId);
    for (
      const [key, value] of Object.entries(delta.stats) as Array<
        [keyof DogStats, number]
      >
    ) {
      this.stats[key] = clamp(this.stats[key] + value);
    }
    for (
      const [key, value] of Object.entries(delta.memory) as Array<
        [MemoryKey, number]
      >
    ) {
      this.changeMemory(key, value);
    }
    const points = encounterCarePoints(active.encounterId);
    const reward = awardCarePoints(
      this.economy,
      `day:${this.day}:encounter:${active.encounterId}`,
      points,
    );
    if (reward.ok) this.economy = reward.state;
    this.encounterDirector = markEncounterResultApplied(
      this.encounterDirector,
      reward.ok ? points : 0,
      reward.ok,
      inventoryDelta,
    );
    this.record("encounterComplete", this.dogRoom, {
      encounterId: active.encounterId,
      score: active.result.score,
      carePointsAwarded: reward.ok ? points : 0,
    });
    this.clampAll();
  }

  private syncOwnerAfterWorkTransition(
    transition: WorkTransition,
    priorProgress: number,
  ): void {
    if (this.work.progress !== priorProgress) {
      this.record("workProgress", this.owner.room, {
        progress: this.work.progress,
      });
    }
    if (this.work.alert !== null) {
      this.ownerSpatial.activity = "responding";
      this.ownerSpatial.destinationActivity = "responding";
      return;
    }
    if (transition.completed) {
      this.ownerSpatial.activity = "idle";
      this.ownerSpatial.destinationActivity = "idle";
      this.record("workComplete", this.owner.room, {
        payout: transition.payout,
      });
      return;
    }
    this.ownerSpatial.activity = "working";
    this.ownerSpatial.destinationActivity = "working";
  }

  private consumeBowlIfReady(): void {
    const bowlRadius = BALANCE.LIFESTYLE.ECONOMY.BOWLS.CONSUME_RADIUS;
    if (
      this.spatial.activity === "seekFood" &&
      this.environment.foodBowl.itemId !== null &&
      this.spatial.room === WORLD_STATIONS.foodBowl.room &&
      Math.hypot(
          this.spatial.x - WORLD_STATIONS.foodBowl.x,
          this.spatial.y - WORLD_STATIONS.foodBowl.y,
        ) <= bowlRadius
    ) {
      const itemId = this.environment.foodBowl.itemId;
      const servedLevel = this.environment.foodBowl.level;
      this.environment = {
        ...this.environment,
        foodBowl: { itemId: null, level: 0 },
      };
      this.feed(
        itemId === "food-comfort"
          ? BALANCE.LIFESTYLE.ECONOMY.BOWLS.COMFORT_FOOD_VOLUME
          : BALANCE.LIFESTYLE.ECONOMY.BOWLS.BASIC_FOOD_VOLUME,
      );
      if (itemId === "food-comfort") {
        this.stats.stress = clamp(this.stats.stress - 4);
      }
      this.record("foodBowlEaten", WORLD_STATIONS.foodBowl.room, {
        itemId,
        consumedLevel: servedLevel,
        remainingLevel: 0,
      });
      this.setSpatialGoal(
        BALANCE.SPATIAL.TARGET.REST.room,
        BALANCE.SPATIAL.TARGET.REST.x,
        BALANCE.SPATIAL.TARGET.REST.y,
        "rest",
      );
    }
    if (
      this.spatial.activity === "seekWater" &&
      this.environment.waterBowl.clean &&
      this.environment.waterBowl.level > 0 &&
      this.spatial.room === WORLD_STATIONS.waterBowl.room &&
      Math.hypot(
          this.spatial.x - WORLD_STATIONS.waterBowl.x,
          this.spatial.y - WORLD_STATIONS.waterBowl.y,
        ) <= bowlRadius
    ) {
      const volume = Math.min(
        this.environment.waterBowl.level,
        BALANCE.LIFESTYLE.ECONOMY.BOWLS.WATER_DRINK_VOLUME,
      );
      const remaining = this.environment.waterBowl.level - volume;
      this.environment = {
        ...this.environment,
        waterBowl: {
          level: remaining,
          clean: remaining > 0,
        },
      };
      this.water(volume);
      this.record("waterBowlDrunk", WORLD_STATIONS.waterBowl.room, {
        volume,
        remainingLevel: remaining,
      });
      this.setSpatialGoal(
        BALANCE.SPATIAL.TARGET.REST.room,
        BALANCE.SPATIAL.TARGET.REST.x,
        BALANCE.SPATIAL.TARGET.REST.y,
        "rest",
      );
    }
    this.clampAll();
  }

  private availableTreatId(): CatalogItemId | null {
    const treatIds: readonly CatalogItemId[] = [
      "treat-mini",
      "treat-basic",
      "treat-lick",
    ];
    return treatIds.find((id) => this.economy.inventory[id] > 0) ?? null;
  }

  private activePoopPoint(): {
    room: RoomId;
    x: number;
    y: number;
  } | null {
    if (this.activePoop === null) return null;
    if (this.activePoop.location === "pad") {
      const placedPad = this.environment.padPlacement;
      if (
        placedPad !== null &&
        placedPad.room === this.activePoop.room
      ) {
        return {
          room: placedPad.room,
          x: placedPad.x,
          y: placedPad.y,
        };
      }
      const target = BALANCE.SPATIAL.TARGET.POOP_PAD;
      return {
        room: this.activePoop.room,
        x: target.x,
        y: target.y,
      };
    }
    const target = BALANCE.SPATIAL.TARGET.CORNER[this.activePoop.room];
    return {
      room: this.activePoop.room,
      x: target.x,
      y: target.y,
    };
  }

  private barrierCoversPoint(
    barrier: BarrierPlacement,
    point: { room: RoomId; x: number; y: number },
  ): boolean {
    if (barrier.room !== point.room) return false;
    const panelReach =
      BALANCE.LIFESTYLE.OWNER.DOG_COLLISION_RADIUS *
      (barrier.panels / 4);
    return Math.abs(point.x - barrier.x) <=
        barrier.width / 2 + panelReach &&
      Math.abs(point.y - barrier.y) <=
        barrier.height / 2 + panelReach;
  }

  private environmentBarrierBlocks(): boolean {
    const points: Array<{ room: RoomId; x: number; y: number }> = [
      {
        room: this.spatial.room,
        x: this.spatial.x,
        y: this.spatial.y,
      },
    ];
    const poopPoint = this.activePoopPoint();
    if (poopPoint !== null) points.push(poopPoint);
    return this.environment.barriers.some((barrier) =>
      points.some((point) => this.barrierCoversPoint(barrier, point))
    );
  }

  private isEffectivelyBlocked(): boolean {
    return this.blocked || this.environmentBarrierBlocks();
  }

  private enforceEnvironmentBarrierBlock(): void {
    if (
      this.pendingEatAt === null ||
      !this.environmentBarrierBlocks()
    ) {
      return;
    }
    this.cancelPendingEat();
    this.setBehavior("sniffLeave");
  }

  private completeDigestion(): void {
    const remaining: DigestionItem[] = [];
    for (const item of this.digestionQueue) {
      if (item.dueAt <= this.absoluteMinute) {
        const pressureGain = item.volume *
          BALANCE.DIGESTION.PRESSURE_PER_VOLUME;
        this.stats.bowelPressure = clamp(
          this.stats.bowelPressure + pressureGain,
        );
        this.lastDigestedFeedAt = item.fedAt;
        this.record("digestionComplete", this.dogRoom, {
          fedAt: item.fedAt,
          pressureGain,
        });
      } else {
        remaining.push(item);
      }
    }
    this.digestionQueue = remaining;
    if (
      this.poopDueAt === null &&
      this.stats.bowelPressure >= BALANCE.DIGESTION.PRESSURE_SIGNAL
    ) {
      this.schedulePoopSignals();
    }
  }

  private schedulePoopSignals(): void {
    const delay = this.rng.integer(
      BALANCE.DIGESTION.POOP_DELAY_MINUTES_MIN,
      BALANCE.DIGESTION.POOP_DELAY_MINUTES_MAX,
    );
    this.poopDueAt = this.absoluteMinute + delay;
    this.pendingPressurePerMinute = Math.max(
      BALANCE.NUMBER.ZERO,
      (BALANCE.DIGESTION.PRESSURE_POOP - this.stats.bowelPressure) / delay,
    );
    this.scheduledSignals = SIGNALS.map((type, index) => ({
      type,
      at: this.poopDueAt! - BALANCE.DIGESTION.SIGNAL_LEAD_MINUTES[index],
      emitted: false,
    }));
  }

  private emitScheduledSignals(): void {
    for (const signal of this.scheduledSignals) {
      if (!signal.emitted && this.absoluteMinute >= signal.at) {
        signal.emitted = true;
        this.markOpportunity(this.dogRoom);
        this.setSpatialGoal(
          this.dogRoom,
          this.randomCoordinate(),
          this.randomCoordinate(),
          signal.type,
        );
        this.record(signal.type, this.dogRoom, {
          source: "poopSignal",
          poopDueAt: this.poopDueAt,
        });
      }
    }
  }

  private poop(): void {
    const placedPad = this.environment.padPlacement?.room === this.dogRoom
      ? this.environment.padPlacement
      : null;
    const padChance = BALANCE.DIGESTION.PAD_BASE_CHANCE +
      this.matSkill.toilet * BALANCE.DIGESTION.PAD_SKILL_FACTOR +
      (placedPad?.coverage ?? 0);
    const onPad = this.rng.chance(padChance) &&
      (placedPad !== null ||
        this.dogRoom === "living" || this.dogRoom === "toilet");
    let room: RoomId = onPad
      ? placedPad?.room ?? "toilet"
      : this.dogRoom;
    if (
      !onPad &&
      this.visibilityFor(room) === "seen" &&
      this.rng.chance(
        this.memory.hiddenPoopTendency * BALANCE.DIGESTION.HIDDEN_CHANCE_FACTOR,
      )
    ) {
      const hiddenRoom = this.hiddenRoomFromOwner();
      room = this.adjacent(this.dogRoom, hiddenRoom)
        ? hiddenRoom
        : "living";
    }
    this.dogRoom = room;
    this.relocateSpatial(room);
    this.activePoop = {
      room,
      createdAt: this.absoluteMinute,
      location: onPad ? "pad" : "corner",
    };
    this.poopRevision += 1;
    this.markOpportunity(room);
    const poopTarget = onPad && placedPad !== null
      ? { room: placedPad.room, x: placedPad.x, y: placedPad.y }
      : onPad
      ? BALANCE.SPATIAL.TARGET.POOP_PAD
      : BALANCE.SPATIAL.TARGET.CORNER[room];
    this.setSpatialGoal(room, poopTarget.x, poopTarget.y, "poop");
    this.stats.bowelPressure = BALANCE.DIGESTION.PRESSURE_AFTER_POOP;
    this.resetPoopCycle();
    if (this.lastDigestedFeedAt !== null) {
      this.poopDelayHistory.push(this.absoluteMinute - this.lastDigestedFeedAt);
    }
    this.record("poop", room, { location: this.activePoop.location });
    this.decideAfterPoop();
  }

  private decideAfterPoop(): void {
    const visibility = this.visibilityFor(this.dogRoom);
    const matSkill = this.owner.away
      ? this.matSkillOwnerAway
      : this.matSkill[this.dogRoom];
    const traces: ActionUtilityTrace[] = [
      this.utility("eatPoop", [
        [
          "foodDrive",
          this.personality.foodDrive * BALANCE.DECISION.EAT.FOOD_DRIVE,
        ],
        ["hunger", this.stats.hunger * BALANCE.DECISION.EAT.HUNGER],
        [
          "coproHabit",
          this.memory.coproHabit * BALANCE.DECISION.EAT.COPRO_HABIT,
        ],
        [
          "snatchExpectation",
          this.memory.snatchExpectation *
          BALANCE.DECISION.EAT.SNATCH_EXPECTATION,
        ],
        [
          "matExpectation",
          this.memory.matExpectation * BALANCE.DECISION.EAT.MAT_EXPECTATION,
        ],
        ["waitSkill", this.memory.waitSkill * BALANCE.DECISION.EAT.WAIT_SKILL],
        [
          "block",
          this.isEffectivelyBlocked()
            ? BALANCE.DECISION.BLOCK_PENALTY
            : BALANCE.NUMBER.ZERO,
        ],
      ]),
      this.utility("moveToMat", [
        ["matSkill", matSkill * BALANCE.DECISION.MAT.MAT_SKILL],
        [
          "matExpectation",
          this.memory.matExpectation * BALANCE.DECISION.MAT.MAT_EXPECTATION,
        ],
        [
          "approachSafety",
          this.memory.approachSafety * BALANCE.DECISION.MAT.APPROACH_SAFETY,
        ],
        ["excitement", this.stats.excitement * BALANCE.DECISION.MAT.EXCITEMENT],
        ["stress", this.stats.stress * BALANCE.DECISION.MAT.STRESS],
      ]),
      this.utility("watchOwner", [
        [
          "attentionViaPoop",
          this.memory.attentionViaPoop *
          BALANCE.DECISION.WATCH.ATTENTION_VIA_POOP,
        ],
        [
          "sociability",
          this.personality.sociability * BALANCE.DECISION.WATCH.SOCIABILITY,
        ],
        [
          "hiddenOwner",
          visibility === "hidden"
            ? BALANCE.DECISION.HIDDEN_OWNER_PENALTY
            : BALANCE.NUMBER.ZERO,
        ],
      ]),
      this.utility("flee", [
        [
          "approachDanger",
          visibility === "seen"
            ? (BALANCE.NUMBER.ONE_HUNDRED - this.memory.approachSafety) *
              BALANCE.DECISION.FLEE.APPROACH_DANGER
            : BALANCE.NUMBER.ZERO,
        ],
        ["stress", this.stats.stress * BALANCE.DECISION.FLEE.STRESS],
      ]),
      this.utility("sniffLeave", [
        ["base", BALANCE.DECISION.SNIFF_BASE],
        ["comfort", this.stats.comfort * BALANCE.DECISION.SNIFF.COMFORT],
        [
          "coproHabit",
          this.memory.coproHabit * BALANCE.DECISION.SNIFF.COPRO_HABIT,
        ],
      ]),
      this.utility("zoomies", [
        [
          "excitement",
          this.stats.excitement * BALANCE.DECISION.ZOOMIES.EXCITEMENT,
        ],
        ["boredom", this.stats.boredom * BALANCE.DECISION.ZOOMIES.BOREDOM],
        ["fatigue", this.stats.fatigue * BALANCE.DECISION.ZOOMIES.FATIGUE],
      ]),
    ];
    const selected =
      traces.reduce((best, candidate) =>
        candidate.score > best.score ? candidate : best
      ).action;
    const decision: DecisionTrace = { selected, utilities: traces };
    this.record(
      "decision",
      this.dogRoom,
      decision as unknown as Record<string, unknown>,
    );
    this.setBehavior(selected);
    if (selected === "eatPoop") {
      const delay =
        this.memory.snatchExpectation >= BALANCE.DIGESTION.FAST_SNATCH_THRESHOLD
          ? BALANCE.DIGESTION.EAT_DELAY_SNATCH_MINUTES
          : BALANCE.DIGESTION.EAT_DELAY_MINUTES;
      this.pendingEatAt = this.absoluteMinute + delay;
      this.record("poopApproach", this.dogRoom, {
        completesAt: this.pendingEatAt,
      });
      this.enforceEnvironmentBarrierBlock();
    }
  }

  private utility(
    action: ActionId,
    values: ReadonlyArray<readonly [string, number]>,
  ): ActionUtilityTrace {
    const components = values.map(([label, value]) => ({ label, value }));
    const subtotal = components.reduce<number>(
      (sum, component) => sum + component.value,
      BALANCE.NUMBER.ZERO,
    );
    const noise = this.rng.range(
      -BALANCE.DECISION.NOISE,
      BALANCE.DECISION.NOISE,
    );
    return { action, components, subtotal, noise, score: subtotal + noise };
  }

  private completeEating(): void {
    if (this.activePoop === null || this.isEffectivelyBlocked()) {
      this.cancelPendingEat();
      return;
    }
    this.activePoop = null;
    this.pendingEatAt = null;
    this.changeMemory("coproHabit", BALANCE.DIGESTION.EAT_COPRO_GAIN);
    this.changeMemory("snatchExpectation", BALANCE.DIGESTION.EAT_SNATCH_GAIN);
    this.stats.hunger = clamp(
      this.stats.hunger - BALANCE.DIGESTION.EAT_HUNGER_REDUCTION,
    );
    this.record("eatPoop", this.dogRoom, {});
    this.currentAction = "idle";
    this.stopSpatialActivity();
  }

  private rewardRecentBehavior(): ActionId | undefined {
    if (
      this.lastBehavior === null ||
      this.absoluteMinute - this.lastBehavior.at >
        BALANCE.TIME.ACTION_MEMORY_MINUTES
    ) {
      return undefined;
    }
    const action = this.lastBehavior.action;
    if (action === "moveToMat") {
      this.changeMemory(
        "matExpectation",
        BALANCE.LEARNING.MAT_EXPECTATION_REWARD,
      );
      this.changeMemory("coproHabit", -BALANCE.LEARNING.MAT_COPRO_REDUCTION);
      const trainedRoom = this.lastBehavior.room;
      for (const room of ROOMS) {
        const rate = room === trainedRoom
          ? BALANCE.NUMBER.ONE
          : BALANCE.LEARNING.GENERALIZE_RATE;
        this.matSkill[room] = clamp(
          this.matSkill[room] + BALANCE.LEARNING.MAT_SKILL_REWARD * rate,
        );
      }
      this.matSkillOwnerAway = clamp(
        this.matSkillOwnerAway +
          BALANCE.LEARNING.MAT_SKILL_REWARD *
            BALANCE.LEARNING.OWNER_AWAY_GENERALIZE_RATE,
      );
      return action;
    }
    if (action === "eatPoop" || action === "watchOwner") {
      this.changeMemory(
        "attentionViaPoop",
        BALANCE.LEARNING.POOP_ATTENTION_REWARD,
      );
      this.changeMemory("coproHabit", BALANCE.LEARNING.POOP_COPRO_REWARD);
      return action;
    }
    return undefined;
  }

  private setBehavior(action: ActionId): void {
    this.currentAction = action;
    this.actionStartedAt = this.absoluteMinute;
    this.lastBehavior = { action, at: this.absoluteMinute, room: this.dogRoom };
    this.record("action", this.dogRoom, { action });
    this.applyBehaviorSpatialGoal(action);
  }

  private applyBehaviorSpatialGoal(action: ActionId): void {
    switch (action) {
      case "eatPoop": {
        if (this.activePoop === null) {
          this.stopSpatialActivity();
          return;
        }
        const target = this.activePoop.location === "pad"
          ? BALANCE.SPATIAL.TARGET.POOP_PAD
          : BALANCE.SPATIAL.TARGET.CORNER[this.activePoop.room];
        this.setSpatialGoal(
          this.activePoop.room,
          target.x,
          target.y,
          action,
        );
        return;
      }
      case "moveToMat": {
        const target = BALANCE.SPATIAL.TARGET.MAT[this.dogRoom];
        this.setSpatialGoal(this.dogRoom, target.x, target.y, action);
        return;
      }
      case "watchOwner": {
        const target = this.safeDogPointNearOwner();
        this.setSpatialGoal(target.room, target.x, target.y, action);
        return;
      }
      case "flee": {
        const room = this.hiddenRoomFromOwner();
        const target = BALANCE.SPATIAL.TARGET.CORNER[room];
        this.setSpatialGoal(room, target.x, target.y, action);
        return;
      }
      case "sniffLeave":
      case "zoomies":
        this.setSpatialGoal(
          this.dogRoom,
          this.randomCoordinate(),
          this.randomCoordinate(),
          action,
        );
    }
  }

  private startAmbientActivityIfDue(): void {
    if (this.absoluteMinute < this.spatial.nextActivityAt) {
      return;
    }
    if (this.currentAction !== "idle" || this.activePoop !== null) {
      this.spatial.nextActivityAt = this.absoluteMinute +
        BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES;
      return;
    }

    const activity = this.chooseAmbientActivity();
    const target = this.ambientTarget(activity);
    this.setSpatialGoal(
      target.room,
      target.x,
      target.y,
      activity,
    );
    this.record("ambientAction", this.dogRoom, {
      source: "ambient",
      activity,
      targetRoom: target.room,
      targetX: target.x,
      targetY: target.y,
    });
    this.spatial.nextActivityAt = this.absoluteMinute + this.rng.integer(
      BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES,
      BALANCE.SPATIAL.AMBIENT_MAX_INTERVAL_MINUTES,
    );
  }

  private chooseAmbientActivity(): DogActivityId {
    if (this.stats.hunger >= BALANCE.SPATIAL.NEED_THRESHOLD.HUNGER) {
      return "seekFood";
    }
    if (this.stats.thirst >= BALANCE.SPATIAL.NEED_THRESHOLD.THIRST) {
      return "seekWater";
    }
    if (this.stats.fatigue >= BALANCE.SPATIAL.NEED_THRESHOLD.FATIGUE) {
      return "rest";
    }
    if (this.stats.boredom >= BALANCE.SPATIAL.NEED_THRESHOLD.BOREDOM) {
      return "play";
    }
    const ambient: readonly DogActivityId[] = [
      "followOwner",
      "wander",
      "patrol",
    ];
    return ambient[this.rng.integer(
      BALANCE.NUMBER.ZERO,
      ambient.length - BALANCE.NUMBER.ONE,
    )];
  }

  private ambientTarget(
    activity: DogActivityId,
  ): DogSpatialWaypoint {
    switch (activity) {
      case "seekFood":
        return BALANCE.SPATIAL.TARGET.FOOD;
      case "seekWater":
        return BALANCE.SPATIAL.TARGET.WATER;
      case "rest":
        return BALANCE.SPATIAL.TARGET.REST;
      case "play":
        return BALANCE.SPATIAL.TARGET.PLAY;
      case "followOwner": {
        return this.safeDogPointNearOwner();
      }
      case "patrol": {
        const rooms = this.adjacentRooms(this.dogRoom);
        const room = rooms[this.rng.integer(
          BALANCE.NUMBER.ZERO,
          rooms.length - BALANCE.NUMBER.ONE,
        )];
        return {
          room,
          x: this.randomCoordinate(),
          y: this.randomCoordinate(),
        };
      }
      default:
        return {
          room: this.dogRoom,
          x: this.randomCoordinate(),
          y: this.randomCoordinate(),
        };
    }
  }

  private setOwnerSpatialGoal(
    room: RoomId,
    x: number,
    y: number,
    destinationActivity: Exclude<OwnerSpatialState["activity"], "moving">,
  ): void {
    const finalTarget: DogSpatialWaypoint = {
      room,
      x: this.clampCoordinate(x),
      y: this.clampCoordinate(y),
    };
    const waypoints = this.spatialWaypoints(
      this.ownerSpatial.room,
      finalTarget,
    );
    const [target, ...route] = waypoints;
    this.ownerSpatial.targetRoom = target.room;
    this.ownerSpatial.targetX = target.x;
    this.ownerSpatial.targetY = target.y;
    this.ownerSpatial.route = route;
    this.ownerSpatial.destinationActivity = destinationActivity;
    this.ownerSpatial.moving =
      this.ownerSpatial.room !== target.room ||
      this.ownerSpatial.x !== target.x ||
      this.ownerSpatial.y !== target.y;
    this.ownerSpatial.activity = this.ownerSpatial.moving
      ? "moving"
      : destinationActivity;
  }

  private advanceOwnerMovement(): void {
    if (!this.ownerSpatial.moving) return;
    if (this.ownerSpatial.room !== this.ownerSpatial.targetRoom) {
      const transition = this.transitionPoints(
        this.ownerSpatial.room,
        this.ownerSpatial.targetRoom,
      );
      if (transition === null) {
        throw new RangeError("owner target must be the same or adjacent room");
      }
      if (!this.moveOwnerToward(transition.exit.x, transition.exit.y)) return;
      if (
        !this.trySetOwnerPosition(
          this.ownerSpatial.targetRoom,
          transition.entry.x,
          transition.entry.y,
        )
      ) {
        this.stopOwnerMovement("idle");
        return;
      }
    }
    if (
      !this.moveOwnerToward(
        this.ownerSpatial.targetX,
        this.ownerSpatial.targetY,
      )
    ) {
      return;
    }
    if (this.ownerSpatial.route.length > 0) {
      const [next, ...route] = this.ownerSpatial.route;
      this.ownerSpatial.targetRoom = next.room;
      this.ownerSpatial.targetX = next.x;
      this.ownerSpatial.targetY = next.y;
      this.ownerSpatial.route = route;
      return;
    }
    this.ownerSpatial.moving = false;
    this.ownerSpatial.activity = this.ownerSpatial.destinationActivity;
  }

  private moveOwnerToward(x: number, y: number): boolean {
    const deltaX = x - this.ownerSpatial.x;
    const deltaY = y - this.ownerSpatial.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= BALANCE.LIFESTYLE.OWNER.SPEED_PER_MINUTE) {
      const moved = this.tryMoveOwnerWithinRoom(x, y);
      if (!moved) this.stopOwnerMovement("idle");
      return moved &&
        this.ownerSpatial.x === x &&
        this.ownerSpatial.y === y;
    }
    const scale = BALANCE.LIFESTYLE.OWNER.SPEED_PER_MINUTE / distance;
    const moved = this.tryMoveOwnerWithinRoom(
      this.ownerSpatial.x + deltaX * scale,
      this.ownerSpatial.y + deltaY * scale,
    );
    if (!moved) this.stopOwnerMovement("idle");
    return false;
  }

  private moveOwnerFixedStepToward(
    x: number,
    y: number,
    elapsedMs?: number,
  ): boolean {
    const deltaX = x - this.ownerSpatial.x;
    const deltaY = y - this.ownerSpatial.y;
    const distance = Math.hypot(deltaX, deltaY);
    const step = this.ownerStepDistance(elapsedMs);
    if (
      distance <= step
    ) {
      const moved = this.tryMoveOwnerWithinRoom(x, y);
      return moved &&
        this.ownerSpatial.x === x &&
        this.ownerSpatial.y === y;
    }
    const scale = step / distance;
    this.tryMoveOwnerWithinRoom(
      this.ownerSpatial.x + deltaX * scale,
      this.ownerSpatial.y + deltaY * scale,
    );
    return false;
  }

  private directDoorTransition(
    nextX: number,
    nextY: number,
    directionX: number,
  ): DogSpatialWaypoint | null {
    const room = this.ownerSpatial.room;
    const candidateRooms: RoomId[] = room === "living"
      ? ["kitchen", "toilet"]
      : ["living"];
    const candidates = candidateRooms
      .map((candidateRoom) => ({
        room: candidateRoom,
        transition: this.transitionPoints(room, candidateRoom),
      }))
      .filter((candidate): candidate is {
        room: RoomId;
        transition: {
          exit: { x: number; y: number };
          entry: { x: number; y: number };
        };
      } => candidate.transition !== null)
      .filter(({ transition }) =>
        room === "living"
          ? directionX > BALANCE.NUMBER.ZERO &&
            nextX >= transition.exit.x
          : directionX < BALANCE.NUMBER.ZERO &&
            nextX <= transition.exit.x
      )
      .sort((first, second) =>
        Math.abs(nextY - first.transition.exit.y) -
        Math.abs(nextY - second.transition.exit.y)
      );
    for (const candidate of candidates) {
      const { room: candidateRoom, transition } = candidate;
      const crossesExit = room === "living"
        ? directionX > BALANCE.NUMBER.ZERO &&
          nextX >= transition.exit.x
        : directionX < BALANCE.NUMBER.ZERO &&
          nextX <= transition.exit.x;
      if (crossesExit) {
        return {
          room: candidateRoom,
          x: transition.entry.x,
          y: transition.entry.y,
        };
      }
    }
    return null;
  }

  private directControlBlockedReason(): string | null {
    if (this.work.alert !== null) {
      return "업무 알림에 먼저 응답해 주세요.";
    }
    return null;
  }

  private finishDirectOwnerStep(): void {
    this.stopOwnerMovement(
      this.encounterDirector.active === null ? "idle" : "responding",
    );
    if (ownerDogFootprintsOverlap(this.ownerSpatial, this.spatial)) {
      throw new RangeError("direct owner movement left overlapping footprints");
    }
  }

  private stopOwnerMovement(
    activity: Exclude<OwnerSpatialState["activity"], "moving">,
  ): void {
    this.ownerSpatial.targetRoom = this.ownerSpatial.room;
    this.ownerSpatial.targetX = this.ownerSpatial.x;
    this.ownerSpatial.targetY = this.ownerSpatial.y;
    this.ownerSpatial.route = [];
    this.ownerSpatial.moving = false;
    this.ownerSpatial.activity = activity;
    this.ownerSpatial.destinationActivity = activity;
  }

  private ownerAtHotspot(
    hotspotId: keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT,
  ): boolean {
    return this.ownerStateAtHotspot(this.ownerSpatial, hotspotId);
  }

  private ownerNearHotspot(
    hotspotId: keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT,
  ): boolean {
    const target = BALANCE.LIFESTYLE.OWNER.HOTSPOT[hotspotId];
    return !this.ownerSpatial.moving &&
      this.ownerSpatial.room === target.room &&
      Math.hypot(
          this.ownerSpatial.x - target.x,
          this.ownerSpatial.y - target.y,
        ) <= BALANCE.LIFESTYLE.OWNER.INTERACTION_RADIUS;
  }

  private snapOwnerToHotspot(
    hotspotId: keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT,
  ): void {
    const target = BALANCE.LIFESTYLE.OWNER.HOTSPOT[hotspotId];
    this.ownerSpatial.room = target.room;
    this.owner = { ...this.owner, room: target.room };
    this.ownerSpatial.x = target.x;
    this.ownerSpatial.y = target.y;
    this.stopOwnerMovement("idle");
  }

  private encounterInteractionState(): {
    distance: number | null;
    ready: boolean;
  } {
    const encounter = getEncounterPublicView(this.encounterDirector);
    if (
      encounter === null ||
      this.ownerSpatial.room !== encounter.cue.room
    ) {
      return { distance: null, ready: false };
    }
    const anchor = encounter.cue.anchor ??
      (this.spatial.room === encounter.cue.room &&
          this.visibilityFor(this.spatial.room) === "seen"
        ? { x: this.spatial.x, y: this.spatial.y }
        : {
          x: (
            BALANCE.SPATIAL.MIN_COORDINATE +
            BALANCE.SPATIAL.MAX_COORDINATE
          ) / BALANCE.NUMBER.TWO,
          y: (
            BALANCE.SPATIAL.MIN_COORDINATE +
            BALANCE.SPATIAL.MAX_COORDINATE
          ) / BALANCE.NUMBER.TWO,
        });
    const distance = Math.hypot(
      this.ownerSpatial.x - anchor.x,
      this.ownerSpatial.y - anchor.y,
    );
    const footprintSeparation = ownerDogFootprintSeparation(
      this.ownerSpatial,
      { room: encounter.cue.room, ...anchor },
    );
    return {
      distance,
      ready: distance <= BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS ||
        footprintSeparation <=
        BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE,
    };
  }

  private worldInteractionState(): {
    nearbyTarget: WorldTargetId | null;
    targets: WorldInteractionTarget[];
    contextActions: WorldContextAction[];
  } {
    const targets: WorldInteractionTarget[] = [];
    const addTarget = (
      id: WorldTargetId,
      kind: WorldTargetKind,
      point: { room: RoomId; x: number; y: number },
      actions: WorldContextAction[],
      radius: number = BALANCE.LIFESTYLE.OWNER.INTERACTION_RADIUS,
      nearbyOverride?: boolean,
    ) => {
      const distance = this.ownerSpatial.room === point.room
        ? Math.hypot(
          this.ownerSpatial.x - point.x,
          this.ownerSpatial.y - point.y,
        )
        : null;
      targets.push({
        id,
        kind,
        room: point.room,
        x: point.x,
        y: point.y,
        distance,
        nearby: nearbyOverride ??
          (distance !== null && distance <= radius),
        actions,
      });
    };

    const encounter = getEncounterPublicView(this.encounterDirector);
    if (encounter !== null) {
      const encounterInteraction = this.encounterInteractionState();
      const cuePoint = encounter.cue.anchor ?? (
        this.spatial.room === encounter.cue.room &&
          this.visibilityFor(this.spatial.room) === "seen"
          ? { x: this.spatial.x, y: this.spatial.y }
          : { x: 0.5, y: 0.5 }
      );
      const encounterActions: WorldContextAction[] =
        encounter.stage === "cause"
          ? [{
            id: "encounter:observe",
            label: "관찰하기",
            enabled: true,
            reason: null,
          }]
          : encounter.stage === "response"
          ? encounter.contextActions.slice(0, 3).map((action) => ({
            id: `encounter:response:${action.id}`,
            label: action.label,
            enabled: true,
            reason: null,
          }))
          : encounter.stage === "reinforcement"
          ? encounter.contextActions.slice(0, 3).map((action) => ({
            id: `encounter:reinforce:${action.id}`,
            label: action.label,
            enabled: action.id !== "treat" ||
              this.availableTreatId() !== null,
            reason: action.id === "treat" &&
                this.availableTreatId() === null
              ? "사용할 간식 재고가 없습니다."
              : null,
          }))
          : [{
            id: "encounter:dismiss",
            label: "확인",
            enabled: encounter.outcome !== null,
            reason: encounter.outcome === null
              ? "아직 정산할 결과가 없습니다."
              : null,
          }];
      addTarget(
        "cue",
        "cue",
        { room: encounter.cue.room, ...cuePoint },
        encounterActions,
        BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS,
        encounterInteraction.ready,
      );
    }

    if (
      this.visibilityFor(this.spatial.room) === "seen"
    ) {
      addTarget(
        "dog",
        "dog",
        {
          room: this.spatial.room,
          x: this.spatial.x,
          y: this.spatial.y,
        },
        [],
      );
    }
    addTarget(
      "computer",
      "computer",
      WORLD_STATIONS.computer,
      [{
        id: "work:sit",
        label: this.work.seated ? "업무 자리" : "컴퓨터에 앉기",
        enabled: !this.work.seated &&
          this.work.alert === null &&
          this.work.progress < 100,
        reason: this.work.seated
          ? "이미 컴퓨터에 앉아 있습니다."
          : this.work.progress === 100
          ? "오늘 업무를 이미 마쳤습니다."
          : this.work.alert !== null
          ? "업무 알림에 먼저 응답해 주세요."
          : null,
      }],
    );
    addTarget(
      "foodBowl",
      "foodBowl",
      WORLD_STATIONS.foodBowl,
      (["food-basic", "food-comfort"] as const).map((itemId) => {
        const count = this.economy.inventory[itemId];
        return {
          id: `food:${itemId}`,
          label: `${itemId === "food-basic" ? "기본" : "편안한"} 사료 넣기`,
          enabled: this.environment.foodBowl.level === 0 && count > 0,
          reason: this.environment.foodBowl.level > 0
            ? "그릇에 사료가 남아 있습니다."
            : count <= 0
            ? "사료 재고가 없습니다."
            : null,
          itemId,
        };
      }),
    );
    addTarget(
      "waterBowl",
      "waterBowl",
      WORLD_STATIONS.waterBowl,
      this.environment.waterBowl.clean
        ? [{
          id: "water:fill",
          label: "깨끗한 물 채우기",
          enabled: this.environment.waterBowl.level < 100,
          reason: this.environment.waterBowl.level >= 100
            ? "물그릇이 이미 가득 찼습니다."
            : null,
        }]
        : [{
          id: "water:clean",
          label: "물그릇 씻기",
          enabled: true,
          reason: null,
        }],
    );
    const poopPoint = this.activePoopPoint();
    if (
      poopPoint !== null &&
      this.visibilityFor(poopPoint.room) === "seen"
    ) {
      addTarget("activePoop", "activePoop", poopPoint, [{
        id: "poop:cleanup",
        label: "배변 치우기",
        enabled: true,
        reason: null,
      }]);
    }
    addTarget(
      "bath",
      "bath",
      WORLD_STATIONS.bath,
      (["shampoo-gentle", "shampoo-quick"] as const).map((itemId) => ({
        id: `bath:${itemId}`,
        label: itemId === "shampoo-gentle"
          ? "순한 샴푸 사용"
          : "빠른 샴푸 사용",
        enabled: this.economy.inventory[itemId] > 0,
        reason: this.economy.inventory[itemId] > 0
          ? null
          : "샴푸 재고가 없습니다.",
        itemId,
      })),
    );
    for (const room of this.adjacentRooms(this.ownerSpatial.room)) {
      const transition = this.transitionPoints(this.ownerSpatial.room, room);
      if (transition === null) continue;
      addTarget(
        `door:${room}`,
        "door",
        { room: this.ownerSpatial.room, ...transition.exit },
        [{
          id: `door:${room}`,
          label: `${this.roomLabel(room)}로 이동`,
          enabled: true,
          reason: null,
        }],
      );
    }

    const priority: WorldTargetKind[] = [
      "cue",
      "activePoop",
      "computer",
      "foodBowl",
      "waterBowl",
      "bath",
      "door",
      "dog",
    ];
    const nearby = [...targets]
      .filter((target) => target.nearby)
      .sort((first, second) => {
        const priorityDifference =
          priority.indexOf(first.kind) - priority.indexOf(second.kind);
        return priorityDifference !== 0
          ? priorityDifference
          : (first.distance ?? Infinity) - (second.distance ?? Infinity);
      })[0] ?? null;
    return {
      nearbyTarget: nearby?.id ?? null,
      targets,
      contextActions: clone(nearby?.actions ?? []),
    };
  }

  private roomLabel(room: RoomId): string {
    if (room === "living") return "거실";
    if (room === "kitchen") return "주방";
    return "화장실";
  }

  private ownerNearStation(
    station: { room: RoomId; x: number; y: number },
  ): boolean {
    return !this.ownerSpatial.moving &&
      this.ownerSpatial.room === station.room &&
      Math.hypot(
        this.ownerSpatial.x - station.x,
        this.ownerSpatial.y - station.y,
      ) <= BALANCE.LIFESTYLE.OWNER.INTERACTION_RADIUS;
  }

  private moveOwnerThroughDoor(room: RoomId): LifestyleActionResult {
    const transition = this.transitionPoints(this.ownerSpatial.room, room);
    if (
      transition === null ||
      !this.ownerNearStation({
        room: this.ownerSpatial.room,
        ...transition.exit,
      })
    ) {
      return { ok: false, reason: "문 가까이 이동해 주세요." };
    }
    const blockedReason = this.directControlBlockedReason();
    if (blockedReason !== null) {
      return { ok: false, reason: blockedReason };
    }
    this.leaveWorkSeatForMovement();
    if (!this.trySetOwnerPosition(room, transition.entry.x, transition.entry.y)) {
      const previousOwnerSpatial = clone(this.ownerSpatial);
      const previousOwner = clone(this.owner);
      const previousDogSpatial = clone(this.spatial);
      this.ownerSpatial.room = room;
      this.ownerSpatial.x = transition.entry.x;
      this.ownerSpatial.y = transition.entry.y;
      this.owner = { ...this.owner, room };
      const safeDogPoint = this.safeDogPointNearOwner();
      this.spatial = {
        ...this.spatial,
        room: safeDogPoint.room,
        x: safeDogPoint.x,
        y: safeDogPoint.y,
        targetRoom: safeDogPoint.room,
        targetX: safeDogPoint.x,
        targetY: safeDogPoint.y,
        route: [],
        activity: "idle",
        moving: false,
      };
      if (ownerDogFootprintsOverlap(this.ownerSpatial, this.spatial)) {
        this.ownerSpatial = previousOwnerSpatial;
        this.owner = previousOwner;
        this.spatial = previousDogSpatial;
        return {
          ok: false,
          reason: "문 건너편에 강아지가 있어 기다려 주세요.",
        };
      }
    }
    this.finishDirectOwnerStep();
    return { ok: true, reason: null };
  }

  private ownerStateAtHotspot(
    ownerSpatial: OwnerSpatialState,
    hotspotId: keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT,
  ): boolean {
    const target = BALANCE.LIFESTYLE.OWNER.HOTSPOT[hotspotId];
    return !ownerSpatial.moving &&
      ownerSpatial.room === target.room &&
      Math.hypot(
          ownerSpatial.x - target.x,
          ownerSpatial.y - target.y,
        ) <= 0.01;
  }

  private ownerTargetingHotspot(
    hotspotId: keyof typeof BALANCE.LIFESTYLE.OWNER.HOTSPOT,
  ): boolean {
    const target = BALANCE.LIFESTYLE.OWNER.HOTSPOT[hotspotId];
    const finalTarget = this.ownerSpatial.route[
      this.ownerSpatial.route.length - 1
    ];
    return finalTarget !== undefined
      ? finalTarget.room === target.room &&
        finalTarget.x === target.x &&
        finalTarget.y === target.y
      : this.ownerSpatial.targetRoom === target.room &&
        this.ownerSpatial.targetX === target.x &&
        this.ownerSpatial.targetY === target.y;
  }

  private safeDogPointNearOwner(): DogSpatialWaypoint {
    const footprint = BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT;
    const travel = footprint.ROOM_TRAVEL_PX[this.ownerSpatial.room];
    const horizontalClearance =
      footprint.HORIZONTAL_CLEARANCE_PX / travel.x *
      footprint.SAFE_SCALE;
    const verticalClearance =
      footprint.VERTICAL_CLEARANCE_PX / travel.y *
      footprint.SAFE_SCALE;
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [-Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, -Math.SQRT1_2],
      [-Math.SQRT1_2, -Math.SQRT1_2],
    ] as const;
    const candidates = directions
      .map(([directionX, directionY]) => ({
        room: this.ownerSpatial.room,
        x: this.clampCoordinate(
          this.ownerSpatial.x + directionX * horizontalClearance,
        ),
        y: this.clampCoordinate(
          this.ownerSpatial.y + directionY * verticalClearance,
        ),
      }))
      .filter((candidate) =>
        !ownerDogFootprintsOverlap(this.ownerSpatial, candidate)
      )
      .sort((first, second) =>
        Math.hypot(first.x - this.spatial.x, first.y - this.spatial.y) -
        Math.hypot(second.x - this.spatial.x, second.y - this.spatial.y)
      );
    return candidates[0] ?? {
      room: this.ownerSpatial.room,
      x: this.clampCoordinate(
        this.ownerSpatial.x + horizontalClearance,
      ),
      y: this.ownerSpatial.y,
    };
  }

  private ownerStepDistance(elapsedMs?: number): number {
    const duration = elapsedMs ??
      BALANCE.LIFESTYLE.OWNER.DIRECT_REFERENCE_MS;
    return Math.min(
      BALANCE.SPATIAL.MAX_COORDINATE,
      BALANCE.LIFESTYLE.OWNER.DIRECT_SPEED_PER_SECOND *
        duration / 1000,
    );
  }

  private ownerPositionOverlapsDog(
    room: RoomId,
    x: number,
    y: number,
  ): boolean {
    return ownerDogFootprintsOverlap(
      {
        ...this.ownerSpatial,
        room,
        x,
        y,
      },
      this.spatial,
    );
  }

  private trySetOwnerPosition(
    room: RoomId,
    x: number,
    y: number,
  ): boolean {
    const safeX = this.clampCoordinate(x);
    const safeY = this.clampCoordinate(y);
    if (this.ownerPositionOverlapsDog(room, safeX, safeY)) return false;
    this.ownerSpatial.room = room;
    this.owner = { ...this.owner, room };
    this.ownerSpatial.x = safeX;
    this.ownerSpatial.y = safeY;
    return true;
  }

  private tryMoveOwnerWithinRoom(
    x: number,
    y: number,
    allowSlide = true,
  ): boolean {
    const safeX = this.clampCoordinate(x);
    const safeY = this.clampCoordinate(y);
    if (
      !this.ownerPathIntersectsDog(safeX, safeY) &&
      this.trySetOwnerPosition(this.ownerSpatial.room, safeX, safeY)
    ) {
      return true;
    }
    if (allowSlide) {
      const slideTarget = this.ownerDogSlideTarget(safeX, safeY);
      if (
        slideTarget !== null &&
        !this.ownerPathIntersectsDog(slideTarget.x, slideTarget.y) &&
        this.trySetOwnerPosition(
          this.ownerSpatial.room,
          slideTarget.x,
          slideTarget.y,
        )
      ) {
        return true;
      }
    }
    const previousOwnerSpatial = clone(this.ownerSpatial);
    const previousOwner = clone(this.owner);
    const previousDogSpatial = clone(this.spatial);
    const previousDogRoom = this.dogRoom;
    this.ownerSpatial.x = safeX;
    this.ownerSpatial.y = safeY;
    const safeDogPoint = this.safeDogPointNearOwner();
    this.ownerSpatial = previousOwnerSpatial;
    this.owner = previousOwner;
    this.spatial = {
      ...this.spatial,
      room: safeDogPoint.room,
      x: safeDogPoint.x,
      y: safeDogPoint.y,
      targetRoom: safeDogPoint.room,
      targetX: safeDogPoint.x,
      targetY: safeDogPoint.y,
      route: [],
      activity: "idle",
      moving: false,
    };
    this.dogRoom = safeDogPoint.room;
    const movedAfterDogRelocation =
      !this.ownerPathIntersectsDog(safeX, safeY) &&
      this.trySetOwnerPosition(this.ownerSpatial.room, safeX, safeY) &&
      !ownerDogFootprintsOverlap(this.ownerSpatial, this.spatial);
    if (movedAfterDogRelocation) return true;

    this.ownerSpatial = previousOwnerSpatial;
    this.owner = previousOwner;
    this.spatial = previousDogSpatial;
    this.dogRoom = previousDogRoom;
    return false;
  }

  private ownerDogSlideTarget(
    x: number,
    y: number,
  ): { x: number; y: number } | null {
    if (this.ownerSpatial.room !== this.spatial.room) return null;
    const footprint = BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT;
    const travel = footprint.ROOM_TRAVEL_PX[this.ownerSpatial.room];
    const horizontalScale =
      travel.x / footprint.HORIZONTAL_CLEARANCE_PX;
    const verticalScale =
      travel.y / footprint.VERTICAL_CLEARANCE_PX;
    const normalizedX =
      (this.ownerSpatial.x - this.spatial.x) * horizontalScale;
    const normalizedY =
      (this.ownerSpatial.y - this.spatial.y) * verticalScale;
    const normalX = Math.sign(normalizedX) *
      Math.pow(
        Math.abs(normalizedX),
        footprint.SUPERELLIPSE_EXPONENT - 1,
      );
    const normalY = Math.sign(normalizedY) *
      Math.pow(
        Math.abs(normalizedY),
        footprint.SUPERELLIPSE_EXPONENT - 1,
      );
    const normalLength = Math.hypot(normalX, normalY);
    if (normalLength === 0) return null;
    const unitNormalX = normalX / normalLength;
    const unitNormalY = normalY / normalLength;
    const desiredX = (x - this.ownerSpatial.x) * horizontalScale;
    const desiredY = (y - this.ownerSpatial.y) * verticalScale;
    const inwardComponent =
      desiredX * unitNormalX + desiredY * unitNormalY;
    if (inwardComponent >= 0) return null;
    const slideX = desiredX - unitNormalX * inwardComponent;
    const slideY = desiredY - unitNormalY * inwardComponent;
    if (Math.hypot(slideX, slideY) <= 1e-9) return null;
    let worldDeltaX = slideX / horizontalScale;
    let worldDeltaY = slideY / verticalScale;
    const requestedDistance = Math.hypot(
      x - this.ownerSpatial.x,
      y - this.ownerSpatial.y,
    );
    const slideDistance = Math.hypot(worldDeltaX, worldDeltaY);
    if (requestedDistance === 0 || slideDistance === 0) return null;
    const distanceScale = requestedDistance / slideDistance;
    worldDeltaX *= distanceScale;
    worldDeltaY *= distanceScale;
    const targetX = this.clampCoordinate(
      this.ownerSpatial.x + worldDeltaX,
    );
    const targetY = this.clampCoordinate(
      this.ownerSpatial.y + worldDeltaY,
    );
    return targetX === this.ownerSpatial.x &&
        targetY === this.ownerSpatial.y
      ? null
      : { x: targetX, y: targetY };
  }

  private ownerPathIntersectsDog(x: number, y: number): boolean {
    if (this.ownerSpatial.room !== this.spatial.room) return false;
    const separationAt = (progress: number): number =>
      ownerDogFootprintSeparation(
        {
          room: this.ownerSpatial.room,
          x: this.ownerSpatial.x +
            (x - this.ownerSpatial.x) * progress,
          y: this.ownerSpatial.y +
            (y - this.ownerSpatial.y) * progress,
        },
        this.spatial,
      );
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const first = lower + (upper - lower) / 3;
      const second = upper - (upper - lower) / 3;
      if (separationAt(first) <= separationAt(second)) {
        upper = second;
      } else {
        lower = first;
      }
    }
    const midpoint = (lower + upper) / 2;
    return Math.min(
      separationAt(0),
      separationAt(midpoint),
      separationAt(1),
    ) < 1 - 1e-9;
  }

  private leaveWorkSeatForMovement(): void {
    if (!this.work.seated) return;
    this.work = {
      ...this.work,
      active: false,
      seated: false,
    };
    this.ownerSpatial.activity = "idle";
    this.ownerSpatial.destinationActivity = "idle";
  }

  private setSpatialGoal(
    room: RoomId,
    x: number,
    y: number,
    activity: DogActivityId,
  ): void {
    const finalTarget = {
      room,
      x: this.clampCoordinate(x),
      y: this.clampCoordinate(y),
    };
    const waypoints = this.spatialWaypoints(this.spatial.room, finalTarget);
    const [target, ...route] = waypoints;
    this.spatial.targetRoom = target.room;
    this.spatial.targetX = target.x;
    this.spatial.targetY = target.y;
    this.spatial.route = route;
    this.spatial.activity = activity;
    this.spatial.moving = this.spatial.room !== target.room ||
      this.spatial.x !== target.x || this.spatial.y !== target.y;
  }

  private spatialWaypoints(
    from: RoomId,
    target: DogSpatialWaypoint,
  ): DogSpatialWaypoint[] {
    if (from === target.room || this.adjacent(from, target.room)) {
      return [target];
    }
    const throughLiving = target.room === "kitchen"
      ? BALANCE.SPATIAL.TRANSITION.living.kitchen.exit
      : BALANCE.SPATIAL.TRANSITION.living.toilet.exit;
    return [
      { room: "living", x: throughLiving.x, y: throughLiving.y },
      target,
    ];
  }

  private advanceSpatialMovement(): void {
    if (!this.spatial.moving) {
      return;
    }

    if (this.spatial.room !== this.spatial.targetRoom) {
      const transition = this.transitionPoints(
        this.spatial.room,
        this.spatial.targetRoom,
      );
      if (transition === null) {
        throw new RangeError("spatial target must be the same or adjacent room");
      }
      if (!this.moveSpatialToward(transition.exit.x, transition.exit.y)) {
        return;
      }
      if (
        ownerDogFootprintsOverlap(this.ownerSpatial, {
          room: this.spatial.targetRoom,
          x: transition.entry.x,
          y: transition.entry.y,
        })
      ) {
        this.stopSpatialActivity();
        return;
      }
      this.spatial.room = this.spatial.targetRoom;
      this.dogRoom = this.spatial.room;
      this.spatial.x = transition.entry.x;
      this.spatial.y = transition.entry.y;
    }

    if (!this.moveSpatialToward(
      this.spatial.targetX,
      this.spatial.targetY,
    )) {
      return;
    }
    if (this.spatial.route.length > BALANCE.NUMBER.ZERO) {
      const [next, ...route] = this.spatial.route;
      this.spatial.targetRoom = next.room;
      this.spatial.targetX = next.x;
      this.spatial.targetY = next.y;
      this.spatial.route = route;
      return;
    }
    this.spatial.moving = false;
  }

  private moveSpatialToward(x: number, y: number): boolean {
    const deltaX = x - this.spatial.x;
    const deltaY = y - this.spatial.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= BALANCE.SPATIAL.SPEED_PER_MINUTE) {
      if (
        ownerDogFootprintsOverlap(this.ownerSpatial, {
          room: this.spatial.room,
          x,
          y,
        })
      ) {
        this.stopSpatialActivity();
        return false;
      }
      this.spatial.x = x;
      this.spatial.y = y;
      return true;
    }
    const scale = BALANCE.SPATIAL.SPEED_PER_MINUTE / distance;
    const nextX = this.clampCoordinate(
      this.spatial.x + deltaX * scale,
    );
    const nextY = this.clampCoordinate(
      this.spatial.y + deltaY * scale,
    );
    if (
      ownerDogFootprintsOverlap(this.ownerSpatial, {
        room: this.spatial.room,
        x: nextX,
        y: nextY,
      })
    ) {
      this.stopSpatialActivity();
      return false;
    }
    this.spatial.x = nextX;
    this.spatial.y = nextY;
    return false;
  }

  private transitionPoints(
    from: RoomId,
    to: RoomId,
  ): {
    exit: { x: number; y: number };
    entry: { x: number; y: number };
  } | null {
    if (from === "living" && to === "kitchen") {
      return BALANCE.SPATIAL.TRANSITION.living.kitchen;
    }
    if (from === "living" && to === "toilet") {
      return BALANCE.SPATIAL.TRANSITION.living.toilet;
    }
    if (from === "kitchen" && to === "living") {
      return BALANCE.SPATIAL.TRANSITION.kitchen.living;
    }
    if (from === "toilet" && to === "living") {
      return BALANCE.SPATIAL.TRANSITION.toilet.living;
    }
    return null;
  }

  private adjacentRooms(room: RoomId): RoomId[] {
    return room === "living" ? ["kitchen", "toilet"] : ["living"];
  }

  private relocateSpatial(room: RoomId): void {
    if (this.spatial.room === room) {
      this.dogRoom = room;
      return;
    }
    let position: { x: number; y: number } =
      BALANCE.SPATIAL.INITIAL[room];
    if (
      ownerDogFootprintsOverlap(this.ownerSpatial, {
        room,
        x: position.x,
        y: position.y,
      })
    ) {
      position = this.safeDogPointNearOwner();
    }
    this.spatial.room = room;
    this.spatial.x = position.x;
    this.spatial.y = position.y;
    this.spatial.targetRoom = room;
    this.spatial.targetX = position.x;
    this.spatial.targetY = position.y;
    this.spatial.route = [];
    this.spatial.moving = false;
    this.dogRoom = room;
  }

  private relocateOwnerSpatial(room: RoomId): void {
    const position = BALANCE.LIFESTYLE.OWNER.INITIAL[room];
    if (!this.trySetOwnerPosition(room, position.x, position.y)) {
      const footprint = BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT;
      const travel = footprint.ROOM_TRAVEL_PX[room];
      const horizontalClearance =
        footprint.HORIZONTAL_CLEARANCE_PX / travel.x *
        footprint.SAFE_SCALE;
      const verticalClearance =
        footprint.VERTICAL_CLEARANCE_PX / travel.y *
        footprint.SAFE_SCALE;
      const candidates = [
        { x: this.spatial.x + horizontalClearance, y: this.spatial.y },
        { x: this.spatial.x - horizontalClearance, y: this.spatial.y },
        { x: this.spatial.x, y: this.spatial.y + verticalClearance },
        { x: this.spatial.x, y: this.spatial.y - verticalClearance },
      ];
      const safe = candidates.find((candidate) =>
        !this.ownerPositionOverlapsDog(
          room,
          this.clampCoordinate(candidate.x),
          this.clampCoordinate(candidate.y),
        )
      );
      if (
        safe === undefined ||
        !this.trySetOwnerPosition(room, safe.x, safe.y)
      ) {
        throw new RangeError("owner room relocation has no safe position");
      }
    }
    this.ownerSpatial.targetRoom = room;
    this.ownerSpatial.targetX = this.ownerSpatial.x;
    this.ownerSpatial.targetY = this.ownerSpatial.y;
    this.ownerSpatial.route = [];
    this.ownerSpatial.activity = "idle";
    this.ownerSpatial.destinationActivity = "idle";
    this.ownerSpatial.moving = false;
  }

  private stopSpatialActivity(): void {
    this.spatial.activity = "idle";
    this.spatial.targetRoom = this.spatial.room;
    this.spatial.targetX = this.spatial.x;
    this.spatial.targetY = this.spatial.y;
    this.spatial.route = [];
    this.spatial.moving = false;
  }

  private randomCoordinate(): number {
    return this.rng.range(
      BALANCE.SPATIAL.RANDOM_TARGET_MIN,
      BALANCE.SPATIAL.RANDOM_TARGET_MAX,
    );
  }

  private clampCoordinate(value: number): number {
    return Math.max(
      BALANCE.SPATIAL.MIN_COORDINATE,
      Math.min(BALANCE.SPATIAL.MAX_COORDINATE, value),
    );
  }

  private markOpportunity(room: RoomId): void {
    this.opportunityRevision += BALANCE.NUMBER.ONE;
    if (this.visibilityFor(room) !== "hidden") {
      this.visibleOpportunityRevision += BALANCE.NUMBER.ONE;
    }
  }

  private cancelPendingEat(): void {
    this.pendingEatAt = null;
  }

  private changeMemory(key: MemoryKey, delta: number): void {
    this.memory[key] = clamp(this.memory[key] + delta);
  }

  private personalityValue(): number {
    return this.rng.range(
      BALANCE.INITIAL.PERSONALITY_MIN,
      BALANCE.INITIAL.PERSONALITY_MAX,
    );
  }

  private activityDuration(minutes: number): number {
    const requested = requireNonNegative(minutes, "minutes");
    return Math.min(requested, BALANCE.TIME.DAY_END - this.minuteOfDay);
  }

  private accelerateDigestion(correction: number): void {
    this.digestionQueue = this.digestionQueue.map((item) => ({
      ...item,
      dueAt: Math.max(
        this.absoluteMinute + BALANCE.TIME.TICK_MINUTES,
        Math.round(item.dueAt - correction),
      ),
    }));
  }

  private advancePendingPressure(): void {
    if (this.pendingPressurePerMinute === null) {
      return;
    }
    this.stats.bowelPressure = clamp(
      this.stats.bowelPressure + this.pendingPressurePerMinute,
    );
  }

  private resetPoopCycle(): void {
    this.poopDueAt = null;
    this.pendingPressurePerMinute = null;
    this.scheduledSignals = [];
  }

  private createCountedRng(seed: number, consumed = 0): WaitdogRng {
    const base = createRng(seed);
    for (let call = 0; call < consumed; call += BALANCE.NUMBER.ONE) {
      base.next();
    }
    this.rngCursor = consumed;
    const next = (): number => {
      this.rngCursor += BALANCE.NUMBER.ONE;
      return base.next();
    };
    return {
      next,
      range: (min, max) => min + (max - min) * next(),
      integer: (min, max) =>
        Math.floor(min + (max - min + BALANCE.NUMBER.ONE) * next()),
      chance: (probability) => {
        const safeProbability = Math.max(
          BALANCE.NUMBER.ZERO,
          Math.min(BALANCE.NUMBER.ONE, probability),
        );
        return next() < safeProbability;
      },
    };
  }

  private isValidSnapshot(value: unknown): value is WaitdogSnapshot {
    if (!isRecord(value) || !hasExactKeys(value, SNAPSHOT_KEYS)) return false;
    if (
      value.version !== BALANCE.NUMBER.FOUR ||
      !this.isValidSnapshotBody(value) ||
      !this.isValidSpatialState(value.spatial, value.dogRoom) ||
      !this.isValidOwnerSpatialState(
        value.ownerSpatial,
        (value.owner as Required<OwnerState>).room,
      ) ||
      !isEncounterDirectorState(value.encounterDirector) ||
      !isEconomyState(value.economy) ||
      !isWorkState(value.work) ||
      !isEnvironmentState(value.environment)
    ) {
      return false;
    }
    if (
      !this.hasValidLifestyleState(
        value.ownerSpatial as OwnerSpatialState,
        value.spatial as DogSpatialState,
        value.work as WorkState,
        value.economy as EconomyState,
        value.environment as EnvironmentState,
      )
    ) {
      return false;
    }
    return this.hasValidOpportunityRevisions(value);
  }

  private hasValidLifestyleState(
    ownerSpatial: OwnerSpatialState,
    spatial: DogSpatialState,
    work: WorkState,
    economy: EconomyState,
    environment: EnvironmentState,
  ): boolean {
    const salaryGigIds = economy.ledger
      .filter((entry) => entry.kind === "salary")
      .map((entry) => entry.id.replace(/^salary:/, ""));
    const currentGigSalary = work.activeGigId === null
      ? undefined
      : economy.ledger.find((entry) =>
        entry.kind === "salary" &&
        entry.id === `salary:${work.activeGigId}`
      );
    const lastPayoutIsValid = work.progress === 100
      ? currentGigSalary?.moneyDelta === work.lastPayout
      : work.lastPayout === 0;
    const placementLedgerCountsAreValid = CATALOG
      .filter((item) =>
        item.category === "pad" || item.category === "barrier"
      )
      .every((item) => {
        const placedCount =
          (environment.padPlacement?.itemId === item.id ? 1 : 0) +
          environment.barriers.filter((barrier) =>
            barrier.itemId === item.id
          ).length;
        const consumedCount = -economy.ledger
          .filter((entry) =>
            entry.kind === "consume" && entry.itemId === item.id
          )
          .reduce((sum, entry) => sum + entry.quantityDelta, 0);
        return placedCount <= consumedCount;
      });
    const foodBowlLedgerIsValid =
      environment.foodBowl.itemId === null ||
      economy.ledger.some((entry) =>
        entry.kind === "consume" &&
        entry.itemId === environment.foodBowl.itemId &&
        entry.id.startsWith("food-bowl:")
      );
    return !(
      ownerDogFootprintsOverlap(ownerSpatial, spatial) ||
      (work.seated &&
        !this.ownerStateAtHotspot(ownerSpatial, "computer")) ||
      (work.alert !== null && work.active) ||
      salaryGigIds.length !== work.paidGigIds.length ||
      !salaryGigIds.every((gigId, index) =>
        work.paidGigIds[index] === gigId
      ) ||
      !lastPayoutIsValid ||
      !placementLedgerCountsAreValid ||
      !foodBowlLedgerIsValid
    );
  }

  private isValidSnapshotV3(value: unknown): value is WaitdogSnapshotV3 {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, SNAPSHOT_V3_KEYS) ||
      value.version !== BALANCE.NUMBER.THREE ||
      !this.isValidSnapshotBody(value) ||
      !this.isValidSpatialState(value.spatial, value.dogRoom) ||
      !this.isValidOwnerSpatialState(
        value.ownerSpatial,
        (value.owner as Required<OwnerState>).room,
      ) ||
      !isEncounterDirectorState(value.encounterDirector) ||
      !isEconomyState(value.economy)
    ) {
      return false;
    }
    const work = this.migrateWorkStateV3(value.work);
    const environment = this.migrateEnvironmentStateV3(value.environment);
    if (
      work === null ||
      environment === null ||
      !this.hasValidLifestyleState(
        value.ownerSpatial as OwnerSpatialState,
        value.spatial as DogSpatialState,
        work,
        value.economy as EconomyState,
        environment,
      )
    ) {
      return false;
    }
    return this.hasValidOpportunityRevisions(value);
  }

  private isValidSnapshotV2(value: unknown): value is WaitdogSnapshotV2 {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, SNAPSHOT_V2_KEYS) ||
      value.version !== BALANCE.NUMBER.TWO ||
      !this.isValidSnapshotBody(value) ||
      !this.isValidSpatialState(value.spatial, value.dogRoom)
    ) {
      return false;
    }
    return this.hasValidOpportunityRevisions(value);
  }

  private hasValidOpportunityRevisions(
    value: Record<string, unknown>,
  ): boolean {
    const log = value.log as EventLog[];
    const opportunityCount = log.filter((event) =>
      this.isImportantOpportunityType(event.type)
    ).length;
    const visibleOpportunityCount = log.filter((event) =>
      event.visibility !== "hidden" &&
      this.isImportantOpportunityType(event.type)
    ).length;
    return isNonNegativeInteger(value.opportunityRevision) &&
      value.opportunityRevision === opportunityCount &&
      isNonNegativeInteger(value.visibleOpportunityRevision) &&
      value.visibleOpportunityRevision === visibleOpportunityCount;
  }

  private isValidSnapshotV1(value: unknown): value is WaitdogSnapshotV1 {
    return isRecord(value) &&
      hasExactKeys(value, SNAPSHOT_V1_KEYS) &&
      value.version === BALANCE.NUMBER.ONE &&
      this.isValidSnapshotBody(value);
  }

  private isValidSnapshotBody(value: Record<string, unknown>): boolean {
    const stats = [
      "hunger",
      "thirst",
      "bowelPressure",
      "fatigue",
      "stress",
      "excitement",
      "boredom",
      "comfort",
    ];
    const personality = [
      "foodDrive",
      "impulsivity",
      "sensitivity",
      "sociability",
      "adaptability",
    ];
    const memory = [
      "approachSafety",
      "recallTrust",
      "nameSkill",
      "waitSkill",
      "matExpectation",
      "coproHabit",
      "snatchExpectation",
      "hiddenPoopTendency",
      "attentionViaPoop",
    ];
    const owner = value.owner;
    const activePoop = value.activePoop;
    const lastBehavior = value.lastBehavior;
    const digestionQueue = value.digestionQueue;
    const scheduledSignals = value.scheduledSignals;
    const log = value.log;
    const nullableTimes = [
      value.pendingEatAt,
      value.poopDueAt,
      value.lastCalmSuccessAt,
      value.cleanupUntil,
      value.lastDigestedFeedAt,
    ];
    return isFiniteNumber(value.seed) &&
      isNonNegativeInteger(value.rngCursor) &&
      value.rngCursor <= 10_000_000 &&
      isNonNegativeInteger(value.day) &&
      value.day >= BALANCE.NUMBER.ONE &&
      isNonNegativeInteger(value.minuteOfDay) &&
      value.minuteOfDay >= BALANCE.TIME.DAY_START &&
      value.minuteOfDay <= BALANCE.TIME.DAY_END &&
      isNonNegativeInteger(value.absoluteMinute) &&
      value.absoluteMinute ===
        (value.day - BALANCE.NUMBER.ONE) *
            BALANCE.TIME.DAY_LENGTH +
          value.minuteOfDay &&
      typeof value.dogRoom === "string" && isRoom(value.dogRoom) &&
      isRecord(owner) &&
      hasExactKeys(owner, ["room", "focusLocked", "away"]) &&
      typeof owner.room === "string" &&
      isRoom(owner.room) && typeof owner.focusLocked === "boolean" &&
      typeof owner.away === "boolean" &&
      hasBoundedNumbers(value.personality, personality) &&
      hasBoundedNumbers(value.stats, stats) &&
      hasBoundedNumbers(value.memory, memory) &&
      hasBoundedNumbers(value.matSkill, ROOMS) &&
      isBoundedNumber(value.matSkillOwnerAway) &&
      typeof value.blocked === "boolean" &&
      typeof value.currentAction === "string" &&
      ACTIONS.includes(value.currentAction as ActionId | "idle") &&
      isNonNegativeInteger(value.actionStartedAt) &&
      Array.isArray(digestionQueue) && digestionQueue.every((item) =>
        isRecord(item) && hasExactKeys(item, ["fedAt", "dueAt", "volume"]) &&
        isNonNegativeInteger(item.fedAt) &&
        isNonNegativeInteger(item.dueAt) && isFiniteNumber(item.volume) &&
        item.volume > BALANCE.NUMBER.ZERO &&
        item.volume <= BALANCE.NUMBER.ONE_HUNDRED
      ) &&
      (activePoop === null ||
        (isRecord(activePoop) &&
          hasExactKeys(activePoop, ["room", "createdAt", "location"]) &&
          typeof activePoop.room === "string" &&
          isRoom(activePoop.room) &&
          isNonNegativeInteger(activePoop.createdAt) &&
          (activePoop.location === "pad" || activePoop.location === "corner"))) &&
      nullableTimes.every(isNullableInteger) &&
      (value.pendingPressurePerMinute === null ||
        (isFiniteNumber(value.pendingPressurePerMinute) &&
          value.pendingPressurePerMinute >= BALANCE.NUMBER.ZERO)) &&
      Array.isArray(scheduledSignals) && scheduledSignals.every((signal) =>
        isRecord(signal) &&
        hasExactKeys(signal, ["at", "type", "emitted"]) &&
        isNonNegativeInteger(signal.at) &&
        typeof signal.type === "string" &&
        (SIGNALS as readonly string[]).includes(signal.type) &&
        typeof signal.emitted === "boolean"
      ) &&
      (lastBehavior === null ||
        (isRecord(lastBehavior) &&
          hasExactKeys(lastBehavior, ["action", "at", "room"]) &&
          typeof lastBehavior.action === "string" &&
          ACTIONS.includes(lastBehavior.action as ActionId) &&
          lastBehavior.action !== "idle" &&
          isNonNegativeInteger(lastBehavior.at) &&
          typeof lastBehavior.room === "string" && isRoom(lastBehavior.room))) &&
      Array.isArray(value.poopDelayHistory) &&
      value.poopDelayHistory.every(isNonNegativeInteger) &&
      Array.isArray(log) && log.every((event) =>
        isRecord(event) &&
        hasExactKeys(event, ["t", "type", "room", "visibility", "detail"]) &&
        isNonNegativeInteger(event.t) &&
        typeof event.type === "string" && typeof event.room === "string" &&
        isRoom(event.room) && typeof event.visibility === "string" &&
        VISIBILITIES.includes(event.visibility as Visibility) &&
        isRecord(event.detail) && isJsonValue(event.detail)
      ) &&
      Number.isInteger(value.poopRevision) &&
      (value.poopRevision as number) >= BALANCE.NUMBER.ZERO;
  }

  private isValidSpatialState(
    value: unknown,
    dogRoom: unknown,
  ): value is DogSpatialState {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "room",
        "x",
        "y",
        "targetRoom",
        "targetX",
        "targetY",
        "route",
        "activity",
        "moving",
        "nextActivityAt",
      ]) ||
      typeof value.room !== "string" ||
      !isRoom(value.room) ||
      value.room !== dogRoom ||
      typeof value.targetRoom !== "string" ||
      !isRoom(value.targetRoom) ||
      !this.isCoordinate(value.x) ||
      !this.isCoordinate(value.y) ||
      !this.isCoordinate(value.targetX) ||
      !this.isCoordinate(value.targetY) ||
      typeof value.activity !== "string" ||
      !ACTIVITIES.includes(value.activity as DogActivityId) ||
      typeof value.moving !== "boolean" ||
      !isNonNegativeInteger(value.nextActivityAt) ||
      !Array.isArray(value.route)
    ) {
      return false;
    }
    const route = value.route;
    if (
      !route.every((waypoint) =>
        isRecord(waypoint) &&
        hasExactKeys(waypoint, ["room", "x", "y"]) &&
        typeof waypoint.room === "string" &&
        isRoom(waypoint.room) &&
        this.isCoordinate(waypoint.x) &&
        this.isCoordinate(waypoint.y)
      )
    ) {
      return false;
    }
    if (
      route.length > BALANCE.NUMBER.ONE ||
      (!value.moving &&
        (route.length > BALANCE.NUMBER.ZERO ||
          value.room !== value.targetRoom ||
          value.x !== value.targetX ||
          value.y !== value.targetY))
    ) {
      return false;
    }
    const rooms = [
      value.room,
      value.targetRoom,
      ...route.map((waypoint) => waypoint.room as RoomId),
    ] as RoomId[];
    return rooms.every((room, index) =>
      index === BALANCE.NUMBER.ZERO ||
      room === rooms[index - BALANCE.NUMBER.ONE] ||
      this.adjacent(rooms[index - BALANCE.NUMBER.ONE], room)
    );
  }

  private isValidOwnerSpatialState(
    value: unknown,
    ownerRoom: RoomId,
  ): value is OwnerSpatialState {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "room",
        "x",
        "y",
        "targetRoom",
        "targetX",
        "targetY",
        "route",
        "activity",
        "destinationActivity",
        "moving",
        "collisionRadius",
      ]) ||
      typeof value.room !== "string" ||
      !isRoom(value.room) ||
      value.room !== ownerRoom ||
      typeof value.targetRoom !== "string" ||
      !isRoom(value.targetRoom) ||
      !this.isCoordinate(value.x) ||
      !this.isCoordinate(value.y) ||
      !this.isCoordinate(value.targetX) ||
      !this.isCoordinate(value.targetY) ||
      !["idle", "moving", "working", "responding"].includes(
        value.activity as string,
      ) ||
      !["idle", "working", "responding"].includes(
        value.destinationActivity as string,
      ) ||
      typeof value.moving !== "boolean" ||
      value.collisionRadius !==
        BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS ||
      !Array.isArray(value.route)
    ) {
      return false;
    }
    const route = value.route;
    if (
      route.length > 1 ||
      !route.every((waypoint) =>
        isRecord(waypoint) &&
        hasExactKeys(waypoint, ["room", "x", "y"]) &&
        typeof waypoint.room === "string" &&
        isRoom(waypoint.room) &&
        this.isCoordinate(waypoint.x) &&
        this.isCoordinate(waypoint.y)
      ) ||
      (value.moving !== (value.activity === "moving")) ||
      (!value.moving &&
        (route.length > 0 ||
          value.room !== value.targetRoom ||
          value.x !== value.targetX ||
          value.y !== value.targetY ||
          value.activity !== value.destinationActivity))
    ) {
      return false;
    }
    const rooms = [
      value.room,
      value.targetRoom,
      ...route.map((waypoint) => waypoint.room as RoomId),
    ] as RoomId[];
    return rooms.every((room, index) =>
      index === 0 ||
      room === rooms[index - 1] ||
      this.adjacent(rooms[index - 1], room)
    );
  }

  private isCoordinate(value: unknown): value is number {
    return isFiniteNumber(value) &&
      value >= BALANCE.SPATIAL.MIN_COORDINATE &&
      value <= BALANCE.SPATIAL.MAX_COORDINATE;
  }

  private migrateSnapshotV1(snapshot: WaitdogSnapshotV1): WaitdogSnapshotV2 {
    const position = BALANCE.SPATIAL.INITIAL[snapshot.dogRoom];
    const opportunityRevision = snapshot.log.filter((event) =>
      this.isImportantOpportunityType(event.type)
    ).length;
    const visibleOpportunityRevision = snapshot.log.filter((event) =>
      event.visibility !== "hidden" &&
      this.isImportantOpportunityType(event.type)
    ).length;
    const { version: _version, ...legacy } = snapshot;
    return {
      ...legacy,
      version: 2,
      spatial: {
        room: snapshot.dogRoom,
        x: position.x,
        y: position.y,
        targetRoom: snapshot.dogRoom,
        targetX: position.x,
        targetY: position.y,
        route: [],
        activity: snapshot.currentAction,
        moving: false,
        nextActivityAt: snapshot.absoluteMinute +
          BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES,
      },
      opportunityRevision,
      visibleOpportunityRevision,
    };
  }

  private migrateSnapshotV2(snapshot: WaitdogSnapshotV2): WaitdogSnapshotV3 {
    const { version: _version, ...legacy } = snapshot;
    let economy = createEconomyState();
    if (snapshot.day >= 2) {
      const coupon = grantClinicCoupon(economy, snapshot.day);
      if (coupon.ok) economy = coupon.state;
    }
    return {
      ...legacy,
      version: 3,
      ownerSpatial: this.createMigratedOwnerSpatial(snapshot),
      encounterDirector: createEncounterDirectorState(),
      economy,
      work: {
        activeGigId: null,
        progress: 0,
        completedBlocks: 0,
        minutesInBlock: 0,
        active: false,
        continuityEligible: true,
        paidGigIds: [],
        lastPayout: 0,
        alert: null,
      },
      environment: {
        selectedPadId: "pad-paper",
        padPlacement: null,
        barriers: [],
      },
    };
  }

  private migrateSnapshotV3(snapshot: WaitdogSnapshotV3): WaitdogSnapshot {
    const work = this.migrateWorkStateV3(snapshot.work);
    const environment = this.migrateEnvironmentStateV3(snapshot.environment);
    if (work === null || environment === null) return invalidSnapshot();
    const { version: _version, ...legacy } = snapshot;
    return {
      ...legacy,
      version: 4,
      work,
      environment,
    };
  }

  private migrateWorkStateV3(value: unknown): WorkState | null {
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
      ])
    ) {
      return null;
    }
    const candidate = {
      ...value,
      seated: value.active === true || value.alert !== null,
    };
    return isWorkState(candidate) ? candidate : null;
  }

  private migrateEnvironmentStateV3(
    value: unknown,
  ): EnvironmentState | null {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "selectedPadId",
        "padPlacement",
        "barriers",
      ])
    ) {
      return null;
    }
    const candidate = {
      ...value,
      foodBowl: { itemId: null, level: 0 },
      waterBowl: { level: 0, clean: true },
    };
    return isEnvironmentState(candidate) ? candidate : null;
  }

  private createMigratedOwnerSpatial(
    snapshot: WaitdogSnapshotV2,
  ): OwnerSpatialState {
    const initial = BALANCE.LIFESTYLE.OWNER.INITIAL[snapshot.owner.room];
    const footprint = BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT;
    const travel = footprint.ROOM_TRAVEL_PX[snapshot.owner.room];
    const horizontalClearance =
      footprint.HORIZONTAL_CLEARANCE_PX / travel.x *
      footprint.SAFE_SCALE;
    const verticalClearance =
      footprint.VERTICAL_CLEARANCE_PX / travel.y *
      footprint.SAFE_SCALE;
    let position: { x: number; y: number } = { ...initial };
    if (
      ownerDogFootprintsOverlap(
        {
          room: snapshot.owner.room,
          x: position.x,
          y: position.y,
          targetRoom: snapshot.owner.room,
          targetX: position.x,
          targetY: position.y,
          route: [],
          activity: "idle",
          destinationActivity: "idle",
          moving: false,
          collisionRadius: BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS,
        },
        snapshot.spatial,
      )
    ) {
      const candidates = [
        {
          x: this.clampCoordinate(
            snapshot.spatial.x + horizontalClearance,
          ),
          y: snapshot.spatial.y,
        },
        {
          x: this.clampCoordinate(
            snapshot.spatial.x - horizontalClearance,
          ),
          y: snapshot.spatial.y,
        },
        {
          x: snapshot.spatial.x,
          y: this.clampCoordinate(
            snapshot.spatial.y + verticalClearance,
          ),
        },
        {
          x: snapshot.spatial.x,
          y: this.clampCoordinate(
            snapshot.spatial.y - verticalClearance,
          ),
        },
      ];
      position = candidates.find((candidate) =>
        !ownerDogFootprintsOverlap(
          {
            room: snapshot.owner.room,
            x: candidate.x,
            y: candidate.y,
            targetRoom: snapshot.owner.room,
            targetX: candidate.x,
            targetY: candidate.y,
            route: [],
            activity: "idle",
            destinationActivity: "idle",
            moving: false,
            collisionRadius: BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS,
          },
          snapshot.spatial,
        )
      ) ?? initial;
    }
    return {
      room: snapshot.owner.room,
      x: position.x,
      y: position.y,
      targetRoom: snapshot.owner.room,
      targetX: position.x,
      targetY: position.y,
      route: [],
      activity: "idle",
      destinationActivity: "idle",
      moving: false,
      collisionRadius: BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS,
    };
  }

  private isImportantOpportunityType(type: string): boolean {
    return type === "sniffFloor" || type === "circle" ||
      type === "wander" || type === "poop";
  }

  private normalizeOwner(owner: OwnerState): Required<OwnerState> {
    if (
      !isRoom(owner.room) ||
      typeof owner.focusLocked !== "boolean" ||
      (owner.away !== undefined && typeof owner.away !== "boolean")
    ) {
      throw new RangeError(
        "owner must contain a valid room, focusLocked, and optional away",
      );
    }
    return {
      room: owner.room,
      focusLocked: owner.focusLocked,
      away: owner.away ?? false,
    };
  }

  private hiddenRoomFromOwner(): RoomId {
    if (this.owner.room === "kitchen") {
      return "toilet";
    }
    if (this.owner.room === "toilet") {
      return "kitchen";
    }
    return this.rng.chance(BALANCE.NUMBER.FIFTY / BALANCE.NUMBER.ONE_HUNDRED)
      ? "kitchen"
      : "toilet";
  }

  private visibilityFor(room: RoomId): Visibility {
    if (this.owner.away) {
      return "hidden";
    }
    if (room === this.owner.room && !this.owner.focusLocked) {
      return "seen";
    }
    if (this.adjacent(room, this.owner.room)) {
      return "heard";
    }
    return "hidden";
  }

  private adjacent(first: RoomId, second: RoomId): boolean {
    return (
      (first === "living" && (second === "kitchen" || second === "toilet")) ||
      (second === "living" && (first === "kitchen" || first === "toilet"))
    );
  }

  private record(
    type: string,
    room: RoomId,
    detail: Record<string, unknown>,
  ): void {
    this.log.push({
      t: this.absoluteMinute,
      type,
      room,
      visibility: this.visibilityFor(room),
      detail: clone(detail),
    });
  }

  private clampAll(): void {
    for (const key of Object.keys(this.stats) as Array<keyof DogStats>) {
      this.stats[key] = clamp(this.stats[key]);
    }
    for (const key of Object.keys(this.memory) as MemoryKey[]) {
      this.memory[key] = clamp(this.memory[key]);
    }
    for (const room of ROOMS) {
      this.matSkill[room] = clamp(this.matSkill[room]);
    }
    this.matSkillOwnerAway = clamp(this.matSkillOwnerAway);
  }
}

export function createSim(seed: number, opts?: WaitdogSimOptions): WaitdogUiSim {
  return new WaitdogSimulation(seed, opts);
}
