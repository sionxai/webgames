import { BALANCE, ROOMS, SIGNALS } from "../constants/balance";
import { createRng, type WaitdogRng } from "../core/rng";
import type {
  ActionId,
  ActionUtilityTrace,
  ActivePoop,
  DecisionTrace,
  DigestionItem,
  DogStats,
  DogView,
  EventLog,
  InterventionKind,
  InterventionResult,
  LearningMemory,
  MatSkill,
  MemoryKey,
  OwnerState,
  Personality,
  PoopPrediction,
  RoomId,
  SignalType,
  Visibility,
  WaitdogFullState,
  WaitdogSim,
  WaitdogSimOptions,
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
}

export interface WaitdogUiSim extends WaitdogSim {
  getDogView(): WaitdogUiView;
  serialize(): WaitdogSnapshot;
  restore(snapshot: unknown): void;
}

export interface WaitdogSnapshot {
  version: 1;
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

const SNAPSHOT_KEYS: ReadonlyArray<keyof WaitdogSnapshot> = [
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
    this.owner = this.normalizeOwner(
      opts.owner ?? { room: "living", focusLocked: false },
    );
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

  water(volume = BALANCE.PHYSIOLOGY.WATER_DEFAULT_VOLUME): void {
    const safeVolume = requirePositiveVolume(volume, "volume");
    this.stats.thirst = clamp(
      this.stats.thirst -
        safeVolume * BALANCE.PHYSIOLOGY.WATER_THIRST_REDUCTION_PER_VOLUME,
    );
    this.record("water", this.dogRoom, { volume: safeVolume });
  }

  walk(minutes: number): void {
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
    this.owner = this.normalizeOwner(owner);
    this.record("ownerState", this.owner.room, {
      focusLocked: this.owner.focusLocked,
      away: this.owner.away,
    });
  }

  intervene(kind: InterventionKind): InterventionResult {
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
        if (this.blocked && this.pendingEatAt !== null) {
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
      blocked: this.blocked,
    });
    if (kind === "cleanup" && success) {
      this.advanceMinutes(BALANCE.TIME.CLEANUP_MINUTES);
    }
    return { kind, interrupted, success, attributedTo };
  }

  serialize(): WaitdogSnapshot {
    return clone({
      version: 1,
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
            detail: event.type === "action" &&
                typeof event.detail.action === "string"
              ? { action: event.detail.action }
              : {},
          }
      );
    return {
      t: this.absoluteMinute,
      visibility,
      room: seen ? this.dogRoom : null,
      action: seen ? this.currentAction : null,
      observableStats: seen ? clone(this.stats) : {},
      day: this.day,
      minuteOfDay: this.minuteOfDay,
      owner: {
        room: this.owner.room,
        focusLocked: this.owner.focusLocked,
      },
      roomVisibility,
      blocked: this.blocked,
      activePoop,
      recentEvents,
      poopRevision: this.poopRevision,
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
      blocked: this.blocked,
      currentAction: this.currentAction,
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
        this.record(signal.type, this.dogRoom, { poopDueAt: this.poopDueAt });
      }
    }
  }

  private poop(): void {
    const padChance = BALANCE.DIGESTION.PAD_BASE_CHANCE +
      this.matSkill.toilet * BALANCE.DIGESTION.PAD_SKILL_FACTOR;
    const onPad = this.rng.chance(padChance);
    let room: RoomId = onPad ? "toilet" : this.dogRoom;
    if (
      !onPad &&
      this.visibilityFor(room) === "seen" &&
      this.rng.chance(
        this.memory.hiddenPoopTendency * BALANCE.DIGESTION.HIDDEN_CHANCE_FACTOR,
      )
    ) {
      room = this.hiddenRoomFromOwner();
    }
    this.dogRoom = room;
    this.activePoop = {
      room,
      createdAt: this.absoluteMinute,
      location: onPad ? "pad" : "corner",
    };
    this.poopRevision += 1;
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
          this.blocked ? BALANCE.DECISION.BLOCK_PENALTY : BALANCE.NUMBER.ZERO,
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
    if (this.activePoop === null || this.blocked) {
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
    return value.version === BALANCE.NUMBER.ONE &&
      isFiniteNumber(value.seed) &&
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
