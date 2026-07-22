import type { RoomId } from "../types";
import type { OwnerResources } from "../services/campaign";

export type GameSpeed = 0 | 1 | 2 | 4;

interface TopBarProps {
  day: number;
  minuteOfDay: number;
  speed: GameSpeed;
  ownerRoom: RoomId;
  focusLocked: boolean;
  away: boolean;
  resources: OwnerResources;
  guide: string | null;
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
  focusLocked,
  away,
  resources,
  guide,
  ended,
  onSpeedChange,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="brand-block">
        <span className="eyebrow">WAIT, DOG!</span>
        <h1>기다려, 멍!</h1>
      </div>

      <div className="day-clock" aria-label={`Day ${day}, ${formatClock(minuteOfDay)}`}>
        <strong>Day {day}</strong>
        <span aria-hidden="true">·</span>
        <time>{formatClock(minuteOfDay)}</time>
      </div>

      <div className="speed-control" role="group" aria-label="게임 배속">
        {SPEEDS.map((item) => (
          <button
            className={speed === item.value ? "is-active" : ""}
            type="button"
            key={item.value}
            disabled={ended}
            aria-pressed={speed === item.value}
            aria-label={item.value === 0 ? "일시정지" : `${item.label} 배속`}
            onClick={() => onSpeedChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="resource-gauges" aria-label="보호자 자원">
        {([
          ["energy", "에너지"],
          ["focus", "집중"],
          ["workScore", "업무 성과"],
        ] as const).map(([key, label]) => (
          <div className="resource-gauge" key={key}>
            <span>{label}</span>
            <div
              className={`resource-meter resource-${key}`}
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={resources[key]}
            >
              <span style={{ width: `${resources[key]}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="owner-status" role="status">
        <span>{away ? "보호자 · 외출 중" : `보호자 · ${ROOM_NAMES[ownerRoom]}`}</span>
        <span className={focusLocked ? "focus-on" : "focus-off"}>
          {away ? "개입 불가" : focusLocked ? "집중 업무 중" : "관찰 가능"}
        </span>
      </div>
      {guide && <div className="day-guide" role="note">{guide}</div>}
    </header>
  );
}
