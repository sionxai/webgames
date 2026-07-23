import { BALANCE } from "../constants/balance";
import type { WaitdogSnapshot } from "./waitdogSim";

export const WAITDOG_PROFILE_KEY = "waitdog_profile_v1";

export type CampaignPhase = "morning" | "live" | "review" | "campaignEnd";
export type Hypothesis = "배고픔" | "관심" | "불안";
export type TrainingGoalId = "mat" | "recall" | "calm";
export type TrainingStage = "watch" | "cue" | "reward" | "complete";

export interface TrainingProgress {
  day: number;
  goal: TrainingGoalId;
  stage: TrainingStage;
  completed: number;
  target: number;
  attempts: number;
  streak: number;
  lastCueAt: number | null;
  feedback: string;
}

export interface OwnerResources {
  energy: number;
  focus: number;
  workScore: number;
}

export interface CampaignScheduleItem {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number;
  focusLock: boolean;
  away: boolean;
}

export interface QualitativeDaySummary {
  day: number;
  atePoop: boolean;
  movedToMat: boolean;
  trustDirection: "up" | "steady" | "down";
}

interface CampaignSettingsV1 {
  version: 1;
  seed: number;
  speed: 0 | 1 | 2 | 4;
  infinite: boolean;
  interruptedScheduleIds: string[];
  daySchedule: CampaignScheduleItem[];
  morningSnapshot: WaitdogSnapshot | null;
  filteredObservations: Array<{ time: string; sentence: string }>;
  daySummaries: QualitativeDaySummary[];
}

export interface CampaignSettings {
  version: 2;
  seed: number;
  speed: 0 | 1 | 2 | 4;
  infinite: boolean;
  interruptedScheduleIds: string[];
  daySchedule: CampaignScheduleItem[];
  morningSnapshot: WaitdogSnapshot | null;
  filteredObservations: Array<{ time: string; sentence: string }>;
  daySummaries: QualitativeDaySummary[];
  training: TrainingProgress | null;
}

export interface WaitdogProfile {
  day: number;
  phase: CampaignPhase;
  simSnapshot: WaitdogSnapshot;
  ownerResources: OwnerResources;
  hypotheses: Hypothesis[];
  settings: CampaignSettings;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LoadProfileResult =
  | { ok: true; profile: WaitdogProfile | null }
  | { ok: false; error: string };

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; error: string };

const HYPOTHESES: readonly Hypothesis[] = ["배고픔", "관심", "불안"];
const TRAINING_GOALS: readonly TrainingGoalId[] = ["mat", "recall", "calm"];
const TRAINING_STAGES: readonly TrainingStage[] = [
  "watch",
  "cue",
  "reward",
  "complete",
];
const PHASES: readonly CampaignPhase[] = [
  "morning",
  "live",
  "review",
  "campaignEnd",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
};

const clampResource = (value: number): number => {
  const finite = Number.isFinite(value) ? value : BALANCE.W3.RESOURCE_MIN;
  return Math.max(
    BALANCE.W3.RESOURCE_MIN,
    Math.min(BALANCE.W3.RESOURCE_MAX, finite),
  );
};

export const createOwnerResources = (): OwnerResources => ({
  ...BALANCE.W3.INITIAL_OWNER_RESOURCES,
});

export const updateOwnerResources = (
  current: OwnerResources,
  delta: Partial<OwnerResources>,
): OwnerResources => ({
  energy: clampResource(current.energy + (delta.energy ?? 0)),
  focus: clampResource(current.focus + (delta.focus ?? 0)),
  workScore: clampResource(current.workScore + (delta.workScore ?? 0)),
});

export const createCampaignSettings = (seed: number): CampaignSettings => ({
  version: 2,
  seed,
  speed: 1,
  infinite: false,
  interruptedScheduleIds: [],
  daySchedule: [],
  morningSnapshot: null,
  filteredObservations: [],
  daySummaries: [],
  training: null,
});

export const recommendedTrainingGoal = (day: number): TrainingGoalId =>
  TRAINING_GOALS[(Math.max(1, Math.floor(day)) - 1) % TRAINING_GOALS.length];

export const createTrainingProgress = (
  day: number,
  goal: TrainingGoalId,
): TrainingProgress => ({
  day,
  goal,
  stage: "watch",
  completed: 0,
  target: 3,
  attempts: 0,
  streak: 0,
  lastCueAt: null,
  feedback: "몸짓 신호가 나타날 때까지 관찰해 보세요.",
});

const deterministicOffset = (seed: number, day: number): number => {
  const mixed = ((seed >>> 0) ^ Math.imul(day, 2654435761)) >>> 0;
  return (mixed % 3) * 15;
};

