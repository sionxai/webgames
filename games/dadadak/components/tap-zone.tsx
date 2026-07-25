"use client";

import { Flame } from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { GroupedOdometer } from "@/components/grouped-odometer";
import { playClick } from "@/lib/client/sound";
import { useCountUp } from "@/lib/client/use-count-up";
import { useTaps } from "@/lib/client/use-taps";
import {
  characterById,
  characterExpr,
  characterFrames,
} from "@/lib/shared/characters";
import { gradeFor, nextGrade } from "@/lib/shared/constants";
import { soundForGradeName } from "@/lib/shared/sounds";

interface Floater {
  id: number;
  x: number;
  y: number;
  drift: number;
  tilt: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface Combo {
  count: number;
  fading: boolean;
}

interface Milestone {
  id: number;
  value: number;
}

type Timer = ReturnType<typeof setTimeout>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 홈의 주 콘텐츠 — 포인터와 키보드 입력으로 누적 딸깍을 적립한다. */
export function TapZone() {
  const { total, session, tap } = useTaps();
  // 서버 권위 판정이 없는 구성이라 상한(capped) 상태는 존재하지 않는다.
  const capped = false;
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [combo, setCombo] = useState<Combo | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [held, setHeld] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [proudFace, setProudFace] = useState(false);
  const [drowsy, setDrowsy] = useState(false);
  const [hopFrame, setHopFrame] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const zoneRef = useRef<HTMLButtonElement | null>(null);
  const effectIdRef = useRef(0);
  const timersRef = useRef<Set<Timer>>(new Set());
  const celebrateTimerRef = useRef<Timer | null>(null);
  const heldRef = useRef(held);
  const celebrateRef = useRef(celebrate);
  const cappedRef = useRef(capped);
  const comboHighRef = useRef(false);
  const streakRef = useRef(false);
  const drowsyRef = useRef(false);
  const inactivityTimerRef = useRef<Timer | null>(null);
  const comboIdleTimerRef = useRef<Timer | null>(null);
  const comboRemoveTimerRef = useRef<Timer | null>(null);
  const milestoneTimerRef = useRef<Timer | null>(null);
  const lastTapTsRef = useRef(0);
  const comboCountRef = useRef(0);
  const previousTotalRef = useRef(total);
  const tapRef = useRef(tap);
  const soundIdRef = useRef<string | undefined>(undefined);

  tapRef.current = tap;
  heldRef.current = held;
  celebrateRef.current = celebrate;

  const grade = gradeFor(total);
  // 사운드·캐릭터 선택 저장은 아직 없다. 등급에 맞는 기본 사운드와 기본 캐릭터를 쓴다.
  const soundId = soundForGradeName(grade.name).id;
  soundIdRef.current = soundId;
  const next = nextGrade(total);
  const progress = next ? Math.min(1, total / next.min) : 1;
  // 최고 기록·연속일 배지는 값이 있을 때만 뜬다(0이면 숨김).
  const best = 0;
  const streakDays = 0;
  const displayTotal = useCountUp(total);
  const character = characterById(undefined);
  const motion = characterFrames(character);
  const expr = characterExpr(character);
  const comboHigh = combo !== null && combo.count >= 10;
  cappedRef.current = capped;
  comboHighRef.current = comboHigh;
  streakRef.current = streakDays >= 1;
  drowsyRef.current = drowsy;

  const activeSrc = held
    ? motion[1]
    : hopFrame === 2
      ? motion[2]
      : hopFrame === 3
        ? motion[3]
        : celebrate
          ? expr.star
          : capped
            ? expr.sleepy
            : comboHigh
              ? expr.happy
              : drowsy
                ? expr.sleepy
                : blinking
                  ? expr.blink
                  : proudFace
                    ? expr.proud
                    : expr.neutral;
  // 완전 정지(표정만·모션 없음)일 때만 숨쉬기
  const idle =
    !held && hopFrame === null && !celebrate && !reducedMotion;

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timer: Timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delayMs);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const clearTimer = useCallback((timer: Timer | null) => {
    if (timer === null) return;
    clearTimeout(timer);
    timersRef.current.delete(timer);
  }, []);

