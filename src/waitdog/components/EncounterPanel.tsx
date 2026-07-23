import { useEffect, useRef, useState } from "react";
import type { EncounterChoice, EncounterPublicView } from "../types";

export interface EncounterPanelProps {
  encounter: EncounterPublicView;
  feedback: string | null;
  onObserve: () => void;
  onSelectResponse: (choiceId: string) => void;
  onSelectReinforcement: (choiceId: string) => void;
  onRequestHint: () => void;
  onIdleHint: () => void;
  onDismiss: () => void;
}

interface ChoicePresentation {
  icon: string;
  verb: string;
}

const RESPONSE_PRESENTATION: Record<string, ChoicePresentation> = {
  "potty-guide-pad": { icon: "◎", verb: "패드 안내" },
  "potty-check-calmly": { icon: "↗", verb: "동선 열기" },
  "potty-punish": { icon: "▲", verb: "큰소리" },
  "excited-pause": { icon: "Ⅱ", verb: "잠깐 멈춤" },
  "excited-rest": { icon: "◒", verb: "매트 휴식" },
  "excited-space": { icon: "↔", verb: "거리 늘리기" },
  "recall-short": { icon: "⌁", verb: "한 번 부르기" },
  "recall-cheerful": { icon: "☀", verb: "밝게 기다리기" },
  "recall-space": { icon: "↷", verb: "정면 비키기" },
  "settle-mat": { icon: "▱", verb: "매트 기다림" },
  "settle-dim": { icon: "◐", verb: "자극 낮추기" },
  "settle-near": { icon: "○", verb: "조용히 곁에" },
  "bark-acknowledge": { icon: "✓", verb: "소리 확인" },
  "bark-distance": { icon: "↔", verb: "문과 거리" },
  "bark-redirect": { icon: "⌕", verb: "냄새 찾기" },
  "whine-quiet": { icon: "♡", verb: "조용히 관심" },
  "whine-check": { icon: "☑", verb: "필요 확인" },
  "whine-observe": { icon: "✎", verb: "기록·문의" },
  "anxiety-gradual": { icon: "⋯", verb: "천천히 연습" },
  "anxiety-safe-room": { icon: "⌂", verb: "숨을 공간" },
  "anxiety-consult": { icon: "✚", verb: "전문가 확인" },
  "bite-trade": { icon: "⇄", verb: "안전한 교환" },
  "bite-stop": { icon: "■", verb: "접촉 멈춤" },
  "bite-force": { icon: "!", verb: "붙잡기" },
  "flee-quiet": { icon: "♩", verb: "소리 줄이기" },
  "flee-crouch": { icon: "⌄", verb: "몸 낮춰 부르기" },
  "flee-stop": { icon: "■", verb: "추격 멈춤" },
};

const STAGE_LABELS: Record<EncounterPublicView["stage"], string> = {
  cue: "관찰",
  cause: "관찰",
  response: "대응",
  reinforcement: "보상",
  result: "완료",
  outcome: "완료",
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

const fallbackPresentation = (
  choice: EncounterChoice,
): ChoicePresentation => ({
  icon: "•",
  verb: choice.label.split(/\s+/).slice(0, 2).join(" "),
});

function ResponseChoices({
  choices,
  selectedId,
  onSelect,
}: {
  choices: readonly EncounterChoice[];
  selectedId: string | null;
  onSelect: (choiceId: string) => void;
}) {
  return (
    <fieldset className="encounter-choices quick-response-choices">
      <legend>대응 선택</legend>
      <div>
        {choices.slice(0, 3).map((choice, index) => {
          const presentation = RESPONSE_PRESENTATION[choice.id] ??
            fallbackPresentation(choice);
          return (
            <button
              type="button"
              key={choice.id}
              className={selectedId === choice.id ? "is-selected" : ""}
              aria-label={`${index + 1}. ${choice.label}`}
              aria-pressed={selectedId === choice.id}
              title={choice.label}
              onClick={() => onSelect(choice.id)}
            >
              <span className="choice-key" aria-hidden="true">
                {index + 1}
              </span>
              <span className="choice-icon" aria-hidden="true">
                {presentation.icon}
              </span>
              <strong>{presentation.verb}</strong>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ReinforcementChoices({
  choices,
  onSelect,
}: {
  choices: readonly EncounterChoice[];
  onSelect: (choiceId: string) => void;
}) {
  const keyFor = (choiceId: string) => choiceId === "praise" ? "Space" : "Q";
  const labelFor = (choiceId: string) => choiceId === "praise" ? "칭찬" : "간식";
  return (
    <fieldset className="encounter-choices reinforcement-choices">
      <legend>마무리</legend>
      <div>
        {choices.filter((choice) =>
          choice.id === "praise" || choice.id === "treat"
        ).map((choice) => (
          <button
            type="button"
            key={choice.id}
            aria-label={`${keyFor(choice.id)} 키. ${choice.label}`}
            title={choice.label}
            onClick={() => onSelect(choice.id)}
          >
            <kbd>{keyFor(choice.id)}</kbd>
            <strong>{labelFor(choice.id)}</strong>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function EncounterPanel({
  encounter,
  feedback,
  onObserve,
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
      encounter.stage !== "response" ||
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
  const isObserveStage = encounter.stage === "cause" ||
    encounter.stage === "cue";
  const isOutcomeStage = encounter.stage === "outcome" ||
    encounter.stage === "result";

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

      {isObserveStage && (
        <button
          className="encounter-observe"
          type="button"
          aria-label={`E 키로 관찰. ${encounter.cue.label}`}
          title={encounter.cue.label}
          onClick={onObserve}
        >
          <kbd>E</kbd>
          <strong>관찰</strong>
        </button>
      )}

      {!isObserveStage && !isOutcomeStage && (
        <div
          className="observed-cue"
          aria-label={`관찰 단서: ${
            encounter.publicClues.join(" ") || encounter.cue.label
          }`}
          title={encounter.publicClues.join(" · ") || encounter.cue.label}
        >
          <span aria-hidden="true">✓</span>
          <strong className="observed-cue__text">
            {encounter.publicClues[0] ?? encounter.cue.label}
          </strong>
        </div>
      )}

      {encounter.stage === "response" && (
        <ResponseChoices
          choices={encounter.responseChoices}
          selectedId={encounter.selectedResponseId}
          onSelect={(choiceId) => {
            setInputRevision((revision) => revision + 1);
            onSelectResponse(choiceId);
          }}
        />
      )}

      {encounter.stage === "reinforcement" && (
        <ReinforcementChoices
          choices={encounter.reinforcementChoices}
          onSelect={(choiceId) => {
            setInputRevision((revision) => revision + 1);
            onSelectReinforcement(choiceId);
          }}
        />
      )}

      {encounter.hint && !isObserveStage && !isOutcomeStage && (
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

      {encounter.stage === "response" && encounter.hint === null && (
        <button
          className="hint-button"
          type="button"
          onClick={() => {
            setInputRevision((revision) => revision + 1);
            onRequestHint();
          }}
        >
          힌트
        </button>
      )}

      {isOutcomeStage && encounter.outcome && (
        <div
          className={encounter.outcome.success
            ? "encounter-outcome is-success"
            : "encounter-outcome"}
          aria-live="polite"
          aria-label={encounter.outcome.success
            ? "미션 완료"
            : "미션 결과를 다시 확인하세요"}
        >
          <span className="outcome-mark" aria-hidden="true">
            {encounter.outcome.success ? "✓" : "!"}
          </span>
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
            확인
          </button>
        </div>
      )}
    </section>
  );
}
