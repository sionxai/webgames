export type StatKey = "health" | "intelligence" | "focus" | "immunity" | "eq" | "willpower";

export type Stats = Record<StatKey, number>;

export type ActionId = "study" | "reading" | "exercise" | "meditation" | "work" | "rest" | "sleep";

export type QuestUnlock =
  | null
  | { type: "questComplete"; questId: string; count: number }
  | { type: "statRequirement"; stat: StatKey; value: number }
  | { type: "level"; value: number };

export type QuestCondition =
  | { type: "streak"; consecutiveDays: number }
  | { type: "dailyMinimum"; daysRequired: number; minimumMinutes: number }
  | { type: "timeRange"; start: string; end: string };

export type QuestTarget =
  | { kind: "single"; category: ActionId; minutes: number }
  | { kind: "multi"; requirements: Partial<Record<ActionId, number>> };

export type QuestReward = Partial<Record<StatKey | "money", number>>;

export type QuestDefinition = {
  id: string;
  type: "daily" | "weekly" | "milestone" | "chain";
  tier: number;
  difficulty: number;
  label: string;
  description: string;
  target: QuestTarget;
  targetMinutes: number;
  reward: QuestReward;
  unlockCondition: QuestUnlock;
  flavorText?: string;
  rarity?: string;
  conditions?: QuestCondition[];
};

export type IndustryId = "office" | "dev" | "sales" | "logistics" | "fitness" | "pro";

export type CompanyTierId = "sme" | "mid" | "enterprise" | "global";

export type PositionId = "entry" | "junior" | "assistant" | "manager" | "deputy" | "senior" | "director" | "executive" | "ceo";

export type PartTimeJobId = "convenience" | "restaurant" | "cleaning" | "delivery_rent" | "delivery_bike" | "delivery_own" | "moving" | "tutor_part";

export type WorkType = "physical" | "mental" | "light";

export type RemoteTimerLock = {
  owner: string;
  category: ActionId;
  startedAt: number;
  lastHeartbeat: number;
  speed: number;
};

export type CareerState = {
  industry: IndustryId;
  company: CompanyTierId;
  position: PositionId;
};

export type TimerState = {
  active: boolean;
  category: ActionId | null;
  startTime: number | null;
  elapsed: number;
};

export type LogEntry = {
  id: string;
  category: string;
  duration: number;
  timestamp: string;
  gains: Partial<Record<StatKey, number>>;
  money?: number;
  changes?: Partial<Record<StatKey | "money", number>>;
  source?: string;
  meta?: Record<string, unknown>;
  label?: string;
};

export type ModalState = {
  title: string;
  message: string;
  onConfirm?: (() => void) | null;
};

export type GapData = {
  minutes: number;
};

export type Profile = {
  nickname: string;
  age: number | null;
  gender: "male" | "female" | "other" | "";
};
