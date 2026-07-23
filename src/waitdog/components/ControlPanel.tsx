interface ControlPanelProps {
  blocked: boolean;
  disabled: boolean;
  feedback: string | null;
  onWalk: () => void;
  onWater: () => void;
  onCleanup: () => void;
}

export function ControlPanel({
  blocked,
  disabled,
  feedback,
  onWalk,
  onWater,
  onCleanup,
}: ControlPanelProps) {
  return (
    <details className="secondary-actions panel-card">
      <summary>
        <span>
          <span className="section-kicker">SECONDARY</span>
          자유 행동
        </span>
        <small>{blocked ? "칸막이 사용 중" : "필요할 때만 열기"}</small>
      </summary>
      <p>
        미션과 직접 관련 없는 생활 행동입니다. 아이템은 하단의 가방에서 사용하세요.
      </p>
      <div>
        <button type="button" disabled={disabled} onClick={onWalk}>
          산책 30분
        </button>
        <button type="button" disabled={disabled} onClick={onWater}>
          물 채우기
        </button>
        <button type="button" disabled={disabled} onClick={onCleanup}>
          배변 청소
        </button>
      </div>
      {feedback && <p className="secondary-feedback" role="status">{feedback}</p>}
    </details>
  );
}
