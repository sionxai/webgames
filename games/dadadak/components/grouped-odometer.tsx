"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type AnimationEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { Odometer } from "@/components/odometer";

interface GroupedOdometerProps {
  value: number;
  color?: string;
  className?: string;
  baseSizePx?: number;
}

const MAN = 10_000;
const MAN_THRESHOLD = 1_000_000;
const EOK = 100_000_000;
const LOWER_SIZE_RATIO = 0.65;
const TAIL_SIZE_RATIO = 0.54;
const UNIT_SIZE_RATIO = 0.42;

function normalize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function triggerPop(ref: RefObject<HTMLSpanElement | null>) {
  const node = ref.current;
  if (!node) return;

  node.classList.remove("count-pop");
  void node.offsetWidth;
  node.classList.add("count-pop");
}

export function GroupedOdometer({
  value,
  color = "var(--color-primary)",
  className = "",
  baseSizePx = 52,
}: GroupedOdometerProps) {
  const normalized = normalize(value);
  const resolvedBaseSize =
    Number.isFinite(baseSizePx) && baseSizePx > 0 ? baseSizePx : 52;
  const lowerSize = Math.round(resolvedBaseSize * LOWER_SIZE_RATIO);
  const tailSize = Math.round(resolvedBaseSize * TAIL_SIZE_RATIO);
  const label = normalized.toLocaleString("ko-KR");
  const manGroupRef = useRef<HTMLSpanElement | null>(null);
  const eokGroupRef = useRef<HTMLSpanElement | null>(null);
  const previousGroupsRef = useRef<{ man: number; eok: number } | null>(null);
  const groups = useMemo(
    () => ({
      eok: Math.floor(normalized / EOK),
      man: Math.floor(normalized / MAN) % MAN,
      totalMan: Math.floor(normalized / MAN),
      lower: normalized % MAN,
    }),
    [normalized]
  );

  useEffect(() => {
    const previous = previousGroupsRef.current;

    if (previous) {
      if (previous.man !== groups.man) {
        triggerPop(manGroupRef);
      }
      if (previous.eok !== groups.eok) {
        triggerPop(eokGroupRef);
      }
    }

    previousGroupsRef.current = { man: groups.man, eok: groups.eok };
  }, [groups]);

  const handlePopEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    event.currentTarget.classList.remove("count-pop");
  };

  const renderUnit = (unit: "만" | "억", sizePx: number) => (
    <span
      className="font-bold text-dim"
      style={{ fontSize: sizePx * UNIT_SIZE_RATIO, lineHeight: 1 }}
    >
      {unit}
    </span>
  );

  const renderRoot = (children: ReactNode) => (
    <span
      role="img"
      aria-label={label}
      className={`tabular inline-flex items-baseline gap-[0.12em] whitespace-nowrap ${className}`}
      style={{ lineHeight: 1 }}
    >
      {children}
    </span>
  );

  if (normalized < MAN_THRESHOLD) {
    return renderRoot(
      <span aria-hidden>
        <Odometer value={normalized} sizePx={resolvedBaseSize} color={color} />
      </span>
    );
  }

  if (normalized < EOK) {
    return renderRoot(
      <>
        <span
          ref={manGroupRef}
          aria-hidden
          className="inline-flex items-baseline"
          onAnimationEnd={handlePopEnd}
        >
          <Odometer
            value={groups.totalMan}
            sizePx={resolvedBaseSize}
            color={color}
          />
          {renderUnit("만", resolvedBaseSize)}
        </span>
        <span aria-hidden>
          <Odometer
            value={groups.lower}
            sizePx={lowerSize}
            color={color}
            padTo={4}
          />
        </span>
      </>
    );
  }

  // Extreme 9999-eok+ values are not special-cased; the grouped layout remains mechanical.
  return renderRoot(
    <>
      <span
        ref={eokGroupRef}
        aria-hidden
        className="inline-flex items-baseline"
        onAnimationEnd={handlePopEnd}
      >
        <Odometer value={groups.eok} sizePx={resolvedBaseSize} color={color} />
        {renderUnit("억", resolvedBaseSize)}
      </span>
      <span
        ref={manGroupRef}
        aria-hidden
        className="inline-flex items-baseline"
        onAnimationEnd={handlePopEnd}
      >
        <Odometer
          value={groups.man}
          sizePx={lowerSize}
          color={color}
          padTo={4}
        />
        {renderUnit("만", lowerSize)}
      </span>
      <span aria-hidden>
        <Odometer
          value={groups.lower}
          sizePx={tailSize}
          color={color}
          padTo={4}
        />
      </span>
    </>
  );
}
