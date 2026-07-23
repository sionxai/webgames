import type { WaitdogWorkView } from "../services/waitdogSim";

interface WorkPanelProps {
  work: WaitdogWorkView;
  feedback: string | null;
  disabled: boolean;
  onMoveToComputer: () => void;
  onWorkBlock: () => void;
  onResolveAlert: (choice: "interrupt" | "continue") => void;
}

const STATE_COPY: Record<WaitdogWorkView["state"], string> = {
  idle: "컴퓨터로 이동하면 15분 업무 블록을 시작할 수 있어요.",
  moving: "보호자가 컴퓨터 앞으로 이동 중입니다.",
  ready: "컴퓨터 앞입니다. 짧은 업무 블록으로 수입을 마련하세요.",
  working: "진행도는 저장됩니다. 다음 블록을 이어서 작업할 수 있어요.",
  alert: "강아지 신호가 들어왔습니다. 돌봄과 업무 중 하나를 선택하세요.",
  complete: "오늘의 업무를 마치고 급여가 정산되었습니다.",
};

export function WorkPanel({
  work,
  feedback,
  disabled,
  onMoveToComputer,
  onWorkBlock,
  onResolveAlert,
}: WorkPanelProps) {
  const alert = work.alert;
  const canAdvance = work.state === "ready" || work.state === "working";

  return (
    <section
      className={`panel-card work-card state-${work.state}`}
      aria-labelledby="work-title"
      data-testid="work-panel"
    >
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">REMOTE WORK</span>
          <h2 id="work-title">보호자 업무</h2>
        </div>
        <strong className="salary-preview">
          예상 {work.salaryPreview.toLocaleString("ko-KR")}원
        </strong>
      </div>

      <div
        className="work-progress"
        role="progressbar"
        aria-label="업무 진행도"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={work.progress}
      >
        <span style={{ width: `${work.progress}%` }} />
        {[0, 25, 50, 75, 100].map((mark) => (
          <i key={mark} style={{ left: `${mark}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="work-marks" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((mark) => <span key={mark}>{mark}%</span>)}
      </div>
      <p>{STATE_COPY[work.state]}</p>

      {alert && (
        <div className="work-alert" role="alert">
          <strong>{alert.cueLabel}</strong>
          <ul>
            {alert.publicClues.map((clue) => <li key={clue}>{clue}</li>)}
          </ul>
          <div className="work-alert-actions">
            <button
              className="care-first"
              type="button"
              disabled={disabled}
              onClick={() => onResolveAlert("interrupt")}
            >
              <strong>돌봄 우선</strong>
              <span>{alert.interruptPreview}</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onResolveAlert("continue")}
            >
              <strong>업무 계속</strong>
              <span>{alert.continuePreview}</span>
            </button>
          </div>
        </div>
      )}

      {!alert && work.state === "idle" && (
        <button
          className="computer-cta"
          type="button"
          disabled={disabled}
          onClick={onMoveToComputer}
        >
          컴퓨터 앞으로 이동
        </button>
      )}
      {!alert && work.state === "moving" && (
        <button className="computer-cta" type="button" disabled>
          이동 중…
        </button>
      )}
      {!alert && canAdvance && work.progress < 100 && (
        <button
          className="computer-cta"
          type="button"
          disabled={disabled}
          onClick={onWorkBlock}
        >
          {work.progress === 0 ? "업무 시작" : "업무 계속"} · {work.blockMinutes}분
        </button>
      )}
      {!alert && work.state === "complete" && (
        <p className="work-complete" role="status">
          급여 정산 완료 · 다음 날 새 업무가 열립니다.
        </p>
      )}
      {feedback && <p className="work-feedback" role="status">{feedback}</p>}
    </section>
  );
}