const focusItem = (
  day: number,
  index: number,
  title: string,
  startMinute: number,
  endMinute: number,
): CampaignScheduleItem => ({
  id: `day-${day}-focus-${index}`,
  title,
  startMinute,
  endMinute,
  focusLock: true,
  away: false,
});

const clampMeetingStart = (minute: number): number =>
  Math.max(
    BALANCE.TIME.DAY_START,
    Math.min(BALANCE.TIME.DAY_END - 60, Math.round(minute)),
  );

const predictionMinute = (absoluteMinute: number, day: number): number => {
  const dayOffset = (day - 1) * BALANCE.TIME.DAY_LENGTH;
  return Math.max(
    BALANCE.TIME.DAY_START,
    Math.min(BALANCE.TIME.DAY_END, absoluteMinute - dayOffset),
  );
};

export const generateDaySchedule = (
  day: number,
  seed: number,
  prediction: { start: number; end: number },
  infinite = false,
): CampaignScheduleItem[] => {
  if (infinite || day > 7) return [];
  const offset = deterministicOffset(seed, day);
  if (day === 4) {
    const start = predictionMinute(prediction.start, day);
    const end = predictionMinute(prediction.end, day);
    const anchor = Math.round((Math.min(start, end) + Math.max(start, end)) / 2);
    const firstStart = clampMeetingStart(anchor - 45);
    const secondStart = clampMeetingStart(anchor - 15);
    return [
      focusItem(day, 1, "팀 회의", firstStart, firstStart + 60),
      focusItem(day, 2, "프로젝트 회의", secondStart, secondStart + 60),
    ];
  }
  if (day === 7) {
    return [{
      id: "day-7-away",
      title: "보호자 외출",
      startMinute: 12 * 60,
      endMinute: 15 * 60,
      focusLock: false,
      away: true,
    }];
  }
  if (day === 6) return [];
  const titles: Record<number, string> = {
    1: "관찰 기록 정리",
    2: "집중 업무",
    3: "훈련 기록 정리",
    5: "추리 노트 정리",
  };
  const start = 10 * 60 + offset;
  return [focusItem(day, 1, titles[day] ?? "집중 업무", start, start + 60)];
};

export const curriculumTip = (day: number, infinite = false): string | null => {
  if (infinite || day > 7) return null;
  if (day === 2) return "빠른 제지는 어떤 학습을 남길까요?";
  if (day === 3) {
    return "매트로 이동한 뒤 90초 안에 보상하면 그 행동과 보상 타이밍을 연결하기 쉬워요.";
  }
  if (day === 7) return "정오부터 오후 세 시까지는 보호자 없이 스스로 선택합니다.";
  return null;
};

const isOwnerResources = (value: unknown): value is OwnerResources =>
  isRecord(value) && hasExactKeys(value, ["energy", "focus", "workScore"]) &&
  Object.values(value).every((entry) =>
    typeof entry === "number" && Number.isFinite(entry) &&
    entry >= BALANCE.W3.RESOURCE_MIN && entry <= BALANCE.W3.RESOURCE_MAX
  );

const SETTINGS_V1_KEYS = [
  "version",
  "seed",
  "speed",
  "infinite",
  "interruptedScheduleIds",
  "daySchedule",
  "morningSnapshot",
  "filteredObservations",
  "daySummaries",
] as const;

const SETTINGS_V2_KEYS = [...SETTINGS_V1_KEYS, "training"] as const;

const isTrainingProgress = (value: unknown): value is TrainingProgress =>
  isRecord(value) &&
  hasExactKeys(value, [
    "day",
    "goal",
    "stage",
    "completed",
    "target",
    "attempts",
    "streak",
    "lastCueAt",
    "feedback",
  ]) &&
  Number.isInteger(value.day) && (value.day as number) >= 1 &&
  typeof value.goal === "string" &&
  TRAINING_GOALS.includes(value.goal as TrainingGoalId) &&
  typeof value.stage === "string" &&
  TRAINING_STAGES.includes(value.stage as TrainingStage) &&
  Number.isInteger(value.completed) && (value.completed as number) >= 0 &&
  Number.isInteger(value.target) && (value.target as number) >= 1 &&
  (value.completed as number) <= (value.target as number) &&
  Number.isInteger(value.attempts) && (value.attempts as number) >= 0 &&
  Number.isInteger(value.streak) && (value.streak as number) >= 0 &&
  (value.streak as number) <= (value.attempts as number) &&
  (value.lastCueAt === null ||
    (typeof value.lastCueAt === "number" &&
      Number.isInteger(value.lastCueAt) && value.lastCueAt >= 0)) &&
  ((value.stage === "reward") === (value.lastCueAt !== null)) &&
  ((value.stage === "complete") ===
    ((value.completed as number) === (value.target as number))) &&
  typeof value.feedback === "string";