  const showEffects = useCallback(
    (x: number, y: number) => {
      const floaterId = effectIdRef.current + 1;
      effectIdRef.current = floaterId;
      const floater: Floater = {
        id: floaterId,
        x,
        y,
        drift: (Math.random() - 0.5) * 20,
        tilt: (Math.random() - 0.5) * 10,
      };
      setFloaters((current) => [...current, floater].slice(-6));
      schedule(() => {
        setFloaters((current) =>
          current.filter((item) => item.id !== floaterId)
        );
      }, 520);

      const rippleId = effectIdRef.current + 1;
      effectIdRef.current = rippleId;
      setRipples((current) => [...current, { id: rippleId, x, y }].slice(-4));
      schedule(() => {
        setRipples((current) =>
          current.filter((item) => item.id !== rippleId)
        );
      }, 360);

      clearTimer(comboIdleTimerRef.current);
      clearTimer(comboRemoveTimerRef.current);
      comboIdleTimerRef.current = null;
      comboRemoveTimerRef.current = null;

      const now = performance.now();
      const count =
        lastTapTsRef.current > 0 && now - lastTapTsRef.current <= 800
          ? comboCountRef.current + 1
          : 1;
      lastTapTsRef.current = now;
      comboCountRef.current = count;
      setCombo(count >= 5 ? { count, fading: false } : null);

      comboIdleTimerRef.current = schedule(() => {
        comboIdleTimerRef.current = null;
        lastTapTsRef.current = 0;
        comboCountRef.current = 0;

        if (count < 5) {
          setCombo(null);
          return;
        }

        setCombo((current) =>
          current?.count === count ? { ...current, fading: true } : current
        );
        comboRemoveTimerRef.current = schedule(() => {
          comboRemoveTimerRef.current = null;
          setCombo((current) =>
            current?.count === count ? null : current
          );
        }, 300);
      }, 800);
    },
    [clearTimer, schedule]
  );

  const recordTap = useCallback(
    (x: number, y: number) => {
      if (soundIdRef.current) playClick(soundIdRef.current);
      tapRef.current(1);
      showEffects(x, y);
      setDrowsy(false);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => setDrowsy(true), 12_000);
    },
    [showEffects]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      if (event.key === " " && event.target === document.body) {
        event.preventDefault();
      }

