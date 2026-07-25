"use client";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { GroupedOdometer } from "@/components/grouped-odometer";
import { TapArea } from "@/components/tap-area";
import { useCountUp } from "@/lib/client/use-count-up";
import { useTaps } from "@/lib/client/use-taps";
import { gradeFor, nextGrade } from "@/lib/shared/constants";

/** 집중 딸깍 — 무한 누적 전체화면 모드. 적립 로직은 홈 히어로와 동일(useTaps). */
export default function TapPage() {
  const { total, session, tap } = useTaps();

  const grade = gradeFor(total);
  const next = nextGrade(total);
  const progress = next ? Math.min(1, total / next.min) : 1;
  const displayTotal = useCountUp(total);

  return (
    <main className="flex h-dvh flex-col px-4 pb-4 pt-4">
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="홈으로" className="-ml-2 p-2">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-[22px] font-bold">집중 딸깍</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-base font-bold" style={{ color: grade.color }}>
          {grade.name}
        </p>
        <p className="text-[13px] text-dim">{grade.desc}</p>
        <div className="mt-3">
          <GroupedOdometer
            value={displayTotal}
            baseSizePx={64}
            color="var(--color-text)"
          />
        </div>
        <p className="mt-2 text-[13px] text-dim">이 브라우저의 누적 딸깍</p>
        {session > 0 && (
          <p className="tabular mt-1 text-[13px] text-win">이번 접속 +{session}</p>
        )}
        {next ? (
          <div className="mt-5 w-full max-w-72">
            <div className="flex justify-between text-[13px] text-dim">
              <span>
                다음 등급 <span style={{ color: next.color }}>{next.name}</span>
              </span>
              <span className="tabular">{next.min.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full origin-left rounded-full"
                style={{
                  transform: `scaleX(${progress})`,
                  backgroundColor: next.color,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-[13px] font-bold text-win">최고 등급 달성!</p>
        )}
      </div>

      <div className="flex h-[52dvh] pb-1">
        <TapArea onHit={tap} label="다다닥!" />
      </div>
    </main>
  );
}
