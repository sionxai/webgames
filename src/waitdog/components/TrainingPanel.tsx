import type { TrainingProgress, TrainingStage } from "../services/campaign";
import type { WaitdogUiView } from "../services/waitdogSim";
import type { DogActivityId } from "../types";

interface TrainingPanelProps {
  progress: TrainingProgress;
  view: WaitdogUiView;
  skipping: boolean;
  skipDisabledReason: string | null;
  onSkip: () => void;
}

const GOAL_COPY = {
  mat: {
    title: "매트 습관",
    cue: "‘매트’를 눌러 이동을 확인한 뒤 칭찬이나 간식을 주세요.",
  },
  recall: {
    title: "부르기 신뢰",
    cue: "‘부르기’ 성공 뒤 1게임분 안에 간식을 주세요.",
  },
  calm: {
    title: "침착 전환",
    cue: "흥분 신호를 포착하면 ‘장난감’으로 시선을 돌려 주세요.",
  },
} as const;

const ACTIVITY_SENTENCES: Record<DogActivityId, string> = {
  idle: "잠시 멈춰 주변을 살피고 있습니다.",
  rest: "편한 자리에서 몸을 쉬고 있습니다.",
  seekFood: "밥그릇 주변 냄새를 확인하고 있습니다.",
  seekWater: "물그릇 쪽으로 움직이고 있습니다.",
  followOwner: "보호자를 따라가며 반응을 살핍니다.",
  play: "장난감에 관심을 보이며 놀고 있습니다.",
  wander: "편한 자리를 찾듯 천천히 서성입니다.",
  patrol: "방과 방 사이를 둘러보고 있습니다.",
  eatPoop: "바닥의 흔적을 향해 빠르게 접근합니다.",
  moveToMat: "매트 쪽으로 이동하고 있습니다.",
  watchOwner: "보호자의 다음 반응을 기다립니다.",
  flee: "몸을 낮추고 보호자와 거리를 벌립니다.",
  sniffLeave: "냄새를 확인한 뒤 다른 곳으로 시선을 돌립니다.",
  zoomies: "흥분해 집 안을 빠르게 달립니다.",
  sniffFloor: "바닥 냄새를 집중해서 확인합니다.",
  circle: "한자리에서 천천히 빙글빙글 돕니다.",
  poop: "배변할 자리를 잡고 있습니다.",
};

const STAGES: ReadonlyArray<{ id: Exclude<TrainingStage, "complete">; label: string }> = [
  { id: "watch", label: "신호 보기" },
  { id: "cue", label: "명령" },
  { id: "reward", label: "정확한 보상" },
];

const stageIndex = (stage: TrainingStage): number =>
  stage === "complete" ? STAGES.length : STAGES.findIndex((item) => item.id === stage);

const activitySentence = (view: WaitdogUiView): string => {
  if (view.visibility === "heard") return "강아지는 보이지 않고 작은 움직임만 들립니다.";
  if (view.visibility === "hidden" || view.spatial.activity === null) {
    return "현재 강아지의 몸짓을 확인할 수 없습니다.";
  }
  return ACTIVITY_SENTENCES[view.spatial.activity];
};

export function TrainingPanel({
  progress,
  view,
  skipping,
  skipDisabledReason,
  onSkip,
}: TrainingPanelProps) {
  const goal = GOAL_COPY[progress.goal];
  const currentStage = stageIndex(progress.stage);
  const skipDisabled = skipping || skipDisabledReason !== null;

  return (
    <section className="panel-card training-card" aria-labelledby="training-title">
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">TODAY&apos;S TRAINING</span>
          <h2 id="training-title">{goal.title}</h2>
        </div>
        <strong className="training-count">
          {progress.completed}/{progress.target}
        </strong>
      </div>

      <p className="dog-activity" role="status">{activitySentence(view)}</p>
      <p className="training-cue">{goal.cue}</p>

      <ol className="training-steps" aria-label="훈련 단계">
        {STAGES.map((item, index) => (
          <li
            className={index < currentStage
              ? "is-done"
              : index === currentStage
                ? "is-current"
                : ""}
            key={item.id}
          >
            <span>{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>

      <div className="training-stats">
        <span>연속 성공 <strong>{progress.streak}</strong></span>
        <span>시도 <strong>{progress.attempts}</strong></span>
      </div>

      <p className="training-feedback" aria-live="polite">{progress.feedback}</p>
      <button
        className="skip-opportunity"
        type="button"
        disabled={skipDisabled}
        title={skipDisabledReason ?? undefined}
        onClick={onSkip}
      >
        {skipping ? "훈련 기회 찾는 중…" : "다음 훈련 기회까지"}
      </button>
      {skipDisabledReason && <p className="control-reason">{skipDisabledReason}</p>}
    </section>
  );
}
