export type MissionMetric =
  | "daily_taps"
  | "battles_finished"
  | "best_cps_today"
  | "versus_played"
  | "ghost_played"
  | "burst_played";

export interface MissionDef {
  id: string;
  title: string;
  target: number;
  reward: number;
  metric: MissionMetric;
}

export const MISSION_POOL: MissionDef[] = [
  {
    id: "taps-300",
    title: "무한 딸깍 300회 적립",
    target: 300,
    reward: 200,
    metric: "daily_taps",
  },
  {
    id: "battles-3",
    title: "배틀 3판 완료",
    target: 3,
    reward: 300,
    metric: "battles_finished",
  },
  {
    id: "cps-8",
    title: "CPS 8.0 이상 기록",
    target: 8,
    reward: 200,
    metric: "best_cps_today",
  },
  {
    id: "versus-1",
    title: "대결 모드 1판 (랜덤·방·이벤트)",
    target: 1,
    reward: 200,
    metric: "versus_played",
  },
  {
    id: "ghost-1",
    title: "도장깨기 1판",
    target: 1,
    reward: 250,
    metric: "ghost_played",
  },
  {
    id: "burst-1",
    title: "3초 버스트 1판",
    target: 1,
    reward: 150,
    metric: "burst_played",
  },
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function missionsForDate(dateStr: string): MissionDef[] {
  return [...MISSION_POOL]
    .sort((a, b) => hashString(`${dateStr}:${a.id}`) - hashString(`${dateStr}:${b.id}`))
    .slice(0, 3);
}
