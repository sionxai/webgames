import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { WaitdogUiView } from "../services/waitdogSim";
import type { RoomId, Visibility } from "../types";

interface HouseCanvasProps {
  view: WaitdogUiView;
  lastSeenRoom: RoomId | null;
  onRoomSelect: (room: RoomId) => void;
}

interface RoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

const WIDTH = 720;
const HEIGHT = 470;

const ROOMS: Record<RoomId, RoomRect> = {
  living: { x: 20, y: 20, width: 430, height: 430, label: "생활방" },
  kitchen: { x: 470, y: 20, width: 230, height: 210, label: "부엌" },
  toilet: { x: 470, y: 240, width: 230, height: 210, label: "화장실" },
};

const ROOM_ORDER: RoomId[] = ["living", "kitchen", "toilet"];

const centerOf = (room: RoomId) => {
  const rect = ROOMS[room];
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const roomFill = (visibility: Visibility): string => {
  if (visibility === "seen") return "#fff8df";
  if (visibility === "heard") return "#e9f4e2";
  return "#4e5961";
};

const drawRoom = (
  context: CanvasRenderingContext2D,
  room: RoomId,
  visibility: Visibility,
) => {
  const rect = ROOMS[room];
  context.fillStyle = roomFill(visibility);
  context.strokeStyle = visibility === "hidden" ? "#364047" : "#2f6258";
  context.lineWidth = 4;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);

  context.fillStyle = visibility === "hidden" ? "#f6f0df" : "#27483f";
  context.font = "700 19px sans-serif";
  context.fillText(rect.label, rect.x + 16, rect.y + 30);

  if (visibility === "hidden") {
    context.save();
    context.globalAlpha = 0.18;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    for (let offset = -rect.height; offset < rect.width; offset += 28) {
      context.beginPath();
      context.moveTo(rect.x + offset, rect.y + rect.height);
      context.lineTo(rect.x + offset + rect.height, rect.y);
      context.stroke();
    }
    context.restore();
  }
};

const drawMat = (context: CanvasRenderingContext2D) => {
  context.fillStyle = "#ee7d64";
  context.strokeStyle = "#a4483d";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(58, 342, 118, 72, 18);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff8df";
  context.font = "700 16px sans-serif";
  context.fillText("매트", 98, 385);
};

