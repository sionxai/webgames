import type { Hypothesis } from "../services/campaign";
import type { DayNarrative } from "../services/narrative";

export interface DayReviewProps {
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
  const timelineIndexes = narrative.timeline.length <= 3
    ? narrative.timeline.map((_, index) => index)
    : [
      0,
      Math.floor((narrative.timeline.length - 1) / 2),
      narrative.timeline.length - 1,
    ];
  const timelineHighlights = timelineIndexes.map((index) => ({
    index,
    item: narrative.timeline[index],
  }));
  const learningHighlights = narrative.learning.slice(0, 2);
  const hasMoreDetail = narrative.timeline.length > timelineHighlights.length ||
    narrative.learning.length > learningHighlights.length;

  return (
    <main className="waitdog-page phase-page">
      <section className="phase-card review-card" aria-labelledby="review-title">
        <span className="section-kicker">DAY REVIEW</span>
        <h1 id="review-title">Day {day} 하루 평가</h1>
        <p className="phase-lead">
          오늘의 핵심 장면과 학습 변화만 모았습니다.
        </p>

        <div className="review-grid">
          <section className="review-highlights" aria-labelledby="timeline-title">
            <h2 id="timeline-title">오늘의 핵심</h2>
            {timelineHighlights.length > 0 ? (
              <ol className="review-highlight-list">
                {timelineHighlights.map(({ item, index }) => (
                  <li key={`${item.time}-${index}`}>
                    <time>{item.time}</time>
                    <p>{item.sentence}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-copy">기록할 핵심 장면이 없었습니다.</p>
            )}
          </section>

          <section className="review-learning" aria-labelledby="learning-title">
            <h2 id="learning-title">학습 변화</h2>
            {learningHighlights.length > 0 ? (
              <ul className="learning-cards">
                {learningHighlights.map((sentence) => (
                  <li key={sentence}>{sentence}</li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">오늘 확인된 학습 변화가 없습니다.</p>
            )}

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

        {hasMoreDetail && (
          <details className="review-details">
            <summary>전체 기록 펼치기</summary>
            <div>
              <section aria-labelledby="full-timeline-title">
                <h2 id="full-timeline-title">시간순 기록</h2>
                <ol className="review-timeline">
                  {narrative.timeline.map((item, index) => (
                    <li key={`${item.time}-${index}`}>
                      <time>{item.time}</time>
                      <p>{item.sentence}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <section aria-labelledby="full-learning-title">
                <h2 id="full-learning-title">학습 변화 전체</h2>
                <ul className="learning-list">
                  {narrative.learning.map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>
              </section>
            </div>
          </details>
        )}

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
