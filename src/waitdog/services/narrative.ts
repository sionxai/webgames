import { BALANCE } from "../constants/balance";
import type { DecisionTrace, EventLog } from "../types";
import type { QualitativeDaySummary } from "./campaign";
import type { WaitdogSnapshot } from "./waitdogSim";

export interface NarrativeTimelineItem {
  time: string;
  sentence: string;
}

export interface DayNarrative {
  timeline: NarrativeTimelineItem[];
  learning: string[];
  summary: QualitativeDaySummary;
}

const ACTION_SENTENCES: Record<string, string> = {
  eatPoop: "바닥의 흔적에 빠르게 다가갔습니다.",
  moveToMat: "스스로 매트 쪽으로 자리를 옮겼습니다.",
  watchOwner: "보호자의 움직임을 유심히 살폈습니다.",
  flee: "몸을 낮추고 보호자와 거리를 벌렸습니다.",
  sniffLeave: "냄새를 확인한 뒤 다른 곳으로 향했습니다.",
  zoomies: "갑자기 신이 나서 방을 달렸습니다.",
};

const formatTime = (absoluteMinute: number): string => {
  const minuteOfDay = absoluteMinute % BALANCE.TIME.DAY_LENGTH;
  const hour = Math.floor(minuteOfDay / BALANCE.NUMBER.SIXTY);
  const minute = minuteOfDay % BALANCE.NUMBER.SIXTY;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const sentenceForSeenEvent = (event: EventLog): string => {
  switch (event.type) {
    case "dayStart":
      return "새 아침, 강아지가 집 안을 둘러봤습니다.";
    case "feed":
      return "밥그릇을 반갑게 확인했습니다.";
    case "water":
      return "물그릇에서 차분히 물을 마셨습니다.";
    case "walk":
      return "산책을 다녀와 발걸음이 한결 가벼워졌습니다.";
    case "play":
      return "놀이에 푹 빠져 즐거워 보였습니다.";
    case "ownerState":
      return "보호자의 움직임을 따라 주변을 살폈습니다.";
    case "sniffFloor":
      return "바닥 냄새를 자주 확인했습니다.";
    case "circle":
      return "한자리에서 천천히 빙글빙글 돌았습니다.";
    case "wander":
      return "편한 자리를 찾듯 방 안을 서성였습니다.";
    case "poop":
      return "바닥에 작은 흔적이 생겼습니다.";
    case "poopApproach":
      return "바닥의 흔적을 신경 쓰며 가까이 갔습니다.";
    case "eatPoop":
      return "바닥의 흔적이 금세 사라졌습니다.";
    case "cleanupComplete":
      return "청소를 마쳐 바닥이 다시 말끔해졌습니다.";
    case "digestionComplete":
      return "배가 움직이는 듯 잠시 자세를 고쳐 앉았습니다.";
    case "intervention":
      return "보호자의 개입에 반응을 보였습니다.";
    case "action": {
      const action = typeof event.detail.action === "string"
        ? event.detail.action
        : "";
      return ACTION_SENTENCES[action] ?? "강아지가 조용히 움직였습니다.";
    }
    case "decision":
      return "잠깐 멈춰 다음 행동을 고르는 듯했습니다.";
    default:
      return "강아지가 주변의 변화를 살폈습니다.";
  }
};

const eventsForDay = (snapshot: WaitdogSnapshot): EventLog[] => {
  const start = (snapshot.day - BALANCE.NUMBER.ONE) * BALANCE.TIME.DAY_LENGTH +
    BALANCE.TIME.DAY_START;
  const end = (snapshot.day - BALANCE.NUMBER.ONE) * BALANCE.TIME.DAY_LENGTH +
    BALANCE.TIME.DAY_END;
  return snapshot.log.filter((event) => event.t >= start && event.t <= end);
};

const visibleEventsForDay = (snapshot: WaitdogSnapshot): EventLog[] =>
  eventsForDay(snapshot).filter((event) => event.visibility !== "hidden");

export const filteredTimeline = (
  snapshot: WaitdogSnapshot,
): NarrativeTimelineItem[] =>
  visibleEventsForDay(snapshot).map((event) => ({
    time: formatTime(event.t),
    sentence: event.visibility === "heard"
      ? "어딘가에서 작은 소리가 들렸습니다."
      : sentenceForSeenEvent(event),
  }));

const selectedActions = (snapshot: WaitdogSnapshot): string[] =>
  eventsForDay(snapshot)
    .filter((event) => event.type === "decision")
    .map((event) => (event.detail as unknown as DecisionTrace).selected);

const learningSentences = (
  morning: WaitdogSnapshot,
  evening: WaitdogSnapshot,
): string[] => {
  const sentences: string[] = [];
  const decisions = selectedActions(evening);
  if (decisions.includes("moveToMat")) {
    sentences.push("배변 뒤 매트로 이동하는 선택이 조금 더 익숙해졌습니다.");
  } else if (decisions.includes("eatPoop")) {
    sentences.push("배변 뒤 흔적을 서둘러 확인하는 경향이 이어졌습니다.");
  } else {
    sentences.push("배변 뒤 보호자의 반응을 살피며 다음 행동을 고르는 경향을 보였습니다.");
  }

  const trustBefore = morning.memory.approachSafety + morning.memory.recallTrust;
  const trustAfter = evening.memory.approachSafety + evening.memory.recallTrust;
  if (trustAfter > trustBefore) {
    sentences.push("차분한 상호작용 뒤 보호자에게 다가오는 선택이 편안해졌습니다.");
  } else if (trustAfter < trustBefore) {
    sentences.push("강한 반응 뒤 보호자가 다가올 때 긴장하는 경향이 늘었습니다.");
  } else {
    sentences.push("보호자에게 다가가는 편안함은 오늘 크게 흔들리지 않았습니다.");
  }

  if (evening.memory.matExpectation > morning.memory.matExpectation) {
    sentences.push("매트에서 받은 긍정적인 경험을 다음 선택과 연결하기 시작했습니다.");
  }
  if (evening.memory.coproHabit > morning.memory.coproHabit) {
    sentences.push("바닥의 흔적을 다시 확인하려는 습관이 조금 강해졌습니다.");
  } else if (evening.memory.coproHabit < morning.memory.coproHabit) {
    sentences.push("바닥의 흔적보다 다른 행동을 택하는 경험이 쌓였습니다.");
  }
  return sentences.slice(0, 4);
};

export const buildDayNarrative = (
  morning: WaitdogSnapshot,
  evening: WaitdogSnapshot,
): DayNarrative => {
  const events = eventsForDay(evening);
  const trustBefore = morning.memory.approachSafety + morning.memory.recallTrust;
  const trustAfter = evening.memory.approachSafety + evening.memory.recallTrust;
  return {
    timeline: filteredTimeline(evening),
    learning: learningSentences(morning, evening),
    summary: {
      day: evening.day,
      atePoop: events.some((event) => event.type === "eatPoop"),
      movedToMat: events.some((event) =>
        event.type === "action" && event.detail.action === "moveToMat"
      ),
      trustDirection: trustAfter > trustBefore
        ? "up"
        : trustAfter < trustBefore
          ? "down"
          : "steady",
    },
  };
};

export const buildCampaignOutcomes = (
  summaries: readonly QualitativeDaySummary[],
): [string, string, string] => {
  const midpoint = Math.max(1, Math.floor(summaries.length / 2));
  const earlyDays = summaries.slice(0, midpoint);
  const lateDays = summaries.slice(midpoint);
  const earlyRate = earlyDays.filter((day) => day.atePoop).length /
    earlyDays.length;
  const lateRate = lateDays.length === 0
    ? earlyRate
    : lateDays.filter((day) => day.atePoop).length / lateDays.length;
  const eating = lateRate < earlyRate
    ? "캠페인 후반에는 바닥의 흔적을 먹는 일이 초반보다 잦아들었습니다."
    : lateRate > earlyRate
      ? "캠페인 후반에는 바닥의 흔적을 서둘러 먹는 경향이 더 두드러졌습니다."
      : "바닥의 흔적을 먹는 경향은 캠페인 동안 비슷한 흐름을 보였습니다.";
  const mat = summaries.some((day) => day.movedToMat)
    ? "배변 뒤 스스로 매트로 이동하는 선택을 만들어 냈습니다."
    : "매트로 이동하는 선택은 아직 안정적으로 나타나지 않았습니다.";
  const trust = summaries.filter((day) => day.trustDirection === "up").length -
      summaries.filter((day) => day.trustDirection === "down").length > 0
    ? "보호자를 향한 신뢰는 전반적으로 편안한 방향으로 자랐습니다."
    : summaries.filter((day) => day.trustDirection === "down").length >
        summaries.filter((day) => day.trustDirection === "up").length
      ? "보호자를 마주할 때의 긴장이 남아 있어 차분한 회복 경험이 필요합니다."
      : "보호자를 향한 신뢰는 큰 흔들림 없이 유지되었습니다.";
  return [eating, mat, trust];
};
