"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Counter } from "@/components/counter";
import { OrientationGuard } from "@/components/orientation-guard";
import { TapArea } from "@/components/tap-area";
import { TimerBar } from "@/components/timer-bar";
import { submitRun } from "@/lib/client/store";
import {
  BURST,
  formatDuration,
  SOLO_DURATION_OPTIONS,
  type SoloDurationSec,
} from "@/lib/shared/constants";

type Phase = "idle" | "countdown" | "playing" | "finished" | "aborted";
type Submission = "ok" | "skipped" | "error" | null;

export default function SoloPage() {
  const [duration, setDuration] = useState<SoloDurationSec>(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [count, setCount] = useState(0);
  const [remainMs, setRemainMs] = useState(10_000);
  const [result, setResult] = useState<{ taps: number; cps: number } | null>(
    null
  );
  const [submission, setSubmission] = useState<Submission>(null);
  const phaseRef = useRef<Phase>("idle");
  const countRef = useRef(0);
  const durationRef = useRef<SoloDurationSec>(10);
  const startAtRef = useRef(0);
  const endAtRef = useRef(0);

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const start = useCallback(() => {
    const startAt = Date.now() + 3_000;
    durationRef.current = duration;
    startAtRef.current = startAt;
    endAtRef.current = startAt + duration * 1_000;
    countRef.current = 0;
    setCount(0);
    setCountdown(3);
    setRemainMs(duration * 1_000);
    setResult(null);
    setSubmission(null);
    changePhase("countdown");
  }, [changePhase, duration]);

  const finish = useCallback(() => {
    if (phaseRef.current === "finished") return;
    const taps = countRef.current;
    const measuredDuration = durationRef.current;
    const cps = taps / measuredDuration;
    changePhase("finished");
    setRemainMs(0);
    setResult({ taps, cps });
    if (measuredDuration >= 10) {
      void submitRun(cps, taps).then(setSubmission);
    }
  }, [changePhase]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;

    const tick = () => {
      const now = Date.now();
      if (now < startAtRef.current) {
        setCountdown(Math.max(1, Math.ceil((startAtRef.current - now) / 1_000)));
        return;
      }
      if (now < endAtRef.current) {
        if (phaseRef.current !== "playing") changePhase("playing");
        setRemainMs(endAtRef.current - now);
        return;
      }
      finish();
    };

    tick();
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [changePhase, finish, phase]);

  useEffect(() => {
    const onVisibility = () => {
      if (
        document.visibilityState === "hidden" &&
        (phaseRef.current === "countdown" || phaseRef.current === "playing")
      ) {
        changePhase("aborted");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [changePhase]);

  const hit = (amount: number) => {
    if (phaseRef.current === "idle" || phaseRef.current === "aborted") {
      start();
      return;
    }
    if (phaseRef.current !== "playing" || document.visibilityState !== "visible") {
      return;
    }
    if (Date.now() >= endAtRef.current) {
      finish();
      return;
    }
    countRef.current += amount;
    setCount(countRef.current);
  };

  const reset = () => {
    countRef.current = 0;
    setCount(0);
    setResult(null);
    setSubmission(null);
    changePhase("idle");
  };

  return (
    <main className="flex h-dvh flex-col px-4 pb-4 pt-4">
      <OrientationGuard />
      <header className="flex items-center gap-2">
        <Link href="/" aria-label="홈으로" className="-ml-2 p-2">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-[22px] font-bold">솔로 측정</h1>
      </header>

      {phase === "finished" && result ? (
        <section className="flex flex-1 flex-col justify-center">
          <div className="card pop-in p-6 text-center">
            <p className="text-[13px] text-dim">
              {durationRef.current === BURST.DURATION_SEC
                ? "3초 버스트 결과"
                : `${formatDuration(durationRef.current)} 측정 결과`}
            </p>
            <p className="mt-3 flex items-baseline justify-center gap-2">
              <span className="tabular text-[72px] font-extrabold text-primary">
                {result.cps.toFixed(1)}
              </span>
              <span className="text-lg font-bold text-dim">CPS</span>
            </p>
            <p className="mt-4 text-base font-bold">총 {result.taps}클릭</p>
            {durationRef.current < 10 ? (
              <p className="mt-3 text-[13px] text-dim">
                3초 버스트는 랭킹에 제출되지 않아요
              </p>
            ) : submission === "skipped" || submission === "error" ? (
              <p className="mt-3 text-[13px] text-dim">
                플레이는 저장됐지만 온라인 랭킹 제출은 생략됐어요
              </p>
            ) : submission === "ok" ? (
              <p className="mt-3 text-[13px] text-win">
                최고 기록을 확인했어요
              </p>
            ) : (
              <p className="mt-3 text-[13px] text-dim">기록 확인 중...</p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <button type="button" onClick={reset} className="btn-primary">
              다시 측정
            </button>
            <Link href="/" className="py-2 text-center text-base font-bold text-dim">
              홈으로
            </Link>
          </div>
        </section>
      ) : phase === "aborted" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-lg font-bold">화면을 벗어나서 무효 처리됐어요</p>
          <button type="button" onClick={reset} className="btn-primary max-w-60">
            다시 측정
          </button>
        </section>
      ) : (
        <>
          <div className="mt-4 h-6">
            {phase === "playing" && (
              <TimerBar
                remainMs={remainMs}
                durationMs={durationRef.current * 1_000}
              />
            )}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center">
            {phase === "countdown" ? (
              <Counter value={countdown} color="text" sizePx={96} />
            ) : phase === "playing" ? (
              <div className="text-center">
                <Counter value={count} color="primary" sizePx={96} />
                <p className="mt-3 text-[13px] text-dim">클릭</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="flex justify-center gap-2">
                  {SOLO_DURATION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDuration(option)}
                      className={`rounded-full px-4 py-1 text-[13px] font-bold ${
                        duration === option
                          ? "bg-primary text-primary-ink"
                          : "border border-surface-border text-dim"
                      }`}
                    >
                      {option === BURST.DURATION_SEC
                        ? "3초 버스트"
                        : formatDuration(option)}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-lg font-bold">
                  화면을 탭하거나 아무 키나 누르면
                </p>
                <p className="mt-1 text-lg font-bold">
                  3초 뒤 {formatDuration(duration)} 측정이 시작돼요
                </p>
              </div>
            )}
          </div>
          <div className="flex h-[52dvh] pb-1">
            <TapArea
              onHit={hit}
              label={
                phase === "playing"
                  ? "다다닥!"
                  : phase === "countdown"
                    ? "준비..."
                    : "탭해서 시작"
              }
            />
          </div>
        </>
      )}
    </main>
  );
}
