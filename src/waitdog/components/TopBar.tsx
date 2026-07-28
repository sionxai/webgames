import type { RoomId } from "../types";

export type GameSpeed = 0 | 1 | 2 | 4;

export interface TopBarProps {
  day: number;
  minuteOfDay: number;
  speed: GameSpeed;
  ownerRoom: RoomId;
  ownerMoving: boolean;
  money: number;
  carePoints: number;
  foodLevel: number;
  waterLevel: number;
  salaryBonusPercent: number;
  pausedReason: string | null;
  ended: boolean;
  tutorialEnabled: boolean;
  onSpeedChange: (speed: GameSpeed) => void;
  onTutorialToggle: () => void;
}

const ROOM_NAMES: Record<RoomId, string> = {
  living: "생활방",
  kitchen: "부엌",
  toilet: "화장실",
};

const SPEEDS: ReadonlyArray<{ value: GameSpeed; label: string }> = [
  { value: 0, label: "⏸" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
];

const formatClock = (minuteOfDay: number): string => {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export function TopBar({
  day,
  minuteOfDay,
  speed,
  ownerRoom,
  ownerMoving,
  money,
  carePoints,
  foodLevel,
  waterLevel,
  salaryBonusPercent,
  pausedReason,
  ended,
  tutorialEnabled,
  onSpeedChange,
  onTutorialToggle,
}: TopBarProps) {
  const ownerState = pausedReason ??
    (ownerMoving ? "이동 중" : `${ROOM_NAMES[ownerRoom]}에 머무는 중`);
  const bowlsEmpty = foodLevel === 0 || waterLevel === 0;
  const bowlStatus = foodLevel === 0 && waterLevel === 0
    ? "밥·물 비었음"
    : foodLevel === 0
    ? "밥 비었음"
    : waterLevel === 0
    ? "물 비었음"
    : "밥·물 확인";

  return (
    <header className="top-bar lifestyle-topbar">
      <div className="brand-block" title="기다려, 멍!">
        <span aria-hidden="true">🐕</span>
        <h1>기다려멍</h1>
      </div>

      <div
        className="day-clock"
        aria-label={`Day ${day}, ${formatClock(minuteOfDay)}`}
      >
        <strong>Day {day}</strong>
        <span aria-hidden="true">·</span>
        <time>{formatClock(minuteOfDay)}</time>
      </div>

      <div className="economy-hud" aria-label="생활 자원">
        <span>
          <small>돈</small>
          <strong>{money.toLocaleString("ko-KR")}원</strong>
        </span>
        <span>
          <small>돌봄</small>
          <strong>{carePoints}P</strong>
        </span>
        <span
          className={bowlsEmpty ? "bowl-status is-warning" : "bowl-status"}
          aria-live="polite"
        >
          <small>그릇</small>
          <strong>{bowlStatus}</strong>
        </span>
      </div>

      <div className="topbar-secondary" aria-label="보호자 상태">
        <span
          className="salary-bonus-chip"
          aria-label={`급여 보너스 ${salaryBonusPercent}%`}
          title={`급여 보너스 +${salaryBonusPercent}%`}
        >
          <span aria-hidden="true">↗</span>
          +{salaryBonusPercent}%
        </span>
        <span
          className="owner-status"
          role="status"
          aria-label={`보호자, ${ROOM_NAMES[ownerRoom]}, ${ownerState}`}
          title={`보호자 · ${ROOM_NAMES[ownerRoom]} · ${ownerState}`}
        >
          <span aria-hidden="true">⌂</span>
          <strong>{ROOM_NAMES[ownerRoom]}</strong>
          <span
            className={pausedReason ? "focus-on" : "focus-off"}
            aria-hidden="true"
          >
            {pausedReason ? "⏸" : ownerMoving ? "➜" : "●"}
          </span>
        </span>
      </div>

      <div className="speed-control" role="group" aria-label="게임 배속">
        <button
          className="tutorial-toggle"
          type="button"
          aria-pressed={tutorialEnabled}
          onClick={onTutorialToggle}
        >
          도움말
        </button>
        {SPEEDS.map((item) => (
          <button
            className={speed === item.value ? "is-active" : ""}
            type="button"
            key={item.value}
            disabled={ended || pausedReason !== null}
            aria-pressed={speed === item.value}
            aria-label={item.value === 0 ? "일시정지" : `${item.label} 배속`}
            title={pausedReason ?? undefined}
            onClick={() => onSpeedChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}
