import { BALANCE } from "../constants/balance";
import type {
  ActiveEncounter,
  DogStatKey,
  EncounterChoice,
  EncounterCueKind,
  EncounterDirectorState,
  EncounterId,
  EncounterPublicView,
  EncounterSafetyLevel,
  Inventory,
  LearningMemory,
  MemoryKey,
  RoomId,
} from "../types";

interface EncounterCause {
  id: string;
  label: string;
  cues: readonly string[];
  correctResponseId: string;
}

interface EncounterResponse extends EncounterChoice {
  safe: boolean;
}

export interface EncounterDefinition {
  id: EncounterId;
  title: string;
  cueKind: EncounterCueKind;
  cueLabel: string;
  cueRoom: RoomId;
  cueAnchor: { x: number; y: number } | null;
  causes: readonly [EncounterCause, EncounterCause, EncounterCause];
  responses: readonly [
    EncounterResponse,
    EncounterResponse,
    EncounterResponse,
  ];
  reinforcement: "praise" | "treat" | null;
  safetyLevel: EncounterSafetyLevel;
  safetyBanner: string | null;
  hint: string;
  successMessage: string;
  safetyMessage: string | null;
  score: number;
  carePoints: number;
  successDelta: {
    stats: Partial<Record<DogStatKey, number>>;
    memory: Partial<Record<MemoryKey, number>>;
  };
}

