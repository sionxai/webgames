import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { OwnerDirectMoveInput } from "../services/waitdogSim";

export type DirectMoveVector = OwnerDirectMoveInput;

export interface DirectControlsProps {
  disabled: boolean;
  onMove: (vector: DirectMoveVector) => void;
  onInteract: () => void;
  onPraise: () => void;
  onTreat: () => void;
}

const ZERO_VECTOR: DirectMoveVector = { dx: 0, dy: 0 };

export function DirectControls({
  disabled,
  onMove,
  onInteract,
  onPraise,
  onTreat,
}: DirectControlsProps) {
  const stickRef = useRef<HTMLButtonElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  const [vector, setVector] = useState<DirectMoveVector>(ZERO_VECTOR);
  onMoveRef.current = onMove;

  const stopMoving = () => {
    activePointerRef.current = null;
    setVector(ZERO_VECTOR);
    onMoveRef.current(ZERO_VECTOR);
  };

  useEffect(() => {
    if (disabled) stopMoving();
  }, [disabled]);

  useEffect(() => () => {
    onMoveRef.current(ZERO_VECTOR);
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
        onPointerLeave={handlePointerEnd}
      >
        <span
          className="direct-stick__thumb"
          style={{
            transform: `translate(${vector.dx * 30}px, ${vector.dy * 30}px)`,
          }}
          aria-hidden="true"
        />
      </button>
      <div className="direct-actions">
        <button
          className="direct-action direct-action--interact"
          type="button"
          disabled={disabled}
          aria-label="E 키와 같은 관찰 또는 상호작용"
          onClick={onInteract}
        >
          <kbd>E</kbd>
          <span>관찰</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Space 키와 같은 칭찬"
          onClick={onPraise}
        >
          <kbd>Space</kbd>
          <span>칭찬</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Q 키와 같은 간식"
          onClick={onTreat}
        >
          <kbd>Q</kbd>
          <span>간식</span>
        </button>
      </div>
    </section>
  );
}
