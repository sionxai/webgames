import { useEffect, useRef, useState } from "react";
import type { EncounterChoice, EncounterPublicView } from "../types";

interface EncounterPanelProps {
  encounter: EncounterPublicView;
  feedback: string | null;
  onSelectCause: (choiceId: string) => void;
  onSelectResponse: (choiceId: string) => void;
  onSelectReinforcement: (choiceId: string) => void;
  onRequestHint: () => void;
  onIdleHint: () => void;
  onDismiss: () => void;
}

const STAGE_LABELS: Record<EncounterPublicView["stage"], string> = {
  cue: "단서",
  cause: "원인 찾기",
  response: "대응 고르기",
  reinforcement: "마무리 보상",
  result: "결과",
  outcome: "결과",
};

const STAGE_ORDER: EncounterPublicView["stage"][] = [
  "cause",
  "response",
  "reinforcement",
  "outcome",
];

const safetyCopy = (encounter: EncounterPublicView): string | null => {
  if (encounter.safetyLevel === "high") {
    return "억지로 붙잡거나 혼내지 마세요. 충분한 거리를 확보하고, 반복되면 수의사·행동 전문가와 상의하세요.";
  }
  if (encounter.safetyLevel === "caution") {
    return "흥분을 키우지 말고 낮은 목소리와 여유 있는 거리로 대응하세요.";
  }
  return null;
};

function ChoiceFieldset({
  legend,
  choices,
  selectedId,
  onSelect,
}: {
  legend: string;
  choices: readonly EncounterChoice[];
  selectedId: string | null;
  onSelect: (choiceId: string) => void;
}) {
  return (
    <fieldset className="encounter-choices">
      <legend>{legend}</legend>
      <div>
        {choices.map((choice, index) => (
          <button
            type="button"
            key={choice.id}
            className={selectedId === choice.id ? "is-selected" : ""}
            aria-pressed={selectedId === choice.id}
            onClick={() => onSelect(choice.id)}
          >
            <span aria-hidden="true">{index + 1}</span>
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function EncounterPanel({
  encounter,
  feedback,
  onSelectCause,
  onSelectResponse,
  onSelectReinforcement,
  onRequestHint,
  onIdleHint,
  onDismiss,
}: EncounterPanelProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const idleHintRef = useRef(onIdleHint);
  const [inputRevision, setInputRevision] = useState(0);
  idleHintRef.current = onIdleHint;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [encounter.id, encounter.stage]);

  useEffect(() => {
    if (
      encounter.stage === "outcome" ||
      encounter.stage === "result" ||
      encounter.hint !== null
    ) return;
    const timeout = window.setTimeout(() => idleHintRef.current(), 8_000);
    return () => window.clearTimeout(timeout);
  }, [encounter.hint, encounter.id, encounter.stage, inputRevision]);

  const safety = safetyCopy(encounter);
  const currentStageIndex = Math.max(
    0,
    STAGE_ORDER.indexOf(
      encounter.stage === "result" ? "outcome" : encounter.stage,
    ),
  );

  return (
    <section
      className={`panel-card encounter-card safety-${encounter.safetyLevel}`}
      aria-labelledby="encounter-title"
      data-testid="encounter-panel"
    >
      <div className="encounter-heading">
        <div>
          <span className="section-kicker">
            {encounter.tutorial ? "GUIDED MISSION" : "LIVE MISSION"}
          </span>
          <h2 id="encounter-title" ref={titleRef} tabIndex={-1}>
            {encounter.title}
          </h2>
        </div>
        <span className="encounter-stage">
          {STAGE_LABELS[encounter.stage]}
        </span>
      </div>

      <ol className="encounter-progress" aria-label="미션 진행 단계">
        {STAGE_ORDER.map((stage, index) => (
          <li
            key={stage}
            className={index < currentStageIndex
              ? "is-done"
              : index === currentStageIndex
              ? "is-current"
              : ""}
            aria-current={index === currentStageIndex ? "step" : undefined}
          >
            <span aria-hidden="true">{index + 1}</span>
            {STAGE_LABELS[stage]}
          </li>
        ))}
      </ol>

      {encounter.safetyBanner && (
        <p className="safety-banner" role="alert">
          {encounter.safetyBanner}
        </p>
      )}
      {safety && (
        <p className="professional-guidance" role="note">
          {safety}
        </p>
      )}

      {encounter.stage !== "outcome" && encounter.stage !== "result" && (
        <section className="cue-card" aria-labelledby="cue-title">
          <span aria-hidden="true" className="cue-icon">●</span>
          <div>
            <h3 id="cue-title">{encounter.cue.label}</h3>
            <ul>
              {encounter.publicClues.map((clue) => (
                <li key={clue}>{clue}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(encounter.stage === "cause" || encounter.stage === "cue") && (
        <ChoiceFieldset
          legend="이 행동의 원인은 무엇일까요?"
          choices={encounter.causeChoices}
          selectedId={encounter.selectedCauseId}
          onSelect={(choiceId) => {
            setInputRevision((revision) => revision + 1);
            onSelectCause(choiceId);
          }}
        />
      )}

      {encounter.stage === "response" && (
        <ChoiceFieldset
          legend="지금 가장 안전하고 도움이 되는 대응은?"
          choices={encounter.responseChoices}
          selectedId={encounter.selectedResponseId}
          onSelect={(choiceId) => {
            setInputRevision((revision) => revision + 1);
            onSelectResponse(choiceId);
          }}
        />
      )}

      {encounter.stage === "reinforcement" && (
        <ChoiceFieldset
          legend="좋은 선택을 어떻게 마무리할까요?"
          choices={encounter.reinforcementChoices}
          selectedId={null}
          onSelect={(choiceId) => {
            setInputRevision((revision) => revision + 1);
            onSelectReinforcement(choiceId);
          }}
        />
      )}

      {encounter.hint && (
        <aside className="encounter-hint" role="note">
          <strong>관찰 힌트</strong>
          <span>{encounter.hint}</span>
        </aside>
      )}

      {feedback && (
        <p className="encounter-feedback" role="alert">
          {feedback}
        </p>
      )}

      {encounter.stage !== "outcome" && encounter.stage !== "result" &&
        encounter.hint === null && (
        <button
          className="hint-button"
          type="button"
          onClick={() => {
            setInputRevision((revision) => revision + 1);
            onRequestHint();
          }}
        >
          힌트 요청
        </button>
      )}

      {(encounter.stage === "outcome" || encounter.stage === "result") &&
        encounter.outcome && (
        <div
          className={encounter.outcome.success
            ? "encounter-outcome is-success"
            : "encounter-outcome"}
          aria-live="polite"
        >
          <span className="outcome-mark" aria-hidden="true">
            {encounter.outcome.success ? "✓" : "!"}
          </span>
          <h3>{encounter.outcome.success ? "차분하게 해결했어요" : "다시 살펴볼 점이 있어요"}</h3>
          <p>{encounter.outcome.message}</p>
          {encounter.outcome.safetyMessage && (
            <p className="outcome-safety">{encounter.outcome.safetyMessage}</p>
          )}
          <dl>
            <div>
              <dt>점수</dt>
              <dd>{encounter.outcome.score}</dd>
            </div>
            <div>
              <dt>돌봄 포인트</dt>
              <dd>+{encounter.outcome.carePointsAwarded}</dd>
            </div>
          </dl>
          <button className="primary-action" type="button" onClick={onDismiss}>
            결과 확인
          </button>
        </div>
      )}
    </section>
  );
}