      const rect = zoneRef.current?.getBoundingClientRect();
      if (!rect) return;
      recordTap(rect.width / 2, rect.height * 0.3);
      setHeld(true);
    };
    // 키를 떼거나 포커스를 잃으면 찌부 해제 (눌린 채 멈추는 것 방지)
    const onKeyUp = () => setHeld(false);
    const onBlur = () => setHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [recordTap]);

  useEffect(() => {
    const previousBucket = Math.floor(previousTotalRef.current / 1_000);
    const currentBucket = Math.floor(total / 1_000);
    previousTotalRef.current = total;
    if (currentBucket <= previousBucket) return;

    clearTimer(milestoneTimerRef.current);
    const id = effectIdRef.current + 1;
    effectIdRef.current = id;
    setMilestone({ id, value: currentBucket * 1_000 });
    clearTimer(celebrateTimerRef.current);
    setCelebrate(true);
    celebrateTimerRef.current = schedule(() => {
      celebrateTimerRef.current = null;
      setCelebrate(false);
    }, 320);
    milestoneTimerRef.current = schedule(() => {
      milestoneTimerRef.current = null;
      setMilestone((current) => (current?.id === id ? null : current));
    }, 520);
  }, [clearTimer, schedule, total]);

  // 멀미 방지 설정 감지 — idle 애니메이션 전면 정지
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // idle 마이크로액션 — 지속 표정이 없을 때 3~6초마다 반응한다
  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    const timers: Timer[] = [];
    const roll = () => {
      const delay = 4500 + Math.random() * 3500;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          if (
            !heldRef.current &&
            !celebrateRef.current &&
            !cappedRef.current &&
            !comboHighRef.current &&
            !drowsyRef.current
          ) {
            const r = Math.random();
            if (r < 0.6) {
              // 느린 눈 감음 (트위치 느낌 방지)
              setBlinking(true);
              timers.push(setTimeout(() => setBlinking(false), 420));
            } else if (r < 0.85) {
              setHopFrame(2);
              timers.push(setTimeout(() => setHopFrame(3), 150));
              timers.push(setTimeout(() => setHopFrame(null), 260));
            } else if (streakRef.current) {
              setProudFace(true);
              timers.push(setTimeout(() => setProudFace(false), 3000));
            } else {
              setBlinking(true);
              timers.push(setTimeout(() => setBlinking(false), 420));
            }
          }
          roll();
        }, delay)
      );
    };
    roll();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reducedMotion]);

  // 첫 진입 후 오래 입력이 없으면 졸림 (누르면 recordTap에서 깬다)
  useEffect(() => {
    inactivityTimerRef.current = setTimeout(() => setDrowsy(true), 12_000);
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      comboIdleTimerRef.current = null;
      comboRemoveTimerRef.current = null;
      milestoneTimerRef.current = null;
      celebrateTimerRef.current = null;
    };
  }, []);

  return (
    <button
      ref={zoneRef}
      type="button"
      aria-label="딸깍 누적하기"
      className="dot-grid relative flex min-h-0 w-full flex-1 select-none overflow-hidden rounded-[20px] border border-surface-border bg-surface"
      style={{ touchAction: "manipulation" }}
      onPointerDown={(event) => {
        if (!event.nativeEvent.isTrusted) return;
        const rect = zoneRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = clamp(event.clientX - rect.left, 24, rect.width - 24);
        const y = clamp(event.clientY - rect.top - 30, 24, rect.height - 40);
        recordTap(x, y);
        setHeld(true);
      }}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-2">
        {/* 캐릭터 웰 — 누르면 찌부, 마일스톤은 별눈, idle은 표정/폴짝 */}
        <div
          className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[14px] border border-surface-border bg-bg transition-transform duration-[90ms] ease-out"
          style={{
            transformOrigin: "center bottom",
            transform: held
              ? "translateY(5px) scaleX(1.06) scaleY(0.9)"
              : celebrate
                ? "translateY(-6px) scale(1.05)"
                : hopFrame === 3
                  ? "translateY(0) scaleX(1.05) scaleY(0.9)"
                  : "translateY(0) scale(1)",
          }}
        >
          <div
            className={`relative h-full w-full ${idle ? "mascot-breathe" : ""}`}
          >
            {[
              motion[1],
              motion[2],
              motion[3],
              expr.neutral,
              expr.blink,
              expr.happy,
              expr.star,
              expr.proud,
              expr.sleepy,
            ].map((src) => (
              <Image
                key={src}
                src={src}
                width={88}
                height={88}
                priority={src === expr.neutral}
                className="absolute inset-0 h-[88px] w-[88px] object-cover transition-opacity duration-[140ms] ease-out"
                style={{ opacity: activeSrc === src ? 1 : 0 }}
                alt=""
                aria-hidden
              />
            ))}
          </div>
        </div>

        <span
          className="rounded-full border px-3 py-0.5 text-[13px] font-bold"
          style={{ color: grade.color, borderColor: grade.color }}
        >
          {grade.name}
        </span>

        <span className="flex items-end justify-center gap-2">
          <GroupedOdometer value={displayTotal} baseSizePx={64} />
          <span className="mb-1 text-[13px] text-dim">딸깍</span>
        </span>

        <span className="flex items-center gap-2">
          <span
            role="progressbar"
            aria-label="다음 등급 진행도"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-[8px] w-[160px] overflow-hidden rounded-full bg-bg"
          >
            <span
              className="block h-full origin-left rounded-full"
              style={{
                transform: `scaleX(${progress})`,
                backgroundColor: next?.color ?? grade.color,
              }}
            />
          </span>
          {next ? (
            <span
              className="text-[12px] font-bold"
              style={{ color: next.color }}
            >
              {next.name}
            </span>
          ) : null}
        </span>

        <span className="flex min-h-5 items-center justify-center text-[13px]">
          {capped ? (
            <span className="text-danger">오늘 적립 한도 도달</span>
          ) : session > 0 ? (
            <span className="tabular text-win">+{session}</span>
          ) : streakDays >= 1 ? (
            <span className="inline-flex items-center gap-1 text-dim">
              <Flame className="h-[14px] w-[14px]" aria-hidden />
              <span>{streakDays}일 연속</span>
            </span>
          ) : (
            <span className="text-dim">아무 데나 눌러도 +1</span>
          )}
        </span>

        <span className="flex min-h-6 items-center justify-center gap-2">
          {best > 0 ? (
            <>
              <span className="text-[12px] font-bold text-dim">BEST</span>
              <span className="tabular text-[15px] font-extrabold">
                {best.toFixed(1)} CPS
              </span>
            </>
          ) : (
            <span className="text-[13px]">첫 기록을 세워보세요</span>
          )}
        </span>
      </div>

      {floaters.map((floater) => (
        <span
          key={floater.id}
          aria-hidden
          className="float-up pointer-events-none absolute tabular text-[18px] font-extrabold text-primary"
          style={
            {
              left: floater.x,
              top: floater.y,
              "--fl-drift": `${floater.drift}px`,
              "--fl-tilt": `${floater.tilt}deg`,
            } as CSSProperties
          }
        >
          +1
        </span>
      ))}

      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ripple.x, top: ripple.y }}
        >
          <span
            className="ripple-ring block h-full w-full rounded-full border-2"
            style={{ borderColor: grade.color }}
          />
        </span>
      ))}

      {combo ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2"
        >
          <span
            key={combo.count}
            className={`block tabular text-[20px] font-extrabold ${
              combo.fading ? "fade-out" : "count-pop"
            }`}
            style={{ color: grade.color }}
          >
            x{combo.count}
          </span>
        </span>
      ) : null}

      {milestone ? (
        <span
          key={milestone.id}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            className="burst-ring absolute h-24 w-24 rounded-full border-4"
            style={{ borderColor: grade.color }}
          />
          <span
            className="float-up absolute tabular text-[24px] font-extrabold"
            style={{ color: grade.color }}
          >
            {milestone.value.toLocaleString()}!
          </span>
        </span>
      ) : null}
    </button>
  );
}
