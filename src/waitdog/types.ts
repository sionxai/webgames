export type RoomId = "living" | "kitchen" | "toilet";

export type Visibility = "seen" | "heard" | "hidden";

export type DogStatKey =
  | "hunger"
  | "thirst"
  | "bowelPressure"
  | "fatigue"
  | "stress"
  | "excitement"
  | "boredom"
  | "comfort";

export type PersonalityKey =
  | "foodDrive"
  | "impulsivity"
  | "sensitivity"
  | "sociability"
  | "adaptability";

export type MemoryKey =
  | "approachSafety"
  | "recallTrust"
  | "nameSkill"
  | "waitSkill"
  | "matExpectation"
  | "coproHabit"
  | "snatchExpectation"
  | "hiddenPoopTendency"
  | "attentionViaPoop";

export type ActionId =
  | "eatPoop"
  | "moveToMat"
  | "watchOwner"
  | "flee"
  | "sniffLeave"
  | "zoomies";

export type DogActivityId =
  | "idle"
  | "rest"
  | "seekFood"
  | "seekWater"
  | "followOwner"
  | "play"
  | "wander"
  | "patrol"
  | ActionId
  | SignalType
  | "poop";

export type InterventionKind =
  | "calmCall"
  | "matCommand"
  | "praise"
  | "treat"
  | "toyLure"
  | "block"
  | "scold"
  | "cleanup";

export type SignalType = "sniffFloor" | "circle" | "wander";

export type EncounterId =
  | "potty"
  | "overexcited"
  | "recall"
  | "settle"
  | "alertBark"
  | "whine"
  | "anxiety"
  | "biteWarning"
  | "flee";

export type EncounterStage =
  | "cause"
  | "response"
  | "reinforcement"
  | "result";

export type EncounterSafetyLevel = "routine" | "caution" | "high";
export type EncounterCueKind =
  | "potty"
  | "overexcited"
  | "recall"
  | "settle"
  | "bark"
  | "whine"
  | "anxiety"
  | "biteWarning"
  | "flee";

export interface EncounterChoice {
  id: string;
  label: string;
}

export interface EncounterResult {
  instanceId: string;
  encounterId: EncounterId;
  success: boolean;
  score: number;
  carePointsAwarded: number;
  firstReward: boolean;
  inventoryDelta: Partial<Inventory>;
  message: string;
  safetyMessage: string | null;
}

export interface ActiveEncounter {
  instanceId: string;
  encounterId: EncounterId;
  revision: number;
  stage: EncounterStage;
  publicCues: string[];
  causeOptions: EncounterChoice[];
  responseOptions: EncounterChoice[];
  hiddenCauseId: string;
  selectedCauseId: string | null;
  selectedResponseId: string | null;
  requiredReinforcement: "praise" | "treat" | null;
  causeFailures: number;
  responseFailures: number;
  reinforcementFailures: number;
  idleSeconds: number;
  hintUsed: boolean;
  hint: string | null;
  resultApplied: boolean;
  safetyLevel: EncounterSafetyLevel;
  safetyBanner: string | null;
  result: EncounterResult | null;
}

export interface EncounterDirectorState {
  active: ActiveEncounter | null;
  lastResult: EncounterResult | null;
  nextRevision: number;
  completedCount: number;
  tutorialIndex: number;
  encountersSinceHint: number;
  lastEncounterUsedHint: boolean;
}

export interface EncounterPublicView {
  id: string;
  kind: EncounterId;
  tutorial: boolean;
  stage: EncounterStage | "cue" | "outcome";
  revision: number;
  title: string;
  publicClues: string[];
  cue: {
    kind: EncounterCueKind;
    label: string;
    room: RoomId;
    anchor: { x: number; y: number } | null;
  };
  causeChoices: EncounterChoice[];
  responseChoices: EncounterChoice[];
  reinforcementChoices: EncounterChoice[];
  selectedCauseId: string | null;
  selectedResponseId: string | null;
  hint: string | null;
  outcome: EncounterResult | null;
  instanceId: string;
  encounterId: EncounterId;
  publicCues: string[];
  causeOptions: EncounterChoice[];
  responseOptions: EncounterChoice[];
  reinforcementOptions: EncounterChoice[];
  safetyLevel: EncounterSafetyLevel;
  safetyBanner: string | null;
  result: EncounterResult | null;
}