const drawFence = (context: CanvasRenderingContext2D, blocked: boolean) => {
  context.save();
  context.strokeStyle = blocked ? "#d95145" : "#7a8b74";
  context.lineWidth = 6;
  for (let x = 382; x <= 438; x += 14) {
    context.beginPath();
    context.moveTo(x, 184);
    context.lineTo(x, 286);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(374, 207);
  context.lineTo(446, 207);
  context.moveTo(374, 263);
  context.lineTo(446, 263);
  context.stroke();
  context.fillStyle = blocked ? "#a9332c" : "#50644e";
  context.font = "700 14px sans-serif";
  context.fillText(blocked ? "차단 중" : "펜스", 385, 305);
  context.restore();
};

const drawOwner = (context: CanvasRenderingContext2D, room: RoomId) => {
  const center = centerOf(room);
  const x = center.x - 46;
  const y = center.y - 34;
  context.fillStyle = "#325ea8";
  context.beginPath();
  context.arc(x, y - 16, 13, 0, Math.PI * 2);
  context.fill();
  context.fillRect(x - 11, y, 22, 31);
  context.fillStyle = "#17355e";
  context.font = "700 13px sans-serif";
  context.textAlign = "center";
  context.fillText("보호자", x, y + 49);
  context.textAlign = "start";
};

const drawDog = (context: CanvasRenderingContext2D, room: RoomId) => {
  const center = centerOf(room);
  const x = center.x + 38;
  const y = center.y + 18;
  context.fillStyle = "#dc8b43";
  context.beginPath();
  context.ellipse(x, y, 34, 25, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(x + 29, y - 19, 22, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#6d3e24";
  context.beginPath();
  context.ellipse(x + 18, y - 31, 9, 17, -0.55, 0, Math.PI * 2);
  context.ellipse(x + 41, y - 32, 9, 17, 0.55, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#1f2d2a";
  context.beginPath();
  context.arc(x + 23, y - 20, 3, 0, Math.PI * 2);
  context.arc(x + 36, y - 20, 3, 0, Math.PI * 2);
  context.fill();
};

const drawPoop = (
  context: CanvasRenderingContext2D,
  room: RoomId,
  location: "pad" | "corner",
) => {
  const rect = ROOMS[room];
  const x = location === "pad" ? rect.x + rect.width * 0.68 : rect.x + 38;
  const y = location === "pad" ? rect.y + rect.height * 0.74 : rect.y + rect.height - 38;
  context.fillStyle = "#8d674d";
  context.beginPath();
  context.arc(x - 8, y + 3, 10, 0, Math.PI * 2);
  context.arc(x + 7, y + 3, 11, 0, Math.PI * 2);
  context.arc(x, y - 8, 9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff6a8";
  context.font = "700 16px sans-serif";
  context.fillText("✦", x + 17, y - 11);
};

const drawQuestion = (context: CanvasRenderingContext2D, room: RoomId) => {
  const center = centerOf(room);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.beginPath();
  context.arc(center.x + 36, center.y + 18, 25, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#425058";
  context.font = "900 30px sans-serif";
  context.textAlign = "center";
  context.fillText("?", center.x + 36, center.y + 29);
  context.textAlign = "start";
};

const drawSound = (context: CanvasRenderingContext2D) => {
  const x = WIDTH / 2;
  const y = 54;
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.beginPath();
  context.arc(x, y, 30, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#2f6258";
  context.lineWidth = 4;
  for (const radius of [9, 18]) {
    context.beginPath();
    context.arc(x - 8, y, radius, -Math.PI / 3, Math.PI / 3);
    context.stroke();
  }
};

export function HouseCanvas({ view, lastSeenRoom, onRoomSelect }: HouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#b9dfd2";
    context.fillRect(0, 0, WIDTH, HEIGHT);

    for (const room of ROOM_ORDER) {
      drawRoom(context, room, view.roomVisibility[room]);
    }
    drawMat(context);
    drawFence(context, view.blocked);
    drawOwner(context, view.owner.room);

    if (view.visibility === "seen" && view.room !== null) {
      drawDog(context, view.room);
    } else if (view.visibility === "hidden" && lastSeenRoom !== null) {
      drawQuestion(context, lastSeenRoom);
    }

    if (view.visibility === "heard") {
      drawSound(context);
    }

    if (view.activePoop !== null) {
      drawPoop(context, view.activePoop.room, view.activePoop.location);
    }

    if (view.owner.focusLocked) {
      context.fillStyle = "rgba(37, 48, 52, 0.62)";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "#fff8df";
      context.font = "800 26px sans-serif";
      context.textAlign = "center";
      context.fillText("집중 업무 중 · 관찰 제한", WIDTH / 2, HEIGHT / 2);
      context.textAlign = "start";
    }
  }, [lastSeenRoom, view]);

  const handlePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (canvas.height / bounds.height);
    const room = ROOM_ORDER.find((roomId) => {
      const rect = ROOMS[roomId];
      return x >= rect.x && x <= rect.x + rect.width &&
        y >= rect.y && y <= rect.y + rect.height;
    });
    if (room) onRoomSelect(room);
  };

  const dogLabel = view.visibility === "seen"
    ? "강아지가 보입니다."
    : view.visibility === "heard"
      ? "강아지는 보이지 않고 소리만 들립니다."
      : "강아지가 보이지 않습니다.";

  return (
    <section className="house-card" aria-labelledby="house-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker">LIVE HOUSE</span>
          <h2 id="house-title">하우스 뷰</h2>
        </div>
        <span className="click-hint">방을 클릭해 이동</span>
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`생활방, 부엌, 화장실 평면도. ${dogLabel} 방을 클릭하면 보호자가 이동합니다.`}
        onPointerUp={handlePointer}
      />
      <div className="room-shortcuts" role="group" aria-label="보호자 방 이동">
        {ROOM_ORDER.map((room) => (
          <button
            type="button"
            key={room}
            aria-pressed={view.owner.room === room}
            onClick={() => onRoomSelect(room)}
          >
            {ROOMS[room].label}로 이동
          </button>
        ))}
      </div>
    </section>
  );
}
