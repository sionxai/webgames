"use client";
import { useEffect, useRef, useState } from "react";
import { playClick } from "@/lib/client/sound";

/**
 * 배틀 탭 타깃 — 화면 하단 대면적 (PRD 12.4).
 * 입력 인정: 포인터 다운(터치는 손가락마다 이벤트 발생 → 멀티터치 각각 인정),
 * 키보드는 keydown(repeat 제외) — PRD F6.
 */
export function TapArea({
  onHit,
  disabled,
  label,
  soundId,
  soundPitch,
  skin,
}: {
  onHit: (n: number) => void;
  disabled?: boolean;
  label: string;
  soundId?: string;
  soundPitch?: number;
  skin?: { bg: string; ink: string; edge: string };
}) {
  const [pressed, setPressed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;
  const onHitRef = useRef(onHit);
  onHitRef.current = onHit;
  const soundIdRef = useRef(soundId);
  const soundPitchRef = useRef(soundPitch);
  soundIdRef.current = soundId;
  soundPitchRef.current = soundPitch;

  const flashPress = () => {
    setPressed(true);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(false), 80);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 안티매크로 1차: 스크립트로 합성한 이벤트(isTrusted=false)는 무시
      if (!e.isTrusted) return;
      if (disabledRef.current || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === " " && e.target === document.body) e.preventDefault();
      if (soundIdRef.current) {
        playClick(soundIdRef.current, { pitch: soundPitchRef.current });
      }
      onHitRef.current(1);
      setPressed(true);
      setTimeout(() => setPressed(false), 80);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    };
  }, []);

  const rootStyle = { touchAction: "none" } as const;
  const topFaceStyle = {
    backgroundColor: skin?.bg ?? "var(--color-primary)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    color: skin?.ink ?? "var(--color-primary-ink)",
  };
  const sideWallStyle = {
    backgroundColor: skin?.edge ?? "var(--color-primary-edge)",
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="flex w-full flex-1 select-none items-center justify-center bg-transparent p-0 text-[22px] font-extrabold disabled:opacity-40"
      style={rootStyle}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!e.nativeEvent.isTrusted) return; // 안티매크로 1차
        if (disabledRef.current) return;
        if (soundId) playClick(soundId, { pitch: soundPitch });
        onHitRef.current(1);
        flashPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pointer-events-none relative flex h-[62%] max-h-[200px] w-[86%] max-w-[340px] items-end justify-center">
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-[14px] w-[106%] -translate-x-1/2 rounded-[10px] bg-surface-border"
        />
        <span className="relative z-10 block h-full w-full">
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-0 h-[12px] w-full origin-bottom rounded-[18px] transition-transform ease-out ${
              pressed
                ? "scale-y-[0.25] duration-[90ms]"
                : "scale-y-100 duration-[120ms]"
            }`}
            style={sideWallStyle}
          />
          <span
            className={`absolute left-0 top-0 flex h-[calc(100%-12px)] w-full items-center justify-center rounded-[18px] border px-4 text-center transition-[transform,filter] ease-out ${
              pressed
                ? "translate-y-[9px] brightness-[0.95] duration-[90ms]"
                : "translate-y-0 duration-[120ms]"
            }`}
            style={topFaceStyle}
          >
            {label}
          </span>
        </span>
      </span>
    </button>
  );
}
