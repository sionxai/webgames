import type { Stats } from "@/types/game";

export const DEFAULT_STAT_MAX = 300;

export function calcOverallScore(stats: Stats, statMax = DEFAULT_STAT_MAX) {
  const h = stats.health / statMax;
  const i = stats.intelligence / statMax;
  const f = stats.focus / statMax;
  const m = stats.immunity / statMax;
  const e = stats.eq / statMax;
  const w = stats.willpower / statMax;

  const arr = [h, i, f, m, e, w];
  const wh = 0.2;
  const wi = 0.2;
  const wf = 0.2;
  const wm = 0.15;
  const we = 0.1;
  const ww = 0.15;

  const mu = wh * h + wi * i + wf * f + wm * m + we * e + ww * w;
  const xMax = Math.max(...arr);
  let balance = 0;
  if (xMax > 0) {
    const xMin = Math.min(...arr);
    balance = xMin / xMax;
  }
  const score = 100 * mu * (0.7 + 0.3 * balance);
  return Number(score.toFixed(2));
}

export function toNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? num : fallback;
}

export function formatMoney(value: number) {
  return value.toFixed(2);
}

export function formatChangeValue(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(num);
  const digits = abs > 0 && abs < 0.1 ? 3 : 2;
  return num.toFixed(digits);
}

export function roundChangeValue(value: number, digits = 4) {
  const num = Number.isFinite(value) ? value : 0;
  return Number(num.toFixed(digits));
}
