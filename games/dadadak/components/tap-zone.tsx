"use client";

import { GroupedOdometer } from "@/components/grouped-odometer";
import { TapArea } from "@/components/tap-area";
import { useCountUp } from "@/lib/client/use-count-up";
import { useTaps } from "@/lib/client/use-taps";
import { gradeFor, nextGrade } from "@/lib/shared/constants";

export function TapZone() {
  const { total, session, tap } = useTaps();
  const displayTotal = useCountUp(total);
  const grade = gradeFor(total);
  const next = nextGrade(total);
  const progress = next ? Math.min(1, total / next.min) : 1;

  return (
    <section className="card flex min-h-0 flex-1 flex-col p-4">
      <div className="text-center">
        <p className="text-base font-bold" style={{ color: grade.color }}>
          {grade.name}
        </p>
        <p className="mt-1 text-[13px] text-dim">{grade.desc}</p>
        <div className="mt-3">
          <GroupedOdometer value={displayTotal} baseSizePx={52} />
        </div>
        <p className="mt-1 text-[13px] text-dim">이 브라우저의 누적 딸깍</p>
        {session > 0 && (
          <p className="tabular mt-1 text-[13px] text-win">이번 접속 +{session}</p>
        )}
        {next && (
          <div className="mx-auto mt-4 w-full max-w-72">
            <div className="flex justify-between text-[12px] text-dim">
              <span>다음 등급 {next.name}</span>
              <span className="tabular">{next.min.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full origin-left rounded-full"
                style={{
                  transform: `scaleX(${progress})`,
                  backgroundColor: next.color,
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex min-h-0 flex-1">
        <TapArea onHit={tap} label="다다닥!" />
      </div>
    </section>
  );
}
