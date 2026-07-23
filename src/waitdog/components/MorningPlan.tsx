import type { CampaignScheduleItem } from "../services/campaign";

interface MorningPlanProps {
  day: number;
  schedule: readonly CampaignScheduleItem[];
  prediction: { start: number; end: number; confidence: number };
  tip: string | null;
  onStart: () => void;
}

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
  onStart,
}: MorningPlanProps) {
  return (
    <main className="waitdog-page phase-page">
      <section className="phase-card morning-card" aria-labelledby="morning-title">
        <span className="section-kicker">MORNING PLAN</span>
        <h1 id="morning-title">Day {day} 생활 계획</h1>
        <p className="phase-lead">
          첫 미션은 하루를 시작하자마자 열립니다. 단서를 보고 차분하게 대응해 보세요.
        </p>

        <div className="morning-grid">
          <section aria-labelledby="schedule-title">
            <h2 id="schedule-title">오늘의 생활 리듬</h2>
            {schedule.length > 0 ? (
              <ol className="schedule-list">
                {schedule.map((item) => (
                  <li key={item.id}>
                    <time>{formatClock(item.startMinute)}–{formatClock(item.endMinute)}</time>
                    <strong>{item.title}</strong>
                    <span>{item.away ? "외출" : item.focusLock ? "업무 추천" : "일정"}</span>
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

        <aside className="morning-safety" aria-label="생활 안전 원칙">
          <strong>오늘의 원칙</strong>
          <span>위협 신호에는 거리를 확보하고, 억지 제지나 체벌은 사용하지 않습니다.</span>
        </aside>
        {tip && <aside className="curriculum-tip" aria-label="오늘의 팁">{tip}</aside>}
        <button className="primary-action" type="button" onClick={onStart}>
          하루 시작 · 첫 미션
        </button>
      </section>
    </main>
  );
}
