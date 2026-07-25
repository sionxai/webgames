"use client";

/** 배틀 카운터 숫자 — 값이 바뀔 때마다 팝 애니메이션 (PRD 12.6) */
export function Counter({
  value,
  color,
  sizePx = 72,
}: {
  value: number;
  color: "primary" | "rival" | "text";
  sizePx?: number;
}) {
  const colorClass =
    color === "primary"
      ? "text-primary"
      : color === "rival"
        ? "text-rival"
        : "text-text";
  return (
    <span
      key={value} // 리마운트로 애니메이션 재생 (텍스트 노드 하나라 비용 미미)
      className={`tabular count-pop inline-block font-extrabold ${colorClass}`}
      style={{ fontSize: sizePx }}
    >
      {value}
    </span>
  );
}
