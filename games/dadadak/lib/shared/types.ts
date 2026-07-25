// ── DB 엔티티 ──────────────────────────────────────────────

export interface User {
  id: string;
  nickname: string;
  school_id: string | null;
  region_code: string | null;
  best_cps: number;
  best_burst_cps: number;
  total_clicks: number; // 영구 누적 딸깍 (flagged 매치 제외)
  sound_id: string | null;
  skin_id: string | null;
  character_id: string | null;
  streak_days: number;
  streak_last_day: string | null;
  created_at: string;
}

export interface School {
  id: string;
  name: string;
  region_code: string;
}

export type MatchMode = "solo" | "duel" | "room" | "ghost" | "event";
export type MatchStatus = "playing" | "finished" | "aborted";

export interface Match {
  id: string;
  mode: MatchMode;
  duration_sec: number;
  race_target: number | null;
  golden: 0 | 1;
  status: MatchStatus;
  created_at: string;
}

export interface MatchPlayer {
  match_id: string;
  user_id: string;
  nickname: string; // join으로 채움
  final_count: number;
  score: number | null;
  cps: number;
  rank: number;
  flagged: 0 | 1;
}

export type RoomStatus = "waiting" | "playing" | "finished";

export interface Room {
  id: string;
  code: string;
  host_user_id: string;
  max_players: number;
  status: RoomStatus;
  created_at: string;
}

export interface DailyStat {
  date: string;
  visits: number;
  matches_played: number;
  share_clicks: number;
  invite_joins: number;
  clicker_visits: number;
  clicker_interest: number;
  flagged_ratio?: number; // 어드민 응답에서 계산해 첨부
}

export type EventStatus = "waiting" | "playing" | "finished" | "skipped";

export interface EventRound {
  id: string;
  scheduled_at: string;
  match_id: string | null;
  status: EventStatus;
  created_at: string;
}

// ── 랭킹 ──────────────────────────────────────────────────

export type RankScope = "national" | "region" | "school";
export type RankPeriod = "daily" | "weekly";

export interface RankingEntry {
  user_id: string;
  nickname: string;
  best_cps: number;
  rank: number;
}

export interface MyRank {
  rank: number | null;
  best_cps: number | null;
}

// ── 소켓 페이로드 (PRD 7.2 — startAt에 serverNow·matchId 보강) ──

export interface MatchFoundPayload {
  matchId: string;
  opponent: { userId: string; nickname: string };
}

export interface RoomStatePayload {
  code: string;
  hostId: string;
  status: RoomStatus;
  maxPlayers: number;
  players: { userId: string; nickname: string; connected: boolean }[];
  notice?: string; // 호스트 승계 등 토스트용
}

export interface BattleCountdownPayload {
  matchId: string;
  mode: MatchMode;
  roomCode?: string;
  startAt: number; // 서버 epoch ms
  serverNow: number; // 클라이언트 시계 오차 보정용
  durationMs: number;
  raceTarget?: number;
  golden?: boolean;
  players: { userId: string; nickname: string; isGhost?: boolean }[];
}

export interface BattleSyncPayload {
  matchId: string;
  counts: Record<string, number>; // 골든 배틀에서는 score, 그 외에는 total
  remainMs: number;
  elapsedMs?: number;
  raceTarget?: number;
  // sync에 포함해 재접속·패킷 유실 후에도 현재 골든 구간 상태가 자기치유되게 한다.
  goldenRemainMs?: number;
  participants?: number;
}

export interface EventStatePayload {
  nextStartAt: number;
  serverNow: number;
  durationSec: number;
  participants: number;
  joined: boolean;
  status: "waiting" | "playing";
}

export interface BattleResultEntry {
  userId: string;
  nickname: string;
  finalCount: number;
  score?: number;
  cps: number;
  rank: number;
  flagged: boolean;
  newBest: boolean;
  topPercent: number | null; // 전국 상위 % (flagged면 null)
  isGhost?: boolean; // 고스트 대결의 재생 기록 (DB 미저장)
}

export interface BattleEndPayload {
  matchId: string;
  mode: MatchMode;
  roomCode?: string;
  // 고스트 대결의 원본 기록 (다시 도전 링크용)
  ghostSource?: { matchId: string; userId: string };
  results: BattleResultEntry[];
}

export interface AppErrorPayload {
  code: string;
  message: string; // 사용자 표시용 한국어
}

// ── REST 공통 ─────────────────────────────────────────────

export interface ApiError {
  error: { code: string; message: string };
}
