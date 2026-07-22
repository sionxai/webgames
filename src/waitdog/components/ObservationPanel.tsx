import type { WaitdogUiEvent, WaitdogUiView } from "../services/waitdogSim";

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
        {[...observations, ...messages].map((item) => (
          <li className={item.heard ? "heard-note" : ""} key={item.key}>
            <span aria-hidden="true">{item.heard ? "♪" : "•"}</span>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
