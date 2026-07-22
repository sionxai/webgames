import type { Hypothesis } from "../services/campaign";
import type { DayNarrative } from "../services/narrative";

interface DayReviewProps {
  day: number;
  narrative: DayNarrative;
  selectedHypothesis: Hypothesis | null;
  onHypothesis: (hypothesis: Hypothesis) => void;
  onContinue: () => void;
}

const HYPOTHESES: readonly Hypothesis[] = ["배고픔", "관심", "불안"];

export function DayReview({
  day,
  narrative,
  selectedHypothesis,
  onHypothesis,
  onContinue,
}: DayReviewProps) {
  const needsHypothesis = day === 5;
  return (
    <main className="waitdog-page phase-page">
      <section className="phase-card review-card" aria-labelledby="review-title">
        <span className="section-kicker">DAY REVIEW</span>
        <h1 id="review-title">Day {day} 하루 평가</h1>
        <p className="phase-lead">시간은 멈춰 있습니다. 보인 것과 들린 것만 일지에 남겼습니다.</p>

        <div className="review-grid">
          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title">행동일지</h2>
            <ol className="review-timeline">
              {narrative.timeline.map((item, index) => (
                <li key={`${item.time}-${index}`}>
                  <time>{item.time}</time>
                  <p>{item.sentence}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="learning-title">
            <h2 id="learning-title">학습 변화 요약</h2>
            <ul className="learning-list">
              {narrative.learning.map((sentence) => <li key={sentence}>{sentence}</li>)}
            </ul>

            {needsHypothesis && (
              <fieldset className="hypothesis-fieldset">
                <legend>오늘 행동의 가장 큰 이유는 무엇이었을까요?</legend>
                <div className="hypothesis-options">
                  {HYPOTHESES.map((hypothesis) => (
                    <button
                      type="button"
                      key={hypothesis}
                      className={selectedHypothesis === hypothesis ? "is-selected" : ""}
                      aria-pressed={selectedHypothesis === hypothesis}
                      onClick={() => onHypothesis(hypothesis)}
                    >
                      {hypothesis}
                    </button>
                  ))}
                </div>
                <p>선택은 추리 기록에만 남으며 강아지의 학습에는 영향을 주지 않습니다.</p>
              </fieldset>
            )}
          </section>
        </div>

        <button
          className="primary-action"
          type="button"
          disabled={needsHypothesis && selectedHypothesis === null}
          onClick={onContinue}
        >
          {day === 7 ? "캠페인 결과 보기" : "다음 날"}
        </button>
      </section>
    </main>
  );
}