export type OwnerActivityId = "idle" | "moving" | "working" | "responding";

export interface OwnerSpatialState {
  room: RoomId;
  x: number;
  y: number;
  targetRoom: RoomId;
  targetX: number;
  targetY: number;
  route: DogSpatialWaypoint[];
  activity: OwnerActivityId;
  destinationActivity: Exclude<OwnerActivityId, "moving">;
  moving: boolean;
  collisionRadius: number;
}

export type FoodItemId = "food-basic" | "food-comfort";
export type TreatItemId =
  | "treat-basic"
  | "treat-mini"
  | "treat-lick";
export type PadItemId = "pad-paper" | "pad-absorbent" | "pad-wide";
export type BarrierItemId =
  | "barrier-1-panel"
  | "barrier-2-panel"
  | "barrier-4-panel";
export type ShampooItemId = "shampoo-gentle" | "shampoo-quick";
export type ClinicItemId = "clinic-preventive";
export type CatalogItemId =
  | FoodItemId
  | TreatItemId
  | PadItemId
  | BarrierItemId
  | ShampooItemId
  | ClinicItemId;
export type CatalogCategory =
  | "food"
  | "treat"
  | "pad"
  | "barrier"
  | "shampoo"
  | "clinic";
export type SalaryUpgradeId =
  | "salary-routine"
  | "salary-portfolio"
  | "salary-specialist";

export type Inventory = Record<CatalogItemId, number>;

export interface EconomyLedgerEntry {
  id: string;
  kind:
    | "purchase"
    | "consume"
    | "salary"
    | "careReward"
    | "clinic"
    | "upgrade";
  moneyDelta: number;
  carePointDelta: number;
  itemId: CatalogItemId | null;
  quantityDelta: number;
  revision: number;
}

export interface EconomyState {
  money: number;
  carePoints: number;
  inventory: Inventory;
  unlockedItemIds: CatalogItemId[];
  salaryUpgrades: SalaryUpgradeId[];
  ledger: EconomyLedgerEntry[];
  firstRewardIds: string[];
  clinicCouponAvailable: boolean;
  preventiveVisitCompleted: boolean;
  revision: number;
}

export interface WorkState {
  activeGigId: string | null;
  progress: number;
  completedBlocks: number;
  minutesInBlock: number;
  active: boolean;
  continuityEligible: boolean;
  paidGigIds: string[];
  lastPayout: number;
  alert: {
    id: string;
    cueLabel: string;
    publicClues: string[];
    interruptPreview: string;
    continuePreview: string;
  } | null;
}

export interface PadPlacement {
  itemId: PadItemId;
  room: RoomId;
  x: number;
  y: number;
  coverage: number;
}

export interface BarrierPlacement {
  id: string;
  itemId: BarrierItemId;
  room: RoomId;
  x: number;
  y: number;
  width: number;
  height: number;
  panels: 1 | 2 | 4;
}

export interface EnvironmentState {
  selectedPadId: PadItemId;
  padPlacement: PadPlacement | null;
  barriers: BarrierPlacement[];
}

export interface PlacementValidation {
  ok: boolean;
  reason: string | null;
}

export interface LifestyleActionResult {
  ok: boolean;
  reason: string | null;
}

export interface DogStats {
  hunger: number;
  thirst: number;
  bowelPressure: number;
  fatigue: number;
  stress: number;
  excitement: number;
  boredom: number;
  comfort: number;
}

