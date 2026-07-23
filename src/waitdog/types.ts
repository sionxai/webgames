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
