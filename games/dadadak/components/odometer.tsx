"use client";

import { memo, useEffect, useMemo, useState } from "react";

interface OdometerProps {
  value: number;
  sizePx: number;
  color?: string;
  className?: string;
  padTo?: number;
}

interface OdometerPart {
  char: string;
  key: string;
  type: "digit" | "separator";
}

const DIGITS = Array.from({ length: 10 }, (_, digit) => digit);

const DigitColumn = memo(function DigitColumn({ digit }: { digit: number }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      className="inline-block overflow-hidden align-bottom"
      style={{
        height: "1em",
        width: "1ch",
        opacity: entered ? 1 : 0,
        transition: "opacity 150ms ease-out",
      }}
    >
      <span
        className="flex flex-col"
        style={{
          // 9 -> 0 rollover intentionally takes the direct reverse path.
          transform: `translateY(-${entered ? digit : 0}em)`,
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {DIGITS.map((item) => (
          <span
            key={item}
            className="block text-center"
            style={{ height: "1em", lineHeight: 1 }}
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  );
});

function displayFor(value: number, padTo?: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

  if (padTo != null) {
    return String(normalized).padStart(Math.max(0, Math.trunc(padTo)), "0");
  }

  return normalized.toLocaleString("ko-KR");
}

function partsFor(display: string): OdometerPart[] {
  const chars = Array.from(display);
  let digitIndex = 0;
  const parts: OdometerPart[] = [];

  // Keys are assigned from the right so existing place-value columns survive
  // when separators or new leading digits appear.
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index];
    if (/\d/.test(char)) {
      parts.unshift({ char, key: `digit-${digitIndex}`, type: "digit" });
      digitIndex += 1;
      continue;
    }
    parts.unshift({ char, key: `separator-${digitIndex}`, type: "separator" });
  }

  return parts;
}

export function Odometer({
  value,
  sizePx,
  color = "var(--color-primary)",
  className = "",
  padTo,
}: OdometerProps) {
  const display = displayFor(value, padTo);
  const parts = useMemo(() => partsFor(display), [display]);

  return (
    <span
      role="img"
      aria-label={display}
      className={`tabular inline-flex items-baseline font-extrabold ${className}`}
      style={{ color, display: "inline-flex", fontSize: sizePx, lineHeight: 1 }}
    >
      <span aria-hidden className="inline-flex items-baseline">
        {parts.map((part) =>
          part.type === "digit" ? (
            <DigitColumn key={part.key} digit={Number(part.char)} />
          ) : (
            <span key={part.key} className="inline-block px-[0.04em]">
              {part.char}
            </span>
          )
        )}
      </span>
    </span>
  );
}