export interface Personality {
  foodDrive: number;
  impulsivity: number;
  sensitivity: number;
  sociability: number;
  adaptability: number;
}

export interface LearningMemory {
  approachSafety: number;
  recallTrust: number;
  nameSkill: number;
  waitSkill: number;
  matExpectation: number;
  coproHabit: number;
  snatchExpectation: number;
  hiddenPoopTendency: number;
  attentionViaPoop: number;
}

export type MatSkill = Record<RoomId, number>;

export interface OwnerState {
  room: RoomId;
  focusLocked: boolean;
  /** W1 owner-away generalization hook. Omitted means the owner is present. */
  away?: boolean;
}

export interface UtilityComponent {
  label: string;
  value: number;
}

export interface ActionUtilityTrace {
  action: ActionId;
  components: UtilityComponent[];
  subtotal: number;
  noise: number;
  score: number;
}

export interface DecisionTrace {
  selected: ActionId;
  utilities: ActionUtilityTrace[];
}

export interface EventLog {
  t: number;
  type: string;
  room: RoomId;
  visibility: Visibility;
  detail: Record<string, unknown>;
}

export interface DigestionItem {
  fedAt: number;
  dueAt: number;
  volume: number;
}

export interface ActivePoop {
  room: RoomId;
  createdAt: number;
  location: "pad" | "corner";
}

export interface DogSpatialWaypoint {
  room: RoomId;
  x: number;
  y: number;
}

export interface DogSpatialState {
  room: RoomId;
  x: number;
  y: number;
  targetRoom: RoomId;
  targetX: number;
  targetY: number;
  route: DogSpatialWaypoint[];
  activity: DogActivityId;
  moving: boolean;
  nextActivityAt: number;
}

export interface DogSpatialView {
  room: RoomId | null;
  x: number | null;
  y: number | null;
  targetRoom: RoomId | null;
  targetX: number | null;
  targetY: number | null;
  activity: DogActivityId | null;
  moving: boolean | null;
}

export interface WaitdogFullState {
  day: number;
  minuteOfDay: number;
  absoluteMinute: number;
  dogRoom: RoomId;
  owner: Required<OwnerState>;
  stats: DogStats;
  personality: Personality;
  memory: LearningMemory;
  matSkill: MatSkill;
  matSkillOwnerAway: number;
  blocked: boolean;
  currentAction: ActionId | "idle";
  spatial: DogSpatialState;
  ownerSpatial: OwnerSpatialState;
  encounterDirector: EncounterDirectorState;
  economy: EconomyState;
  work: WorkState;
  environment: EnvironmentState;
  ownerDogOverlap: boolean;
  opportunityRevision: number;
  digestionQueue: DigestionItem[];
  activePoop: ActivePoop | null;
}

export interface DogView {
  t: number;
  visibility: Visibility;
  room: RoomId | null;
  action: ActionId | "idle" | null;
  spatial: DogSpatialView;
  /** Revision of important opportunities observed while the dog was seen. */
  opportunityRevision: number;
  observableStats: Partial<DogStats>;
}

export interface PoopPrediction {
  start: number;
  end: number;
  confidence: number;
}

export interface InterventionResult {
  kind: InterventionKind;
  interrupted: boolean;
  success: boolean;
  attributedTo?: ActionId;
}

export interface WaitdogSimOptions {
  owner?: OwnerState;
  dogRoom?: RoomId;
}

export interface WaitdogSim {
  advanceMinutes(minutes: number): void;
  feed(volume: number): void;
  water(volume?: number): void;
  walk(minutes: number): void;
  play(minutes: number): void;
  setOwner(owner: OwnerState): void;
  intervene(kind: InterventionKind): InterventionResult;
  getDogView(): DogView;
  getFullState(): WaitdogFullState;
  getLog(): EventLog[];
  predictPoopWindow(): PoopPrediction;
  newDay(): void;
}