const hasValidSettingsFields = (value: Record<string, unknown>): boolean =>
  typeof value.seed === "number" &&
  Number.isFinite(value.seed) && [0, 1, 2, 4].includes(value.speed as number) &&
  typeof value.infinite === "boolean" &&
  Array.isArray(value.interruptedScheduleIds) &&
  value.interruptedScheduleIds.every((id) => typeof id === "string") &&
  Array.isArray(value.daySchedule) && value.daySchedule.every((item) =>
    isRecord(item) &&
    hasExactKeys(item, [
      "id",
      "title",
      "startMinute",
      "endMinute",
      "focusLock",
      "away",
    ]) &&
    typeof item.id === "string" && typeof item.title === "string" &&
    Number.isInteger(item.startMinute) && Number.isInteger(item.endMinute) &&
    (item.startMinute as number) >= BALANCE.TIME.DAY_START &&
    (item.endMinute as number) <= BALANCE.TIME.DAY_END &&
    (item.startMinute as number) < (item.endMinute as number) &&
    typeof item.focusLock === "boolean" && typeof item.away === "boolean"
  ) &&
  (value.morningSnapshot === null || isRecord(value.morningSnapshot)) &&
  Array.isArray(value.filteredObservations) &&
  value.filteredObservations.every((item) =>
    isRecord(item) && hasExactKeys(item, ["time", "sentence"]) &&
    typeof item.time === "string" && typeof item.sentence === "string"
  ) &&
  Array.isArray(value.daySummaries) && value.daySummaries.every((summary) =>
    isRecord(summary) &&
    hasExactKeys(summary, ["day", "atePoop", "movedToMat", "trustDirection"]) &&
    Number.isInteger(summary.day) && (summary.day as number) >= 1 &&
    typeof summary.atePoop === "boolean" &&
    typeof summary.movedToMat === "boolean" &&
    ["up", "steady", "down"].includes(summary.trustDirection as string)
  );

const isSettingsV1 = (value: unknown): value is CampaignSettingsV1 =>
  isRecord(value) &&
  hasExactKeys(value, SETTINGS_V1_KEYS) &&
  value.version === 1 &&
  hasValidSettingsFields(value);

const isSettings = (value: unknown): value is CampaignSettings =>
  isRecord(value) &&
  hasExactKeys(value, SETTINGS_V2_KEYS) &&
  value.version === 2 &&
  hasValidSettingsFields(value) &&
  (value.training === null || isTrainingProgress(value.training));

const hasValidProfileFields = (value: Record<string, unknown>): boolean =>
  Number.isInteger(value.day) && (value.day as number) >= 1 &&
  typeof value.phase === "string" &&
  PHASES.includes(value.phase as CampaignPhase) &&
  isRecord(value.simSnapshot) &&
  isOwnerResources(value.ownerResources) &&
  Array.isArray(value.hypotheses) &&
  value.hypotheses.every((item) =>
    typeof item === "string" && HYPOTHESES.includes(item as Hypothesis)
  );

const isProfile = (value: unknown): value is WaitdogProfile =>
  isRecord(value) &&
  hasExactKeys(value, [
    "day",
    "phase",
    "simSnapshot",
    "ownerResources",
    "hypotheses",
    "settings",
  ]) &&
  hasValidProfileFields(value) &&
  isSettings(value.settings);

const isProfileV1 = (
  value: unknown,
): value is Omit<WaitdogProfile, "settings"> & { settings: CampaignSettingsV1 } =>
  isRecord(value) &&
  hasExactKeys(value, [
    "day",
    "phase",
    "simSnapshot",
    "ownerResources",
    "hypotheses",
    "settings",
  ]) &&
  hasValidProfileFields(value) &&
  isSettingsV1(value.settings);

export const loadProfile = (storage: StorageAdapter): LoadProfileResult => {
  try {
    const stored = storage.getItem(WAITDOG_PROFILE_KEY);
    if (stored === null) return { ok: true, profile: null };
    const parsed: unknown = JSON.parse(stored);
    if (isProfile(parsed)) return { ok: true, profile: parsed };
    if (isProfileV1(parsed)) {
      return {
        ok: true,
        profile: {
          ...parsed,
          settings: {
            ...parsed.settings,
            version: 2,
            training: null,
          },
        },
      };
    }
    return { ok: false, error: "저장된 프로필 형식이 올바르지 않습니다." };
  } catch {
    return { ok: false, error: "저장된 프로필을 불러오지 못했습니다." };
  }
};

export const saveProfile = (
  storage: StorageAdapter,
  profile: WaitdogProfile,
): SaveProfileResult => {
  try {
    storage.setItem(WAITDOG_PROFILE_KEY, JSON.stringify(profile));
    return { ok: true };
  } catch {
    return { ok: false, error: "현재 진행을 저장하지 못했습니다." };
  }
};
