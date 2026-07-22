import type { InterventionKind } from "../types";

interface ControlPanelProps {
  blocked: boolean;
  focusLocked: boolean;
  disabled: boolean;
  onIntervene: (kind: InterventionKind, label: string) => void;
  onFocusToggle: () => void;
  onWalk: () => void;
  onFeed: () => void;
  onWater: () => void;
}

const INTERVENTIONS: ReadonlyArray<{ kind: InterventionKind; label: string }> = [
  { kind: "calmCall", label: "부르기" },
  { kind: "matCommand", label: "매트" },
  { kind: "praise", label: "칭찬" },
  { kind: "treat", label: "간식" },
  { kind: "toyLure", label: "장난감" },
  { kind: "block", label: "차단토글" },
  { kind: "scold", label: "큰소리" },
  { kind: "cleanup", label: "청소" },
];

export function ControlPanel({
  blocked,
  focusLocked,
  disabled,
  onIntervene,
  onFocusToggle,
  onWalk,
  onFeed,
  onWater,
}: ControlPanelProps) {
  return (
    <section className="panel-card control-card" aria-labelledby="control-title">
      <div className="section-heading compact">
        <div>
          <span className="section-kicker">INTERVENE</span>
          <h2 id="control-title">개입하기</h2>
        </div>
        <span className={blocked ? "block-pill is-blocked" : "block-pill"}>
          {blocked ? "펜스 닫힘" : "펜스 열림"}
        </span>
      </div>

      <div className="intervention-grid">
        {INTERVENTIONS.map(({ kind, label }) => (
          <button
            type="button"
            key={kind}
            disabled={disabled}
            onClick={() => onIntervene(kind, label)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="owner-controls" aria-label="보호자 컨트롤">
        <h3>보호자 컨트롤</h3>
        <button type="button" disabled={disabled} onClick={onFocusToggle}>
          {focusLocked ? "업무 종료" : "업무 시작"}
        </button>
        <button type="button" disabled={disabled} onClick={onWalk}>산책 30분</button>
        <button type="button" disabled={disabled} onClick={onFeed}>급식</button>
        <button type="button" disabled={disabled} onClick={onWater}>급수</button>
      </div>
    </section>
  );
}
