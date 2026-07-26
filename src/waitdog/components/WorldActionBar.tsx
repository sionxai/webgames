import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface WorldActionTarget {
  icon: string;
  label: string;
}

export interface WorldContextAction {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface WorldActionBarProps {
  target: WorldActionTarget | null;
  prompt: string;
  cause?: string | null;
  actions: readonly WorldContextAction[];
  disabled?: boolean;
  interactLabel?: string;
  interactDisabled?: boolean;
  workProgress?: number | null;
  workHoldLabel?: string;
  workHoldDisabled?: boolean;
  onAction: (actionId: string) => void;
  onInteract: () => void;
  onWorkHoldChange?: (holding: boolean) => void;
}

const clampProgress = (value: number): number =>
  Math.max(0, Math.min(100, value));

const isHoldKey = (key: string): boolean => key === " " || key === "Enter";

export function WorldActionBar({
  target,
  prompt,
  cause = null,
  actions,
  disabled = false,
  interactLabel = "상호작용",
  interactDisabled = false,
  workProgress = null,
  workHoldLabel = "업무",
  workHoldDisabled = false,
  onAction,
  onInteract,
  onWorkHoldChange,
}: WorldActionBarProps) {
  const activePointerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const onWorkHoldChangeRef = useRef(onWorkHoldChange);
  const [workHolding, setWorkHolding] = useState(false);
  onWorkHoldChangeRef.current = onWorkHoldChange;

  const stopWorkHold = useCallback(() => {
    activePointerRef.current = null;
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setWorkHolding(false);
    onWorkHoldChangeRef.current?.(false);
  }, []);

  const startWorkHold = useCallback(() => {
    if (
      disabled || workHoldDisabled || workProgress === null ||
      onWorkHoldChangeRef.current === undefined || holdingRef.current
    ) return;
    holdingRef.current = true;
    setWorkHolding(true);
    onWorkHoldChangeRef.current(true);
  }, [disabled, workHoldDisabled, workProgress]);

  useEffect(() => {
    if (
      disabled || workHoldDisabled || workProgress === null ||
      onWorkHoldChange === undefined
    ) {
      stopWorkHold();
    }
  }, [
    disabled,
    onWorkHoldChange,
    stopWorkHold,
    workHoldDisabled,
    workProgress,
  ]);

  useEffect(() => {
    const handleWindowBlur = () => stopWorkHold();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") stopWorkHold();
    };
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activePointerRef.current = null;
      if (holdingRef.current) {
        holdingRef.current = false;
        onWorkHoldChangeRef.current?.(false);
      }
    };
  }, [stopWorkHold]);

  const handleWorkPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      event.button !== 0 || disabled || workHoldDisabled ||
      activePointerRef.current !== null
    ) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    startWorkHold();
  };

  const handleWorkPointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopWorkHold();
  };

  const handleWorkKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!isHoldKey(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) startWorkHold();
  };

  const handleWorkKeyUp = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!isHoldKey(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    stopWorkHold();
  };

  const stopActivationPropagation = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (isHoldKey(event.key)) event.stopPropagation();
  };

  const visibleActions = actions.slice(0, 3);
  const normalizedProgress = workProgress === null
    ? null
    : clampProgress(workProgress);
  const controlsDisabled = disabled || interactDisabled;

  return (
    <section className="world-action-bar" aria-label="현재 월드 행동">
      <div className="world-action-context">
        <span className="world-action-target" aria-hidden="true">
          {target?.icon ?? "⌖"}
        </span>
        <div className="world-action-copy" aria-live="polite" aria-atomic="true">
          <strong>{target?.label ?? "주변"}</strong>
          <span title={prompt}>{prompt}</span>
          {cause && (
            <small title={cause}>
              추정 원인 · {cause}
            </small>
          )}
        </div>
      </div>

      <div className="world-action-buttons">
        <button
          className="world-action-button world-action-button--interact"
          type="button"
          disabled={controlsDisabled}
          onClick={onInteract}
          onKeyDown={stopActivationPropagation}
        >
          <kbd>E</kbd>
          <span>{interactLabel}</span>
        </button>
        {visibleActions.map((action) => (
          <button
            className="world-action-button"
            type="button"
            key={action.id}
            disabled={disabled || action.disabled === true}
            title={action.disabled ? action.disabledReason : undefined}
            aria-label={`${action.label}, 단축키 ${action.shortcut}`}
            onClick={() => onAction(action.id)}
            onKeyDown={stopActivationPropagation}
          >
            <span aria-hidden="true">{action.icon}</span>
            <strong>{action.label}</strong>
            <kbd>{action.shortcut}</kbd>
          </button>
        ))}
      </div>

      {normalizedProgress !== null && onWorkHoldChange && (
        <div className="world-work-hold">
          <label>
            <span>업무 진행</span>
            <strong>{Math.round(normalizedProgress)}%</strong>
            <progress
              max={100}
              value={normalizedProgress}
              aria-label={`업무 진행 ${Math.round(normalizedProgress)}%`}
            />
          </label>
          <button
            type="button"
            disabled={disabled || workHoldDisabled}
            aria-label={`R 키처럼 누르고 있는 동안 ${workHoldLabel} 진행`}
            aria-pressed={workHolding}
            onPointerDown={handleWorkPointerDown}
            onPointerUp={handleWorkPointerEnd}
            onPointerCancel={handleWorkPointerEnd}
            onLostPointerCapture={handleWorkPointerEnd}
            onPointerLeave={handleWorkPointerEnd}
            onKeyDown={handleWorkKeyDown}
            onKeyUp={handleWorkKeyUp}
            onBlur={stopWorkHold}
          >
            <kbd>R</kbd>
            <span>{workHoldLabel} 홀드</span>
          </button>
        </div>
      )}
    </section>
  );
}
