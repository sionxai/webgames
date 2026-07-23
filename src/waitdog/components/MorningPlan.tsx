import type {
  CampaignScheduleItem,
  TrainingGoalId,
} from "../services/campaign";

interface MorningPlanProps {
  day: number;
  schedule: readonly CampaignScheduleItem[];
  prediction: { start: number; end: number; confidence: number };
  tip: string | null;
  selectedGoal: TrainingGoalId;
  recommendedGoal: TrainingGoalId;
  onGoalChange: (goal: TrainingGoalId) => void;
  onStart: () => void;
}

const TRAINING_GOALS: ReadonlyArray<{
  id: TrainingGoalId;
  title: string;
  description: string;
}> = [
  {
    id: "mat",
    title: "매트 습관",
    description: "신호 뒤 매트로 이동하면 바로 보상해 좋은 선택을 연결합니다.",
  },
  {
    id: "recall",
    title: "부르기 신뢰",
    description: "차분히 불러 돌아온 뒤 1게임분 안에 간식으로 신뢰를 쌓습니다.",
  },
  {
    id: "calm",
    title: "침착 전환",
    description: "흥분 신호를 보고 장난감으로 시선을 안전하게 돌립니다.",
  },
];

const formatClock = (absoluteMinute: number): string => {
  const minuteOfDay = ((absoluteMinute % 1440) + 1440) % 1440;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const confidenceLabel = (confidence: number): string => {
  if (confidence >= 70) return "높음";
  if (confidence >= 40) return "보통";
  return "낮음";
};

export function MorningPlan({
  day,
  schedule,
  prediction,
  tip,
  selectedGoal,
  recommendedGoal,
  onGoalChange,
  onStart,
}: MorningPlanProps) {
  return (
    <main className="waitdog-page phase-page">
      <section className="phase-card morning-card" aria-labelledby="morning-title">
        <span className="section-kicker">MORNING PLAN</span>
        <h1 id="morning-title">Day {day} 아침 계획</h1>
        <p className="phase-lead">시간은 멈춰 있습니다. 오늘의 흐름을 먼저 살펴보세요.</p>

        <fieldset className="training-goal-picker">
          <legend>오늘의 짧은 훈련 목표</legend>
          <p>한 번에 한 가지를 연습해 타이밍과 결과를 분명하게 확인하세요.</p>
          <div>
            {TRAINING_GOALS.map((goal) => (
              <button
                className={selectedGoal === goal.id ? "is-selected" : ""}
                type="button"
                key={goal.id}
                aria-pressed={selectedGoal === goal.id}
                onClick={() => onGoalChange(goal.id)}
              >
                <strong>{goal.title}</strong>
                {recommendedGoal === goal.id && <span>오늘 추천</span>}
                <small>{goal.description}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="morning-grid">
          <section aria-labelledby="schedule-title">
            <h2 id="schedule-title">오늘 일정</h2>
            {schedule.length > 0 ? (
              <ol className="schedule-list">
                {schedule.map((item) => (
                  <li key={item.id}>
                    <time>{formatClock(item.startMinute)}–{formatClock(item.endMinute)}</time>
                    <strong>{item.title}</strong>
                    <span>{item.away ? "개입 불가" : item.focusLock ? "집중 업무" : "일정"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-note">정해진 일정 없이 자유롭게 운영하는 날입니다.</p>
            )}
          </section>

          <section className="prediction-card" aria-labelledby="prediction-title">
            <span className="section-kicker">과거 기록 기반</span>
            <h2 id="prediction-title">예상 배변 창</h2>
            <p className="prediction-time">
              {formatClock(prediction.start)}–{formatClock(prediction.end)}
            </p>
            <p>예측 신뢰도 · {confidenceLabel(prediction.confidence)}</p>
          </section>
        </div>

        {tip && <aside className="curriculum-tip" aria-label="오늘의 팁">{tip}</aside>}
        <button className="primary-action" type="button" onClick={onStart}>하루 시작</button>
      </section>
    </main>
  );
}
