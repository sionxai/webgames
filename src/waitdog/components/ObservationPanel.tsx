import type { WaitdogUiEvent, WaitdogUiView } from "../services/waitdogSim";
import type { DogActivityId } from "../types";

interface ObservationPanelProps {
  view: WaitdogUiView;
  interventionMessages: ReadonlyArray<{ id: number; text: string }>;
}

const ACTION_SENTENCES: Record<string, string> = {
  eatPoop: "바닥의 흔적에 빠르게 다가갑니다.",
  moveToMat: "매트 쪽으로 자리를 옮깁니다.",
  watchOwner: "보호자의 움직임을 유심히 살핍니다.",
  flee: "몸을 낮추고 거리를 벌립니다.",
  sniffLeave: "냄새를 확인한 뒤 다른 곳으로 향합니다.",
  zoomies: "갑자기 신이 나서 방을 달립니다.",
};

const ACTIVITY_SENTENCES: Record<DogActivityId, string> = {
  idle: "강아지가 잠시 멈춰 주변을 살핍니다.",
  rest: "강아지가 편한 자리에서 몸을 쉬고 있습니다.",
  seekFood: "강아지가 밥그릇 주변을 확인합니다.",
  seekWater: "강아지가 물그릇 쪽으로 향합니다.",
  followOwner: "강아지가 보호자를 따라 움직입니다.",
  play: "강아지가 장난감을 건드리며 놉니다.",
  wander: "강아지가 편한 자리를 찾듯 서성입니다.",
  patrol: "강아지가 방과 방 사이를 둘러봅니다.",
  eatPoop: "강아지가 바닥의 흔적을 향해 서두릅니다.",
  moveToMat: "강아지가 매트를 향해 움직입니다.",
  watchOwner: "강아지가 보호자의 반응을 기다립니다.",
  flee: "강아지가 몸을 낮추고 거리를 벌립니다.",
  sniffLeave: "강아지가 냄새를 확인한 뒤 방향을 바꿉니다.",
  zoomies: "강아지가 흥분해 집 안을 빠르게 달립니다.",
  sniffFloor: "강아지가 바닥 냄새를 집중해서 확인합니다.",
  circle: "강아지가 한자리에서 천천히 빙글빙글 돕니다.",
  poop: "강아지가 배변할 자리를 잡고 있습니다.",
};

const eventToSentence = (event: WaitdogUiEvent): string => {
  switch (event.type) {
    case "sound":
      return "어딘가에서 작은 소리가 들립니다.";
    case "dayStart":
      return "새 아침, 강아지가 집 안을 둘러봅니다.";
    case "feed":
      return "밥그릇을 반갑게 확인합니다.";
    case "water":
      return "물그릇에서 차분히 물을 마십니다.";
    case "walk":
      return "산책을 다녀와 발걸음이 한결 가벼워졌습니다.";
    case "play":
      return "놀이에 푹 빠져 즐거워 보입니다.";
    case "ownerState":
      return "보호자의 위치가 바뀌자 고개를 들어 살핍니다.";
    case "sniffFloor":
      return "바닥 냄새를 자주 확인합니다.";
    case "circle":
      return "한자리에서 천천히 빙글빙글 돕니다.";
    case "wander":
      return "편한 자리를 찾듯 방 안을 서성입니다.";
    case "poop":
      return "바닥에 작은 흔적이 생겼습니다.";
    case "poopApproach":
      return "바닥의 흔적을 신경 쓰며 가까이 갑니다.";
    case "eatPoop":
      return "바닥의 흔적이 금세 사라졌습니다.";
    case "cleanupComplete":
      return "청소를 마쳐 바닥이 다시 말끔합니다.";
    case "digestionComplete":
      return "배가 움직이는 듯 잠시 자세를 고쳐 앉습니다.";
    case "decision":
      return "잠깐 멈춰 다음 행동을 고르는 듯합니다.";
    case "intervention":
      return "보호자의 개입에 반응을 보입니다.";
    case "action": {
      const action = typeof event.detail.action === "string" ? event.detail.action : "";
      return ACTION_SENTENCES[action] ?? "강아지가 조용히 움직입니다.";
    }
    default:
      return "강아지가 주변의 변화를 살핍니다.";
  }
};

export function ObservationPanel({ view, interventionMessages }: ObservationPanelProps) {
  const currentActivity = view.visibility === "seen" &&
      view.spatial.activity !== null
    ? [{
      key: `activity-${view.t}-${view.spatial.activity}`,
      text: ACTIVITY_SENTENCES[view.spatial.activity],
      heard: false,
    }]
    : [];
  const observations = view.recentEvents.slice(-8).map((event, index) => ({
    key: `event-${event.t}-${event.type}-${index}`,
    text: eventToSentence(event),
    heard: event.visibility === "heard",
  }));

  const messages = interventionMessages.slice(-4).map((message) => ({
    key: `intervention-${message.id}`,
    text: message.text,
    heard: false,
  }));

  return (
    <section className="panel-card observation-card" aria-labelledby="observation-title">
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">OBSERVATION</span>
          <h2 id="observation-title">관찰 노트</h2>
        </div>
        <span className={`visibility-pill visibility-${view.visibility}`}>
          {view.visibility === "seen" ? "보임" : view.visibility === "heard" ? "소리" : "미확인"}
        </span>
      </div>
      <ol className="observation-list" aria-live="polite">
        {[...currentActivity, ...observations, ...messages].map((item) => (
          <li className={item.heard ? "heard-note" : ""} key={item.key}>
            <span aria-hidden="true">{item.heard ? "♪" : "•"}</span>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
