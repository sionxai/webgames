import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { OwnerDirectMoveInput } from "../services/waitdogSim";

export type DirectMoveVector = OwnerDirectMoveInput;

export interface DirectControlsProps {
  disabled: boolean;
  onMove: (vector: DirectMoveVector) => void;
  onInteract: () => void;
  interactionLabel?: string | null;
  interactionIcon?: string;
  interactionDisabled?: boolean;
  workProgress?: number | null;
  workHoldLabel?: string;
  workHoldDisabled?: boolean;
  onWorkHoldChange?: (holding: boolean) => void;
}

const ZERO_VECTOR: DirectMoveVector = { dx: 0, dy: 0 };

export function DirectControls({
  disabled,
  onMove,
  onInteract,
  interactionLabel = "상호작용",
  interactionIcon = "◎",
  interactionDisabled = false,
  workProgress = null,
  workHoldLabel = "업무",
  workHoldDisabled = false,
  onWorkHoldChange,
}: DirectControlsProps) {
  const stickRef = useRef<HTMLButtonElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const workPointerRef = useRef<number | null>(null);
  const workHoldingRef = useRef(false);
  const onMoveRef = useRef(onMove);
  const onWorkHoldChangeRef = useRef(onWorkHoldChange);
  const [vector, setVector] = useState<DirectMoveVector>(ZERO_VECTOR);
  const [workHolding, setWorkHolding] = useState(false);
  onMoveRef.current = onMove;
  onWorkHoldChangeRef.current = onWorkHoldChange;

  const stopMoving = () => {
    activePointerRef.current = null;
    setVector(ZERO_VECTOR);
    onMoveRef.current(ZERO_VECTOR);
  };

  const stopWorkHold = () => {
    workPointerRef.current = null;
    if (!workHoldingRef.current) return;
    workHoldingRef.current = false;
    setWorkHolding(false);
    onWorkHoldChangeRef.current?.(false);
  };

  const startWorkHold = () => {
    if (
      disabled || workHoldDisabled || workProgress === null ||
      onWorkHoldChangeRef.current === undefined || workHoldingRef.current
    ) return;
    workHoldingRef.current = true;
    setWorkHolding(true);
    onWorkHoldChangeRef.current(true);
  };

  useEffect(() => {
    if (disabled) {
      stopMoving();
      stopWorkHold();
    }
  }, [disabled]);

  useEffect(() => {
    if (
      workHoldDisabled || workProgress === null ||
      onWorkHoldChange === undefined
    ) {
      stopWorkHold();
    }
  }, [onWorkHoldChange, workHoldDisabled, workProgress]);

  useEffect(() => {
    const handleWindowBlur = () => {
      stopMoving();
      stopWorkHold();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") handleWindowBlur();
    };
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      onMoveRef.current(ZERO_VECTOR);
      if (workHoldingRef.current) {
        workHoldingRef.current = false;
        onWorkHoldChangeRef.current?.(false);
      }
    };
  }, []);

  const updateVector = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || activePointerRef.current !== event.pointerId) return;
    const bounds = stickRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const rawX = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    const rawY = (event.clientY - (bounds.top + bounds.height / 2)) / radius;
    const magnitude = Math.hypot(rawX, rawY);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const next = {
      dx: Number((rawX * scale).toFixed(3)),
      dy: Number((rawY * scale).toFixed(3)),
    };
    setVector(next);
    onMoveRef.current(next);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateVector(event);
  };

  const handlePointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopMoving();
  };

  const handleWorkPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      event.button !== 0 || disabled || workHoldDisabled ||
      workPointerRef.current !== null
    ) return;
    event.preventDefault();
    workPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    startWorkHold();
  };

  const handleWorkPointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (workPointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopWorkHold();
  };

  const handleWorkKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) startWorkHold();
  };

  const handleWorkKeyUp = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    stopWorkHold();
  };

  const stopActivationPropagation = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === " " || event.key === "Enter") {
      event.stopPropagation();
    }
  };

  const showsWorkHold = workProgress !== null &&
    onWorkHoldChange !== undefined;
  const normalizedProgress = workProgress === null
    ? 0
    : Math.max(0, Math.min(100, workProgress));

  return (
    <section className="direct-controls" aria-label="직접 조작">
      <button
        ref={stickRef}
        className="direct-stick"
        type="button"
        disabled={disabled}
        aria-label="가상 이동 스틱"
        onPointerDown={handlePointerDown}
        onPointerMove={updateVector}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onBlur={stopMoving}
      >
        <span
          className="direct-stick__thumb"
          style={{
            transform: `translate(${vector.dx * 30}px, ${vector.dy * 30}px)`,
          }}
          aria-hidden="true"
        />
      </button>
      <div className="direct-actions" aria-label="모바일 문맥 행동">
        {interactionLabel !== null && (
          <button
            className="direct-action direct-action--interact"
            type="button"
            disabled={disabled || interactionDisabled}
            aria-label={`E 키와 같은 ${interactionLabel}`}
            onClick={onInteract}
            onKeyDown={stopActivationPropagation}
          >
            <span aria-hidden="true">{interactionIcon}</span>
            <kbd>E</kbd>
            <strong>{interactionLabel}</strong>
          </button>
        )}
        {showsWorkHold && (
          <button
            className="direct-action direct-action--work"
            type="button"
            disabled={disabled || workHoldDisabled}
            aria-label={`R 키처럼 누르고 있는 동안 ${workHoldLabel} 진행, 현재 ${Math.round(normalizedProgress)}%`}
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
            <span aria-hidden="true">▰</span>
            <kbd>R</kbd>
            <strong>{workHoldLabel}</strong>
            <small>{Math.round(normalizedProgress)}%</small>
          </button>
        )}
      </div>
    </section>
  );
}
