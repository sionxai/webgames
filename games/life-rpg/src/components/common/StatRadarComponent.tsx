import React from "react";

import { STATS_DEF } from "@/lib/constants";
import type { StatKey, Stats } from "@/types/game";

type StatRadarComponentProps = {
  stats: Stats;
  statMax: number;
};

export default function StatRadarComponent({ stats, statMax }: StatRadarComponentProps) {
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const keys = Object.keys(STATS_DEF) as StatKey[];
  const normalize = (value: number) => Math.min(value / statMax, 1);
  const getCoords = (value: number, index: number) => {
    const angle = (Math.PI * 2 * index) / keys.length - Math.PI / 2;
    const r = radius * normalize(value);
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };
  const points = keys.map((key, index) => getCoords(stats[key], index).join(",")).join(" ");

  return (
    <svg width={size} height={size} className="overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={keys
            .map((_, index) => {
              const angle = (Math.PI * 2 * index) / keys.length - Math.PI / 2;
              const r = radius * scale;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
          className="dark:stroke-gray-700"
        />
      ))}
      <polygon points={points} fill="rgba(99, 102, 241, 0.3)" stroke="#6366f1" strokeWidth="3" />
      {keys.map((key, index) => {
        const angle = (Math.PI * 2 * index) / keys.length - Math.PI / 2;
        const x = center + (radius + 30) * Math.cos(angle);
        const y = center + (radius + 20) * Math.sin(angle);
        const Icon = STATS_DEF[key].icon;
        return (
          <g key={key}>
            <foreignObject x={x - 20} y={y - 15} width="40" height="40">
              <div className="flex flex-col items-center justify-center text-center">
                <div className={`p-1 rounded-full bg-white shadow-sm ${STATS_DEF[key].color}`}>
                  <Icon size={14} />
                </div>
                <span className="text-[9px] font-bold text-gray-500 mt-1">{STATS_DEF[key].label}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
