interface CampaignEndProps {
  outcomes: readonly [string, string, string];
  onInfinite: () => void;
  onNewCampaign: () => void;
}

export function CampaignEnd({
  outcomes,
  onInfinite,
  onNewCampaign,
}: CampaignEndProps) {
  return (
    <main className="waitdog-page phase-page">
      <section className="phase-card campaign-end-card" aria-labelledby="campaign-end-title">
        <span className="campaign-mark" aria-hidden="true">✦</span>
        <span className="section-kicker">CAMPAIGN COMPLETE</span>
        <h1 id="campaign-end-title">함께 보낸 한 주의 이야기</h1>
        <p className="phase-lead">강아지는 보호자의 반응과 자신의 선택을 차근차근 연결했습니다.</p>
        <ul className="campaign-outcomes">
          {outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}
        </ul>
        <div className="campaign-actions">
          <button className="primary-action" type="button" onClick={onInfinite}>
            무한 모드로 계속
          </button>
          <button className="secondary-action" type="button" onClick={onNewCampaign}>
            새 캠페인
          </button>
        </div>
      </section>
    </main>
  );
}
