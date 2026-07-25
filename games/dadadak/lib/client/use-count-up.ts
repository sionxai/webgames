"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCountUp(target: number, durationMs = 900): number {
  const normalized = Number.isFinite(target)
    ? Math.max(0, Math.trunc(target))
    : 0;
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (normalized === 0) {
      startedRef.current = true;
      setValue(0);
      return;
    }

    if (prefersReducedMotion()) {
      startedRef.current = true;
      setValue(normalized);
      return;
    }

    if (startedRef.current) {
      setValue(normalized);
      return;
    }

    startedRef.current = true;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      setValue(Math.round(normalized * easeOutCubic(progress)));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [durationMs, normalized]);

  return value;
}
