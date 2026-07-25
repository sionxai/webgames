// 배틀 파라미터의 유일한 출처 (PRD F6·F7, A1·A2)
export const BATTLE = {
  DURATION_MS: 10_000,
  COUNTDOWN_MS: 3_000,
  SYNC_INTERVAL_MS: 250,
  TICK_INTERVAL_MS: 250,
  WINDOW_MS: 250,
  WINDOW_MAX_CLICKS: 8, // 윈도우당 절삭 상한 → 순간 최대 32CPS
  FLAG_AVG_CPS: 20, // 경기 평균 초과 시 flagged=1
  JOIN_TIMEOUT_MS: 7_000, // 듀얼 성사 후 전원 접속 대기 상한
  // 매크로 휴리스틱: 윈도우별 클릭 분포가 비정상적으로 균일하면 flagged.
  // 사람은 클릭 간격에 흔들림(윈도우 편차)이 크고, 오토클리커는 거의 일정하다.
  // [가정: 임계값은 운영 데이터로 재보정]
  MACRO_MIN_MEAN_PER_WINDOW: 2, // 평균 8CPS 이상에서만 검사 (저속 오탐 방지)
  MACRO_CV_THRESHOLD: 0.15, // 변동계수(std/mean)가 이보다 작으면 기계 의심
} as const;

export const BURST = {
  DURATION_SEC: 3,
  // [가정: 3초 초단기 측정은 지터 연타로 평균 20CPS를 정상적으로 넘길 수 있어 완화]
  FLAG_AVG_CPS: 26,
} as const;

export const EVENT = {
  DURATION_SEC: 30,
  MAX_PLAYERS: 100,
  MIN_PLAYERS: 2,
  DEFAULT_INTERVAL_SEC: 3600,
  SYNC_TOP_N: 10,
  LARGE_BATTLE_THRESHOLD: 12,
} as const;

export const RACE = {
  TARGETS: [50, 100],
  TIMEOUT_MS: 60_000,
} as const;
export type RaceTarget = (typeof RACE.TARGETS)[number];

export function isRaceTarget(value: unknown): value is RaceTarget {
  return RACE.TARGETS.includes(value as RaceTarget);
}

export const GOLDEN = {
  WINDOW_MS: 2_000,
  MULTIPLIER: 2,
  MIN_START_MS: 2_000,
  END_MARGIN_MS: 500,
  MIN_GAP_MS: 3_000,
} as const;

/** 배틀 길이(초)별 골든 구간 수: 10초→1, 30초→2, 60초→3 */
export function goldenWindowCount(durationSec: number): number {
  if (durationSec >= 60) return 3;
  if (durationSec >= 30) return 2;
  if (durationSec >= 10) return 1;
  return 0;
}

// 배틀 시간 옵션 (초) — 솔로·방 대결에서 선택, 랜덤 매치는 10초 고정
export const DURATION_OPTIONS = [10, 30, 60] as const;
export type DurationSec = (typeof DURATION_OPTIONS)[number];
export const SOLO_DURATION_OPTIONS = [3, 10, 30, 60] as const;
export type SoloDurationSec = (typeof SOLO_DURATION_OPTIONS)[number];

export function isDurationSec(value: unknown): value is DurationSec {
  return DURATION_OPTIONS.includes(value as DurationSec);
}

export function isSoloDurationSec(value: unknown): value is SoloDurationSec {
  return SOLO_DURATION_OPTIONS.includes(value as SoloDurationSec);
}

export function formatDuration(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)}분` : `${sec}초`;
}

export const ROOM = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS_DEFAULT: 8,
  MAX_PLAYERS_LIMIT: 30,
  MAX_PLAYERS_OPTIONS: [8, 16, 30],
  EXPIRY_HOURS: 24,
  CODE_LENGTH: 6,
} as const;

// 무한 딸깍(영구 누적) 배치 저장 — 랭킹 미반영 재미 지표라 완화된 상한만 적용
export const TAP = {
  FLUSH_INTERVAL_MS: 3_000,
  MAX_DELTA_PER_REQ: 120, // 요청당 인정 상한
  REQ_PER_MIN: 12, // 사용자당 분당 요청 상한 → 지속 최대 약 24CPS
  DAILY_CAP: 50_000, // 일일 적립 상한 (매크로 등급 인플레 차단) [가정: 운영 데이터로 재보정]
} as const;

// 클리커 등급 — 키보드 스위치 세계관 (누적 딸깍 기준, 오름차순 유지)
// 딸깍이/키캡 세대 타깃: "나 지금 갈축임" 자체가 공유 밈이 되도록 설계
export interface Grade {
  min: number;
  name: string;
  color: string; // 뱃지 색 (다크 배경 위 AA 대비 확인된 값만)
  desc: string;
}

export const GRADES: Grade[] = [
  { min: 0, name: "뽁뽁이", color: "#9AA3B8", desc: "일단 눌러보는 중" },
  { min: 500, name: "멤브레인", color: "#9AA3B8", desc: "물렁하지만 진심" },
  { min: 3_000, name: "펜타그래프", color: "#F5F7FF", desc: "노트북으로 단련됨" },
  { min: 10_000, name: "적축", color: "#FF6B7E", desc: "소리 없이 강하다" },
  { min: 30_000, name: "갈축", color: "#D9A05B", desc: "구분감을 아는 자" },
  { min: 100_000, name: "청축", color: "#4DA3FF", desc: "딸깍의 정점" },
  { min: 300_000, name: "은축", color: "#D7DDEB", desc: "반응속도가 다르다" },
  { min: 1_000_000, name: "광축", color: "#FFD60A", desc: "빛의 속도로 딸깍" },
  { min: 5_000_000, name: "무접점", color: "#3DDC84", desc: "경지에 이르렀다" },
];

export function gradeFor(totalClicks: number): Grade {
  let current = GRADES[0];
  for (const g of GRADES) if (totalClicks >= g.min) current = g;
  return current;
}

/** 다음 등급 목표. 최고 등급 도달 시 null */
export function nextGrade(totalClicks: number): Grade | null {
  for (const g of GRADES) if (totalClicks < g.min) return g;
  return null;
}

export const NICKNAME = { MIN: 2, MAX: 8 } as const;

export const QUEUE_SUGGEST_ALTERNATIVE_MS = 30_000;

// 시도 17개 (행정표준코드 앞 2자리 기준)
export const SIDO: { code: string; name: string }[] = [
  { code: "11", name: "서울" },
  { code: "26", name: "부산" },
  { code: "27", name: "대구" },
  { code: "28", name: "인천" },
  { code: "29", name: "광주" },
  { code: "30", name: "대전" },
  { code: "31", name: "울산" },
  { code: "36", name: "세종" },
  { code: "41", name: "경기" },
  { code: "51", name: "강원" },
  { code: "43", name: "충북" },
  { code: "44", name: "충남" },
  { code: "52", name: "전북" },
  { code: "46", name: "전남" },
  { code: "47", name: "경북" },
  { code: "48", name: "경남" },
  { code: "50", name: "제주" },
];

export const SIDO_NAME = new Map(SIDO.map((s) => [s.code, s.name]));

export function isValidRegionCode(code: string): boolean {
  return SIDO.some((s) => s.code === code);
}

/** 랭킹 등 공개 표기: `닉네임#뒤4자리` (uuid 끝 4자) */
export function displayName(nickname: string, userId: string): string {
  return `${nickname}#${userId.slice(-4)}`;
}
