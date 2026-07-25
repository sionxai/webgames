"use client";
import { BATTLE } from "@/lib/shared/constants";

export function TimerBar({
  remainMs,
  durationMs = BATTLE.DURATION_MS,
}: {
  remainMs: number;
  durationMs?: number;
}) {
  const ratio = Math.max(0, Math.min(1, remainMs / durationMs));
  const danger = remainMs <= 2000;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full origin-left rounded-full ${danger ? "bg-danger" : "bg-primary"}`}
          style={{
            transform: `scaleX(${ratio})`,
            transition: "transform 250ms linear",
          }}
        />
      </div>
      <span className={`tabular w-12 text-right text-base font-bold ${danger ? "text-danger" : "text-text"}`}>
        {(remainMs / 1000).toFixed(1)}s
      </span>
    </div>
  );
}
