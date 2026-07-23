import type { RoomId } from "../types";

export type GameSpeed = 0 | 1 | 2 | 4;

interface TopBarProps {
  day: number;
  minuteOfDay: number;
  speed: GameSpeed;
  ownerRoom: RoomId;
  ownerMoving: boolean;
  money: number;
  carePoints: number;
  salaryBonusPercent: number;
  pausedReason: string | null;
  ended: boolean;
  onSpeedChange: (speed: GameSpeed) => void;
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
  salaryBonusPercent,
  pausedReason,
  ended,
  onSpeedChange,
}: TopBarProps) {
  return (
    <header className="top-bar lifestyle-topbar">
      <div className="brand-block">
        <span className="eyebrow">WAIT, DOG!</span>
        <h1>기다려, 멍!</h1>
      </div>

      <div className="day-clock" aria-label={`Day ${day}, ${formatClock(minuteOfDay)}`}>
        <strong>Day {day}</strong>
        <span aria-hidden="true">·</span>
        <time>{formatClock(minuteOfDay)}</time>
      </div>

      <div className="economy-hud" aria-label="생활 자원">
        <span>
          <small>보유금</small>
          <strong>{money.toLocaleString("ko-KR")}원</strong>
        </span>
        <span>
          <small>돌봄</small>
          <strong>{carePoints}P</strong>
        </span>
        <span>
          <small>급여 보너스</small>
          <strong>+{salaryBonusPercent}%</strong>
        </span>
      </div>

      <div className="speed-control" role="group" aria-label="게임 배속">
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

      <div className="owner-status" role="status">
        <span>보호자 · {ROOM_NAMES[ownerRoom]}</span>
        <span className={pausedReason ? "focus-on" : "focus-off"}>
          {pausedReason ?? (ownerMoving ? "이동 중" : "생활 중")}
        </span>
      </div>
    </header>
  );
}