export interface EncounterTransition {
  ok: boolean;
  reason: string | null;
  state: EncounterDirectorState;
  completedNow: boolean;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const choice = (id: string, label: string): EncounterChoice => ({ id, label });

export const ENCOUNTER_DEFINITIONS: readonly EncounterDefinition[] = [
  {
    id: "potty",
    title: "배변 전조 읽기",
    cueKind: "potty",
    cueLabel: "바닥을 킁킁거리며 원을 그립니다.",
    cueRoom: "living",
    cueAnchor: { x: 0.7, y: 0.72 },
    causes: [
      {
        id: "potty-needs-pad",
        label: "배변 장소를 찾는 중",
        cues: ["바닥 냄새를 길게 확인합니다.", "짧은 원을 두 번 그립니다."],
        correctResponseId: "potty-guide-pad",
      },
      {
        id: "potty-after-meal",
        label: "식후 배변 신호",
        cues: ["식사 뒤 시간이 지났습니다.", "배변 구역 쪽을 번갈아 봅니다."],
        correctResponseId: "potty-guide-pad",
      },
      {
        id: "potty-restless",
        label: "불편해서 서성이는 중",
        cues: ["자리를 잡지 못하고 서성입니다.", "놀이에는 관심이 적습니다."],
        correctResponseId: "potty-check-calmly",
      },
    ],
    responses: [
      { id: "potty-guide-pad", label: "조용히 패드로 안내하기", safe: true },
      { id: "potty-check-calmly", label: "동선을 열고 차분히 확인하기", safe: true },
      { id: "potty-punish", label: "큰소리로 멈추게 하기", safe: false },
    ],
    reinforcement: "praise",
    safetyLevel: "routine",
    safetyBanner: null,
    hint: "놀이보다 배변 동선과 패드 접근성을 먼저 살펴보세요.",
    successMessage: "신호를 놓치지 않고 배변 구역으로 안전하게 연결했습니다.",
    safetyMessage: null,
    score: 100,
    carePoints: 1,
    successDelta: {
      stats: { stress: -3, comfort: 3 },
      memory: { matExpectation: 2, approachSafety: 1 },
    },
  },
  {
    id: "overexcited",
    title: "과흥분 낮추기",
    cueKind: "overexcited",
    cueLabel: "빠르게 뛰며 장난감을 거칠게 흔듭니다.",
    cueRoom: "living",
    cueAnchor: { x: 0.62, y: 0.58 },
    causes: [
      {
        id: "excited-play",
        label: "놀이 강도가 너무 높음",
        cues: ["움직임이 점점 빨라집니다.", "장난감을 놓지 못합니다."],
        correctResponseId: "excited-pause",
      },
      {
        id: "excited-tired",
        label: "피곤하지만 쉬지 못함",
        cues: ["하품 뒤에도 계속 움직입니다.", "동작이 조금 흐트러집니다."],
        correctResponseId: "excited-rest",
      },
      {
        id: "excited-crowded",
        label: "공간 자극이 많음",
        cues: ["사람과 물건 사이를 빠르게 오갑니다.", "좁은 곳에서 방향을 자주 바꿉니다."],
        correctResponseId: "excited-space",
      },
    ],
    responses: [
      { id: "excited-pause", label: "놀이를 짧게 멈추고 호흡 기다리기", safe: true },
      { id: "excited-rest", label: "조용한 매트로 휴식 유도하기", safe: true },
      { id: "excited-space", label: "주변 자극과 거리를 늘리기", safe: true },
    ],
    reinforcement: "praise",
    safetyLevel: "routine",
    safetyBanner: null,
    hint: "더 놀아주기 전에 피로와 주변 자극을 나눠 관찰하세요.",
    successMessage: "흥분을 키우지 않고 차분한 행동으로 전환했습니다.",
    safetyMessage: null,
    score: 105,
    carePoints: 1,
    successDelta: {
      stats: { excitement: -8, stress: -2 },
      memory: { waitSkill: 2 },
    },
  },
  {
    id: "recall",
    title: "부르기 상황 판단",
    cueKind: "recall",
    cueLabel: "이름을 듣고도 멈춰 주변을 살핍니다.",
    cueRoom: "kitchen",
    cueAnchor: { x: 0.52, y: 0.52 },
    causes: [
      {
        id: "recall-distracted",
        label: "주변 냄새에 집중",
        cues: ["코가 바닥을 향합니다.", "귀만 보호자 쪽으로 움직입니다."],
        correctResponseId: "recall-short",
      },
      {
        id: "recall-uncertain",
        label: "부르기 신호가 불확실함",
        cues: ["한 걸음 다가왔다가 멈춥니다.", "보호자 표정을 오래 봅니다."],
        correctResponseId: "recall-cheerful",
      },
      {
        id: "recall-pressure",
        label: "접근 압박을 느낌",
        cues: ["몸을 낮추고 거리를 둡니다.", "정면 접근을 피합니다."],
        correctResponseId: "recall-space",
      },
    ],
    responses: [
      { id: "recall-short", label: "가까운 거리에서 한 번만 부르기", safe: true },
      { id: "recall-cheerful", label: "밝은 목소리와 열린 자세로 기다리기", safe: true },
      { id: "recall-space", label: "정면을 비켜 압박을 낮추기", safe: true },
    ],
    reinforcement: "treat",
    safetyLevel: "routine",
    safetyBanner: null,
    hint: "귀·코·몸의 방향 중 어디가 가장 강한 단서인지 보세요.",
    successMessage: "강아지가 선택해 다가올 수 있는 부르기 경험을 만들었습니다.",
    safetyMessage: null,
    score: 110,
    carePoints: 1,
    successDelta: {
      stats: { stress: -3 },
      memory: { recallTrust: 3, approachSafety: 1 },
    },
  },
  {
    id: "settle",
    title: "차분히 쉬기",
    cueKind: "settle",
    cueLabel: "매트 주변을 돌지만 눕지 못합니다.",
    cueRoom: "living",
    cueAnchor: { x: 0.24, y: 0.72 },
    causes: [
      {
        id: "settle-tired",
        label: "피곤해서 휴식이 필요함",
        cues: ["하품하고 눈을 천천히 깜빡입니다.", "매트에 앞발을 올립니다."],
        correctResponseId: "settle-mat",
      },
      {
        id: "settle-stimulated",
        label: "소리와 빛 자극이 많음",
        cues: ["작은 소리마다 고개를 듭니다.", "방 밝은 쪽을 반복해 봅니다."],
        correctResponseId: "settle-dim",
      },
      {
        id: "settle-alone",
        label: "혼자 쉬는 것이 아직 어려움",
        cues: ["보호자가 멀어지면 바로 일어납니다.", "매트와 보호자를 번갈아 봅니다."],
        correctResponseId: "settle-near",
      },
    ],
    responses: [
      { id: "settle-mat", label: "매트에서 조용히 기다리기", safe: true },
      { id: "settle-dim", label: "주변 소리와 밝기를 낮추기", safe: true },
      { id: "settle-near", label: "가까이 머물되 말을 줄이기", safe: true },
    ],
    reinforcement: "praise",
    safetyLevel: "routine",
    safetyBanner: null,
    hint: "휴식 실패가 피로인지 환경 자극인지 먼저 구분하세요.",
    successMessage: "강아지가 스스로 쉬는 선택을 이어갈 환경을 만들었습니다.",
    safetyMessage: null,
    score: 105,
    carePoints: 1,
    successDelta: {
      stats: { fatigue: -5, stress: -4, comfort: 3 },
      memory: { matExpectation: 3 },
    },
  },
  {
    id: "alertBark",
    title: "경계 짖음 살피기",
    cueKind: "bark",
    cueLabel: "현관 쪽을 보며 짧게 두 번 짖습니다.",
    cueRoom: "living",
    cueAnchor: { x: 0.9, y: 0.25 },
    causes: [
      {
        id: "bark-hallway",
        label: "복도 소리에 경계",
        cues: ["현관 방향으로 귀를 세웁니다.", "소리가 멎으면 잠시 조용해집니다."],
        correctResponseId: "bark-acknowledge",
      },
      {
        id: "bark-visitor",
        label: "낯선 방문 움직임",
        cues: ["문 가까이에서 몸이 앞으로 쏠립니다.", "보호자와 문을 번갈아 봅니다."],
        correctResponseId: "bark-distance",
      },
      {
        id: "bark-bored",
        label: "반응을 얻기 위한 짖음",
        cues: ["보호자를 보며 한 번 더 짖습니다.", "주변 실제 소리는 들리지 않습니다."],
        correctResponseId: "bark-redirect",
      },
    ],
    responses: [
      { id: "bark-acknowledge", label: "소리를 확인하고 차분히 자리 안내하기", safe: true },
      { id: "bark-distance", label: "문과 거리를 만들고 시야를 가리기", safe: true },
      { id: "bark-redirect", label: "조용해진 순간 냄새 찾기로 전환하기", safe: true },
    ],
    reinforcement: "praise",
    safetyLevel: "caution",
    safetyBanner: "문을 갑자기 열지 말고 먼저 안전거리를 확보하세요.",
    hint: "짖기 직전 강아지가 본 방향과 소리가 멎은 뒤 반응을 비교하세요.",
    successMessage: "경계 신호를 무시하거나 키우지 않고 안전하게 전환했습니다.",
    safetyMessage: null,
    score: 115,
    carePoints: 1,
    successDelta: {
      stats: { stress: -4, excitement: -4 },
      memory: { waitSkill: 2, approachSafety: 1 },
    },
  },
  {
    id: "whine",
    title: "낑낑 소리 추론",
    cueKind: "whine",
    cueLabel: "보호자 곁에서 낮게 낑낑댑니다.",
    cueRoom: "living",
    cueAnchor: null,
    causes: [
      {
        id: "whine-attention",
        label: "관심을 요청",
        cues: ["보호자를 보며 소리를 냅니다.", "조용해지면 가까이 다가옵니다."],
        correctResponseId: "whine-quiet",
      },
      {
        id: "whine-basic",
        label: "물·배변 등 기본 필요",
        cues: ["물그릇과 문 쪽을 번갈아 봅니다.", "한곳에 머물지 못합니다."],
        correctResponseId: "whine-check",
      },
      {
        id: "whine-discomfort",
        label: "불편감 가능성",
        cues: ["평소와 다른 자세를 취합니다.", "놀이 제안에도 반응이 적습니다."],
        correctResponseId: "whine-observe",
      },
    ],
    responses: [
      { id: "whine-quiet", label: "조용한 순간 차분히 관심 주기", safe: true },
      { id: "whine-check", label: "물·배변·휴식 필요부터 확인하기", safe: true },
      { id: "whine-observe", label: "반복 여부를 기록하고 필요 시 병원 문의하기", safe: true },
    ],
    reinforcement: null,
    safetyLevel: "caution",
    safetyBanner: "갑작스럽거나 반복되는 낑낑거림은 상태를 기록하고 전문가에게 확인하세요.",
    hint: "소리가 날 때 강아지의 시선과 평소와 다른 자세를 함께 보세요.",
    successMessage: "소리만으로 단정하지 않고 기본 필요와 불편 가능성을 확인했습니다.",
    safetyMessage: "반복되거나 심해지면 병원에 문의하세요.",
    score: 115,
    carePoints: 1,
    successDelta: {
      stats: { stress: -3, comfort: 2 },
      memory: { approachSafety: 1 },
    },
  },
  {
    id: "anxiety",
    title: "불안 신호 안전하게 다루기",
    cueKind: "anxiety",
    cueLabel: "몸을 떨며 숨을 곳을 찾습니다.",
    cueRoom: "living",
    cueAnchor: { x: 0.18, y: 0.78 },
    causes: [
      {
        id: "anxiety-separation",
        label: "보호자와 거리 불안",
        cues: ["보호자가 움직이면 바로 따라옵니다.", "혼자 남으면 호흡이 빨라집니다."],
        correctResponseId: "anxiety-gradual",
      },
      {
        id: "anxiety-noise",
        label: "갑작스러운 소리 자극",
        cues: ["소리 뒤 몸을 낮춥니다.", "조용한 구석을 찾습니다."],
        correctResponseId: "anxiety-safe-room",
      },
      {
        id: "anxiety-medical",
        label: "평소와 다른 심한 불안",
        cues: ["뚜렷한 자극 없이 불안이 반복됩니다.", "먹기와 쉬기 반응도 달라졌습니다."],
        correctResponseId: "anxiety-consult",
      },
    ],
    responses: [
      { id: "anxiety-gradual", label: "짧은 거리부터 천천히 연습하기", safe: true },
      { id: "anxiety-safe-room", label: "자극을 줄이고 스스로 숨을 공간 열기", safe: true },
      { id: "anxiety-consult", label: "안전을 확보하고 병원·전문가에게 확인하기", safe: true },
    ],
    reinforcement: null,
    safetyLevel: "high",
    safetyBanner: "억지로 끌어내거나 확정 진단하지 말고 안전한 공간을 먼저 확보하세요.",
    hint: "불안 직전의 거리 변화·소리·평소 행동 변화를 따로 기록하세요.",
    successMessage: "불안을 제압하지 않고 자극을 낮추고 확인할 경로를 마련했습니다.",
    safetyMessage: "갑작스럽거나 반복되는 심한 불안은 병원·행동 전문가와 상의하세요.",
    score: 130,
    carePoints: 2,
    successDelta: {
      stats: { stress: -8, comfort: 4 },
      memory: { approachSafety: 3 },
    },
  },
  {
    id: "biteWarning",
    title: "물기 경고에서 거리 확보",
    cueKind: "biteWarning",
    cueLabel: "몸이 굳고 고개를 돌리며 낮게 으르렁댑니다.",
    cueRoom: "kitchen",
    cueAnchor: { x: 0.32, y: 0.3 },
    causes: [
      {
        id: "bite-resource",
        label: "자원 지키기",
        cues: ["물건 위로 몸을 기울입니다.", "손이 가까워지면 몸이 굳습니다."],
        correctResponseId: "bite-trade",
      },
      {
        id: "bite-handling",
        label: "접촉이 두려움",
        cues: ["손길을 피하며 고개를 돌립니다.", "접촉을 멈추면 긴장이 조금 풀립니다."],
        correctResponseId: "bite-stop",
      },
      {
        id: "bite-overwhelmed",
        label: "자극이 한계를 넘음",
        cues: ["여러 자극 뒤 숨을 곳을 찾습니다.", "몸이 굳고 시선을 피합니다."],
        correctResponseId: "bite-stop",
      },
    ],
    responses: [
      { id: "bite-trade", label: "거리를 두고 안전한 교환을 준비하기", safe: true },
      { id: "bite-stop", label: "접촉을 즉시 멈추고 물러나기", safe: true },
      { id: "bite-force", label: "붙잡아 제압하기", safe: false },
    ],
    reinforcement: null,
    safetyLevel: "high",
    safetyBanner: "붙잡거나 벌하지 말고 사람과 강아지 사이의 거리를 먼저 확보하세요.",
    hint: "몸이 굳기 직전 가까워진 손·물건·주변 자극을 확인하세요.",
    successMessage: "경고를 존중하고 접촉을 멈춰 모두의 안전을 확보했습니다.",
    safetyMessage: "물기 경고가 반복되면 안전 관리 후 행동 전문가와 상의하세요.",
    score: 140,
    carePoints: 2,
    successDelta: {
      stats: { stress: -10, excitement: -5 },
      memory: { approachSafety: 4 },
    },
  },
  {
    id: "flee",
    title: "도망 행동 뒤쫓지 않기",
    cueKind: "flee",
    cueLabel: "보호자 반대쪽으로 빠르게 거리를 벌립니다.",
    cueRoom: "toilet",
    cueAnchor: { x: 0.76, y: 0.76 },
    causes: [
      {
        id: "flee-noise",
        label: "큰 소리에 놀람",
        cues: ["소리 직후 몸을 낮춥니다.", "조용한 방 쪽으로 달립니다."],
        correctResponseId: "flee-quiet",
      },
      {
        id: "flee-recall",
        label: "부르기 신뢰가 약함",
        cues: ["이름을 반복할수록 더 멀어집니다.", "거리를 두면 뒤를 돌아봅니다."],
        correctResponseId: "flee-crouch",
      },
      {
        id: "flee-approach",
        label: "빠른 접근이 부담됨",
        cues: ["정면 접근 때 방향을 바꿉니다.", "쫓지 않으면 속도를 늦춥니다."],
        correctResponseId: "flee-stop",
      },
    ],
    responses: [
      { id: "flee-quiet", label: "소리를 줄이고 열린 퇴로 유지하기", safe: true },
      { id: "flee-crouch", label: "몸을 낮추고 한 번만 차분히 부르기", safe: true },
      { id: "flee-stop", label: "뒤쫓지 않고 접근을 멈추기", safe: true },
    ],
    reinforcement: "praise",
    safetyLevel: "caution",
    safetyBanner: "도망가는 강아지를 몰아붙이거나 구석에 가두지 마세요.",
    hint: "도망 직전의 소리와 보호자의 접근 방향을 비교하세요.",
    successMessage: "퇴로를 열고 압박을 낮춰 강아지가 스스로 멈출 수 있었습니다.",
    safetyMessage: null,
    score: 120,
    carePoints: 1,
    successDelta: {
      stats: { stress: -6 },
      memory: { recallTrust: 2, approachSafety: 2 },
    },
  },
];

export const ENCOUNTER_IDS: readonly EncounterId[] =
  ENCOUNTER_DEFINITIONS.map((definition) => definition.id);

export const TUTORIAL_ENCOUNTER_ORDER: readonly EncounterId[] = [
  "potty",
  "alertBark",
  "biteWarning",
];

const GENERAL_ENCOUNTER_ORDER: readonly EncounterId[] = [
  "overexcited",
  "recall",
  "settle",
  "whine",
  "anxiety",
  "flee",
  "potty",
  "alertBark",
  "biteWarning",
];

const definitionFor = (id: EncounterId): EncounterDefinition =>
  ENCOUNTER_DEFINITIONS.find((definition) => definition.id === id)!;

const deterministicIndex = (
  seed: number,
  revision: number,
  length: number,
): number => {
  const mixed = (
    (seed >>> 0) ^
    Math.imul(revision + 1, 0x9e3779b1)
  ) >>> 0;
  return mixed % length;
};

export const createEncounterDirectorState = (): EncounterDirectorState => ({
  active: null,
  lastResult: null,
  nextRevision: 0,
  completedCount: 0,
  tutorialIndex: 0,
  encountersSinceHint: BALANCE.LIFESTYLE.ENCOUNTER.HINT_INTERVAL_ENCOUNTERS,
  lastEncounterUsedHint: false,
});

const startEncounter = (
  current: EncounterDirectorState,
  encounterId: EncounterId,
  seed: number,
): EncounterTransition => {
  const state = clone(current);
  if (state.active !== null) {
    return {
      ok: false,
      reason: "활성 encounter를 먼저 마쳐야 합니다.",
      state,
      completedNow: false,
    };
  }
  const definition = definitionFor(encounterId);
  const revision = state.nextRevision;
  const cause = definition.causes[
    deterministicIndex(seed, revision, definition.causes.length)
  ];
  state.active = {
    instanceId: `${encounterId}:${revision}`,
    encounterId,
    revision,
    stage: "cause",
    publicCues: [...cause.cues],
    causeOptions: definition.causes.map((item) =>
      choice(item.id, item.label)
    ),
    responseOptions: definition.responses.map((item) =>
      choice(item.id, item.label)
    ),
    hiddenCauseId: cause.id,
    selectedCauseId: null,
    selectedResponseId: null,
    requiredReinforcement: definition.reinforcement,
    causeFailures: 0,
    responseFailures: 0,
    reinforcementFailures: 0,
    idleSeconds: 0,
    hintUsed: false,
    hint: null,
    resultApplied: false,
    safetyLevel: definition.safetyLevel,
    safetyBanner: definition.safetyBanner,
    result: null,
  };
  state.nextRevision += 1;
  return { ok: true, reason: null, state, completedNow: false };
};

export const startNextEncounter = (
  current: EncounterDirectorState,
  seed: number,
): EncounterTransition => {
  const encounterId =
    current.tutorialIndex < TUTORIAL_ENCOUNTER_ORDER.length
      ? TUTORIAL_ENCOUNTER_ORDER[current.tutorialIndex]
      : GENERAL_ENCOUNTER_ORDER[
        deterministicIndex(
          seed,
          current.nextRevision,
          GENERAL_ENCOUNTER_ORDER.length,
        )
      ];
  return startEncounter(current, encounterId, seed);
};

export const startEncounterById = (
  current: EncounterDirectorState,
  encounterId: EncounterId,
  seed: number,
): EncounterTransition => startEncounter(current, encounterId, seed);

const failureReason = (unsafe: boolean): string =>
  unsafe
    ? "안전을 위해 이 대응은 실행하지 않았습니다. 거리를 확보하는 선택을 골라 주세요."
    : "공개 단서와 맞지 않습니다. 몸의 방향과 직전 상황을 다시 살펴보세요.";

export const selectEncounterCause = (
  current: EncounterDirectorState,
  choiceId: string,
): EncounterTransition => {
  const state = clone(current);
  const active = state.active;
  if (active === null || active.stage !== "cause") {
    return { ok: false, reason: "원인을 선택할 단계가 아닙니다.", state, completedNow: false };
  }
  if (!active.causeOptions.some((option) => option.id === choiceId)) {
    return { ok: false, reason: "알 수 없는 원인 선택지입니다.", state, completedNow: false };
  }
  if (choiceId !== active.hiddenCauseId) {
    active.causeFailures += 1;
    return {
      ok: false,
      reason: "단서와 다른 원인입니다. 다시 관찰해 보세요.",
      state,
      completedNow: false,
    };
  }
  active.idleSeconds = 0;
  active.selectedCauseId = choiceId;
  active.stage = "response";
  return { ok: true, reason: null, state, completedNow: false };
};

const finishEncounter = (
  state: EncounterDirectorState,
  active: ActiveEncounter,
  messageOverride: string | null = null,
): EncounterTransition => {
  const definition = definitionFor(active.encounterId);
  active.stage = "result";
  active.result = {
    instanceId: active.instanceId,
    encounterId: active.encounterId,
    success: true,
    score: definition.score,
    carePointsAwarded: 0,
    firstReward: false,
    inventoryDelta: {},
    message: messageOverride ?? definition.successMessage,
    safetyMessage: definition.safetyMessage,
  };
  state.lastResult = clone(active.result);
  return { ok: true, reason: null, state, completedNow: true };
};

export const selectEncounterResponse = (
  current: EncounterDirectorState,
  choiceId: string,
): EncounterTransition => {
  const state = clone(current);
  const active = state.active;
  if (active === null || active.stage !== "response") {
    return { ok: false, reason: "대응을 선택할 단계가 아닙니다.", state, completedNow: false };
  }
  const definition = definitionFor(active.encounterId);
  const response = definition.responses.find((item) => item.id === choiceId);
  if (!response) {
    return { ok: false, reason: "알 수 없는 대응 선택지입니다.", state, completedNow: false };
  }
  const cause = definition.causes.find((item) =>
    item.id === active.hiddenCauseId
  )!;
  if (!response.safe || cause.correctResponseId !== choiceId) {
    active.responseFailures += 1;
    return {
      ok: false,
      reason: failureReason(!response.safe),
      state,
      completedNow: false,
    };
  }
  active.idleSeconds = 0;
  active.selectedResponseId = choiceId;
  if (active.requiredReinforcement !== null) {
    active.stage = "reinforcement";
    return { ok: true, reason: null, state, completedNow: false };
  }
  return finishEncounter(state, active);
};

export const selectEncounterReinforcement = (
  current: EncounterDirectorState,
  choiceId: string,
  allowStockFreePraiseFallback = false,
): EncounterTransition => {
  const state = clone(current);
  const active = state.active;
  if (active === null || active.stage !== "reinforcement") {
    return { ok: false, reason: "후속 보상을 선택할 단계가 아닙니다.", state, completedNow: false };
  }
  const stockFreePraiseFallback =
    allowStockFreePraiseFallback &&
    active.requiredReinforcement === "treat" &&
    choiceId === "praise";
  if (choiceId !== active.requiredReinforcement && !stockFreePraiseFallback) {
    active.reinforcementFailures += 1;
    return {
      ok: false,
      reason: "이 상황에는 더 차분하고 정확한 후속 보상이 필요합니다.",
      state,
      completedNow: false,
    };
  }
  active.idleSeconds = 0;
  if (stockFreePraiseFallback) {
    const definition = definitionFor(active.encounterId);
    return finishEncounter(
      state,
      active,
      `간식 재고가 없어 차분한 칭찬으로 안전하게 마무리했습니다. ${definition.successMessage}`,
    );
  }
  return finishEncounter(state, active);
};

export const advanceEncounterInputSeconds = (
  current: EncounterDirectorState,
  seconds: number,
): EncounterTransition => {
  const state = clone(current);
  if (!Number.isInteger(seconds) || seconds < 0) {
    return { ok: false, reason: "입력 대기 시간이 올바르지 않습니다.", state, completedNow: false };
  }
  if (state.active === null || state.active.stage === "result") {
    return { ok: false, reason: "대기 중인 encounter 선택이 없습니다.", state, completedNow: false };
  }
  state.active.idleSeconds += seconds;
  return { ok: true, reason: null, state, completedNow: false };
};

const stageFailures = (active: ActiveEncounter): number => {
  if (active.stage === "cause") return active.causeFailures;
  if (active.stage === "response") return active.responseFailures;
  if (active.stage === "reinforcement") return active.reinforcementFailures;
  return 0;
};

export const requestEncounterHint = (
  current: EncounterDirectorState,
  day: number,
): EncounterTransition => {
  const state = clone(current);
  const active = state.active;
  if (active === null || active.stage === "result") {
    return { ok: false, reason: "힌트를 요청할 encounter가 없습니다.", state, completedNow: false };
  }
  if (day === 7) {
    return { ok: false, reason: "Day 7에는 일반 힌트 없이 관찰합니다.", state, completedNow: false };
  }
  if (active.hintUsed) {
    return { ok: false, reason: "이 encounter의 힌트를 이미 확인했습니다.", state, completedNow: false };
  }
  if (
    state.lastEncounterUsedHint ||
    state.encountersSinceHint <
      BALANCE.LIFESTYLE.ENCOUNTER.HINT_INTERVAL_ENCOUNTERS
  ) {
    return { ok: false, reason: "힌트는 연속으로 제공되지 않습니다.", state, completedNow: false };
  }
  const firstActionGroup = state.completedCount === 0 &&
    active.stage === "cause";
  const repeatedFailure = stageFailures(active) >= 2;
  const idle = active.idleSeconds >=
    BALANCE.LIFESTYLE.ENCOUNTER.HINT_IDLE_SECONDS;
  if (!firstActionGroup && !repeatedFailure && !idle) {
    return { ok: false, reason: "조금 더 관찰한 뒤 힌트를 요청해 보세요.", state, completedNow: false };
  }
  active.hintUsed = true;
  active.hint = definitionFor(active.encounterId).hint;
  state.encountersSinceHint = 0;
  state.lastEncounterUsedHint = true;
  return { ok: true, reason: null, state, completedNow: false };
};

export const markEncounterResultApplied = (
  current: EncounterDirectorState,
  carePointsAwarded: number,
  firstReward: boolean,
  inventoryDelta: Partial<Inventory> = {},
): EncounterDirectorState => {
  const state = clone(current);
  if (
    state.active === null ||
    state.active.stage !== "result" ||
    state.active.result === null ||
    state.active.resultApplied
  ) {
    return state;
  }
  state.active.resultApplied = true;
  state.active.result.carePointsAwarded = carePointsAwarded;
  state.active.result.firstReward = firstReward;
  state.active.result.inventoryDelta = clone(inventoryDelta);
  state.lastResult = clone(state.active.result);
  return state;
};

export const dismissEncounterOutcome = (
  current: EncounterDirectorState,
): EncounterTransition => {
  const state = clone(current);
  const active = state.active;
  if (
    active === null || active.stage !== "result" ||
    active.result === null || !active.resultApplied
  ) {
    return { ok: false, reason: "정산된 encounter 결과가 없습니다.", state, completedNow: false };
  }
  const expectedTutorial =
    TUTORIAL_ENCOUNTER_ORDER[state.tutorialIndex] ?? null;
  if (active.encounterId === expectedTutorial) state.tutorialIndex += 1;
  state.completedCount += 1;
  if (!active.hintUsed) {
    state.encountersSinceHint += 1;
    state.lastEncounterUsedHint = false;
  }
  state.active = null;
  return { ok: true, reason: null, state, completedNow: false };
};

export const encounterOutcomeDelta = (
  encounterId: EncounterId,
): EncounterDefinition["successDelta"] =>
  clone(definitionFor(encounterId).successDelta);

export const encounterCarePoints = (encounterId: EncounterId): number =>
  definitionFor(encounterId).carePoints;

export const getEncounterPublicView = (
  state: EncounterDirectorState,
): EncounterPublicView | null => {
  const active = state.active;
  if (active === null) return null;
  const definition = definitionFor(active.encounterId);
  const tutorialIndex = TUTORIAL_ENCOUNTER_ORDER.indexOf(active.encounterId);
  const tutorial = tutorialIndex >= 0 && tutorialIndex >= state.tutorialIndex;
  const reinforcementChoices = active.requiredReinforcement === null
    ? []
    : [
      choice("praise", "차분히 칭찬하기"),
      choice("treat", "작은 간식으로 보상하기"),
    ];
  const publicStage = active.stage === "result" ? "outcome" : active.stage;
  return {
    id: active.instanceId,
    kind: active.encounterId,
    tutorial,
    stage: publicStage,
    revision: active.revision,
    title: definition.title,
    publicClues: clone(active.publicCues),
    cue: {
      kind: definition.cueKind,
      label: definition.cueLabel,
      room: definition.cueRoom,
      anchor: clone(definition.cueAnchor),
    },
    causeChoices: clone(active.causeOptions),
    responseChoices: clone(active.responseOptions),
    reinforcementChoices,
    selectedCauseId: active.selectedCauseId,
    selectedResponseId: active.selectedResponseId,
    hint: active.hint,
    outcome: clone(active.result),
    instanceId: active.instanceId,
    encounterId: active.encounterId,
    publicCues: clone(active.publicCues),
    causeOptions: clone(active.causeOptions),
    responseOptions: clone(active.responseOptions),
    reinforcementOptions: reinforcementChoices,
    safetyLevel: active.safetyLevel,
    safetyBanner: active.safetyBanner,
    result: clone(active.result),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exact = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
};

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isChoice = (value: unknown): value is EncounterChoice =>
  isRecord(value) && exact(value, ["id", "label"]) &&
  typeof value.id === "string" && typeof value.label === "string";

const INVENTORY_IDS = Object.keys(
  BALANCE.LIFESTYLE.ECONOMY.STARTER_INVENTORY,
);

const isInventoryDelta = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).every((key) => INVENTORY_IDS.includes(key)) &&
  Object.values(value).every((delta) =>
    typeof delta === "number" &&
    Number.isInteger(delta) &&
    Math.abs(delta) <= BALANCE.LIFESTYLE.ECONOMY.MAX_INVENTORY
  );

const isResult = (value: unknown): boolean =>
  isRecord(value) &&
  exact(value, [
    "instanceId",
    "encounterId",
    "success",
    "score",
    "carePointsAwarded",
    "firstReward",
    "inventoryDelta",
    "message",
    "safetyMessage",
  ]) &&
  typeof value.instanceId === "string" &&
  ENCOUNTER_IDS.includes(value.encounterId as EncounterId) &&
  typeof value.success === "boolean" &&
  nonNegativeInteger(value.score) &&
  nonNegativeInteger(value.carePointsAwarded) &&
  typeof value.firstReward === "boolean" &&
  isInventoryDelta(value.inventoryDelta) &&
  typeof value.message === "string" &&
  (value.safetyMessage === null || typeof value.safetyMessage === "string");

const isActiveEncounter = (value: unknown): value is ActiveEncounter => {
  if (
    !isRecord(value) ||
    !exact(value, [
      "instanceId",
      "encounterId",
      "revision",
      "stage",
      "publicCues",
      "causeOptions",
      "responseOptions",
      "hiddenCauseId",
      "selectedCauseId",
      "selectedResponseId",
      "requiredReinforcement",
      "causeFailures",
      "responseFailures",
      "reinforcementFailures",
      "idleSeconds",
      "hintUsed",
      "hint",
      "resultApplied",
      "safetyLevel",
      "safetyBanner",
      "result",
    ]) ||
    typeof value.instanceId !== "string" ||
    !ENCOUNTER_IDS.includes(value.encounterId as EncounterId) ||
    !nonNegativeInteger(value.revision) ||
    !["cause", "response", "reinforcement", "result"].includes(
      value.stage as string,
    ) ||
    !Array.isArray(value.publicCues) ||
    !value.publicCues.every((cue) => typeof cue === "string") ||
    !Array.isArray(value.causeOptions) ||
    value.causeOptions.length !== 3 ||
    !value.causeOptions.every(isChoice) ||
    !Array.isArray(value.responseOptions) ||
    value.responseOptions.length !== 3 ||
    !value.responseOptions.every(isChoice) ||
    typeof value.hiddenCauseId !== "string" ||
    (value.selectedCauseId !== null &&
      typeof value.selectedCauseId !== "string") ||
    (value.selectedResponseId !== null &&
      typeof value.selectedResponseId !== "string") ||
    ![null, "praise", "treat"].includes(
      value.requiredReinforcement as "praise" | "treat" | null,
    ) ||
    !nonNegativeInteger(value.causeFailures) ||
    !nonNegativeInteger(value.responseFailures) ||
    !nonNegativeInteger(value.reinforcementFailures) ||
    !nonNegativeInteger(value.idleSeconds) ||
    typeof value.hintUsed !== "boolean" ||
    (value.hint !== null && typeof value.hint !== "string") ||
    typeof value.resultApplied !== "boolean" ||
    !["routine", "caution", "high"].includes(value.safetyLevel as string) ||
    (value.safetyBanner !== null && typeof value.safetyBanner !== "string") ||
    (value.result !== null && !isResult(value.result))
  ) {
    return false;
  }
  const definition = definitionFor(value.encounterId as EncounterId);
  const hiddenCause = definition.causes.find((cause) =>
    cause.id === value.hiddenCauseId
  );
  const expectedCauseChoices = definition.causes.map(({ id, label }) => ({
    id,
    label,
  }));
  const expectedResponseChoices = definition.responses.map(({ id, label }) => ({
    id,
    label,
  }));
  const stage = value.stage as ActiveEncounter["stage"];
  const selectedCauseIsValid = stage === "cause"
    ? value.selectedCauseId === null
    : value.selectedCauseId === value.hiddenCauseId;
  const expectedResponseId = hiddenCause?.correctResponseId ?? null;
  const selectedResponseIsValid =
    stage === "cause" || stage === "response"
      ? value.selectedResponseId === null
      : value.selectedResponseId === expectedResponseId;
  const result = value.result as Record<string, unknown> | null;
  const resultMatches = result === null ||
    (result.instanceId === value.instanceId &&
      result.encounterId === value.encounterId &&
      result.success === true &&
      result.score === definition.score &&
      ((result.carePointsAwarded === 0 && result.firstReward === false) ||
        (result.carePointsAwarded === definition.carePoints &&
          result.firstReward === true)));
  return hiddenCause !== undefined &&
    JSON.stringify(value.publicCues) === JSON.stringify(hiddenCause.cues) &&
    JSON.stringify(value.causeOptions) ===
      JSON.stringify(expectedCauseChoices) &&
    JSON.stringify(value.responseOptions) ===
      JSON.stringify(expectedResponseChoices) &&
    value.requiredReinforcement === definition.reinforcement &&
    value.safetyLevel === definition.safetyLevel &&
    value.safetyBanner === definition.safetyBanner &&
    selectedCauseIsValid &&
    selectedResponseIsValid &&
    (stage === "result") === (result !== null) &&
    (!value.resultApplied || stage === "result") &&
    resultMatches;
};

export const isEncounterDirectorState = (
  value: unknown,
): value is EncounterDirectorState =>
  isRecord(value) &&
  exact(value, [
    "active",
    "lastResult",
    "nextRevision",
    "completedCount",
    "tutorialIndex",
    "encountersSinceHint",
    "lastEncounterUsedHint",
  ]) &&
  (value.active === null || isActiveEncounter(value.active)) &&
  (value.lastResult === null || isResult(value.lastResult)) &&
  nonNegativeInteger(value.nextRevision) &&
  nonNegativeInteger(value.completedCount) &&
  nonNegativeInteger(value.tutorialIndex) &&
  (value.tutorialIndex as number) <= TUTORIAL_ENCOUNTER_ORDER.length &&
  nonNegativeInteger(value.encountersSinceHint) &&
  typeof value.lastEncounterUsedHint === "boolean" &&
  (value.active === null ||
    (value.active as ActiveEncounter).revision <
      (value.nextRevision as number)) &&
  (value.completedCount as number) <= (value.nextRevision as number);

export type EncounterMemoryDelta = Partial<LearningMemory>;
