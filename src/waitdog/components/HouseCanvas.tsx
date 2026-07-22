import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DOG_MOTIONS,
  PROP_SPRITE_INDEX,
  SPRITE_GRID,
  WAITDOG_ART_ASSETS,
  type DogMotionId,
} from "../constants/artAssets";
import type { WaitdogUiView } from "../services/waitdogSim";
import type { RoomId, Visibility } from "../types";

interface HouseCanvasProps {
  view: WaitdogUiView;
  lastSeenRoom: RoomId | null;
  ownerAway: boolean;
  disabled: boolean;
  onRoomSelect: (room: RoomId) => void;
}

interface RoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface Point {
  x: number;
  y: number;
}

interface RoomTransition {
  from: Point;
  to: Point;
  startedAt: number;
  duration: number;
  movingLeft: boolean;
}

type ArtImages = {
  [Key in keyof typeof WAITDOG_ART_ASSETS]: HTMLImageElement;
};

type ArtLoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; images: ArtImages };

const WIDTH = 900;
const HEIGHT = 900;
const ROOM_TRANSITION_MS = 720;
const TRANSIENT_MOTION_MS = 1600;

const ROOMS: Record<RoomId, RoomRect> = {
  living: {
    x: WIDTH * 0.025,
    y: HEIGHT * 0.02,
    width: WIDTH * 0.555,
    height: HEIGHT * 0.96,
    label: "생활방",
  },
  kitchen: {
    x: WIDTH * 0.605,
    y: HEIGHT * 0.02,
    width: WIDTH * 0.37,
    height: HEIGHT * 0.47,
    label: "부엌",
  },
  toilet: {
    x: WIDTH * 0.605,
    y: HEIGHT * 0.51,
    width: WIDTH * 0.37,
    height: HEIGHT * 0.47,
    label: "화장실",
  },
};

const ROOM_ORDER: RoomId[] = ["living", "kitchen", "toilet"];
const TRANSIENT_EVENT_TYPES = new Set([
  "sniffFloor",
  "circle",
  "wander",
  "poopApproach",
  "eatPoop",
]);

const centerOf = (room: RoomId): Point => {
  const rect = ROOMS[room];
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const dogAnchor = (room: RoomId): Point => {
  const rect = ROOMS[room];
  const center = centerOf(room);
  return { x: center.x, y: center.y + rect.height * 0.1 };
};

const ownerAnchor = (room: RoomId): Point => {
  const rect = ROOMS[room];
  const center = centerOf(room);
  return {
    x: center.x - rect.width * 0.22,
    y: center.y + rect.height * 0.1,
  };
};

const easeInOut = (progress: number): number =>
  progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

const positionDuring = (transition: RoomTransition, now: number): Point => {
  const progress = Math.min(1, (now - transition.startedAt) / transition.duration);
  const eased = easeInOut(progress);
  return {
    x: transition.from.x + (transition.to.x - transition.from.x) * eased,
    y: transition.from.y + (transition.to.y - transition.from.y) * eased,
  };
};

const roomFill = (visibility: Visibility): string => {
  if (visibility === "seen") return "#fff8df";
  if (visibility === "heard") return "#e9f4e2";
  return "#4e5961";
};

const drawFallbackRoom = (
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
};

const drawFallbackMat = (context: CanvasRenderingContext2D) => {
  context.fillStyle = "#ee7d64";
  context.strokeStyle = "#a4483d";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(72, 752, 142, 86, 20);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff8df";
  context.font = "700 16px sans-serif";
  context.fillText("매트", 124, 801);
};

const drawFallbackFence = (context: CanvasRenderingContext2D) => {
  const boundaryX = ROOMS.living.x + ROOMS.living.width - 8;
  context.save();
  context.strokeStyle = "#d95145";
  context.lineWidth = 7;
  for (let y = 350; y <= 520; y += 24) {
    context.beginPath();
    context.moveTo(boundaryX - 22, y);
    context.lineTo(boundaryX + 22, y);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(boundaryX - 12, 336);
  context.lineTo(boundaryX - 12, 534);
  context.moveTo(boundaryX + 12, 336);
  context.lineTo(boundaryX + 12, 534);
  context.stroke();
  context.restore();
};

const drawFallbackOwner = (
  context: CanvasRenderingContext2D,
  room: RoomId,
) => {
  const point = ownerAnchor(room);
  context.fillStyle = "#325ea8";
  context.beginPath();
  context.arc(point.x, point.y - 58, 18, 0, Math.PI * 2);
  context.fill();
  context.fillRect(point.x - 15, point.y - 38, 30, 52);
};

const drawFallbackDog = (
  context: CanvasRenderingContext2D,
  point: Point,
) => {
  context.fillStyle = "#dc8b43";
  context.beginPath();
  context.ellipse(point.x, point.y - 24, 43, 31, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(point.x + 35, point.y - 50, 27, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#6d3e24";
  context.beginPath();
  context.ellipse(point.x + 23, point.y - 66, 11, 21, -0.55, 0, Math.PI * 2);
  context.ellipse(point.x + 49, point.y - 67, 11, 21, 0.55, 0, Math.PI * 2);
  context.fill();
};

const poopAnchor = (
  room: RoomId,
  location: "pad" | "corner",
): Point => {
  const rect = ROOMS[room];
  return location === "pad"
    ? { x: rect.x + rect.width * 0.72, y: rect.y + rect.height * 0.82 }
    : { x: rect.x + rect.width * 0.16, y: rect.y + rect.height * 0.86 };
};

const drawFallbackPoop = (
  context: CanvasRenderingContext2D,
  room: RoomId,
  location: "pad" | "corner",
) => {
  const point = poopAnchor(room, location);
  context.fillStyle = "#8d674d";
  context.beginPath();
  context.arc(point.x - 9, point.y - 5, 11, 0, Math.PI * 2);
  context.arc(point.x + 8, point.y - 5, 12, 0, Math.PI * 2);
  context.arc(point.x, point.y - 18, 10, 0, Math.PI * 2);
  context.fill();
};

const drawQuestion = (context: CanvasRenderingContext2D, room: RoomId) => {
  const center = centerOf(room);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.beginPath();
  context.arc(center.x, center.y, 30, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#425058";
  context.font = "900 36px sans-serif";
  context.textAlign = "center";
  context.fillText("?", center.x, center.y + 13);
  context.textAlign = "start";
};

const drawSound = (context: CanvasRenderingContext2D) => {
  const x = WIDTH / 2;
  const y = 70;
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.beginPath();
  context.arc(x, y, 34, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#2f6258";
  context.lineWidth = 4;
  for (const radius of [10, 20]) {
    context.beginPath();
    context.arc(x - 9, y, radius, -Math.PI / 3, Math.PI / 3);
    context.stroke();
  }
};

const drawRoomLabel = (
  context: CanvasRenderingContext2D,
  room: RoomId,
  visibility: Visibility,
) => {
  const rect = ROOMS[room];
  context.save();
  context.font = "800 15px sans-serif";
  const badgeWidth = context.measureText(rect.label).width + 22;
  context.fillStyle = visibility === "hidden"
    ? "rgba(44, 54, 58, 0.9)"
    : "rgba(255, 255, 255, 0.88)";
  context.beginPath();
  context.roundRect(rect.x + 10, rect.y + 10, badgeWidth, 28, 9);
  context.fill();
  context.fillStyle = visibility === "hidden" ? "#fff8df" : "#27483f";
  context.fillText(rect.label, rect.x + 21, rect.y + 30);
  context.restore();
};

const drawSpriteCell = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  column: number,
  row: number,
  x: number,
  y: number,
  width: number,
  height: number,
  flipX = false,
) => {
  const sourceWidth = image.naturalWidth / SPRITE_GRID.columns;
  const sourceHeight = image.naturalHeight / SPRITE_GRID.rows;
  context.save();
  if (flipX) {
    context.translate(x + width, 0);
    context.scale(-1, 1);
    context.drawImage(
      image,
      column * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      0,
      y,
      width,
      height,
    );
  } else {
    context.drawImage(
      image,
      column * sourceWidth,
      row * sourceHeight,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    );
  }
  context.restore();
};

const drawProp = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  index: number,
  pivot: Point,
  width: number,
  height = width * (image.naturalHeight / SPRITE_GRID.rows) /
    (image.naturalWidth / SPRITE_GRID.columns),
) => {
  drawSpriteCell(
    context,
    image,
    index % SPRITE_GRID.columns,
    Math.floor(index / SPRITE_GRID.columns),
    pivot.x - width / 2,
    pivot.y - height,
    width,
    height,
  );
};

const drawRotatedFence = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
) => {
  const rect = ROOMS.living;
  const pivot = { x: rect.x + rect.width - 5, y: rect.y + rect.height * 0.5 };
  context.save();
  context.translate(pivot.x, pivot.y);
  context.rotate(Math.PI / 2);
  drawSpriteCell(
    context,
    image,
    PROP_SPRITE_INDEX.fence % SPRITE_GRID.columns,
    Math.floor(PROP_SPRITE_INDEX.fence / SPRITE_GRID.columns),
    -92,
    -42,
    184,
    84,
  );
  context.restore();
};

const dogMotionFor = (
  view: WaitdogUiView,
  moving: boolean,
  transient: boolean,
): DogMotionId => {
  if (view.action === "zoomies" || view.action === "flee") return "fast";
  if (moving) return "move";
  if (view.action === "moveToMat") return "mat";
  if (view.action === "eatPoop" || view.action === "sniffLeave" || transient) {
    return "approach";
  }
  return "idle";
};

const drawDogSprite = (
  context: CanvasRenderingContext2D,
  images: ArtImages,
  point: Point,
  motionId: DogMotionId,
  now: number,
  reducedMotion: boolean,
  flipX: boolean,
) => {
  const motion = DOG_MOTIONS[motionId];
  const image = images[motion.sheet];
  const frame = reducedMotion
    ? 0
    : Math.floor(now / (1000 / motion.fps)) % SPRITE_GRID.columns;
  const width = ROOMS.living.width * 0.2;
  const sourceWidth = image.naturalWidth / SPRITE_GRID.columns;
  const sourceHeight = image.naturalHeight / SPRITE_GRID.rows;
  const height = width * sourceHeight / sourceWidth;
  context.save();
  context.fillStyle = "rgba(75, 57, 39, 0.18)";
  context.beginPath();
  context.ellipse(point.x, point.y - 4, width * 0.36, height * 0.09, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
  drawSpriteCell(
    context,
    image,
    frame,
    motion.row,
    point.x - width / 2,
    point.y - height,
    width,
    height,
    flipX,
  );
};

const drawRoomMasks = (
  context: CanvasRenderingContext2D,
  roomVisibility: Record<RoomId, Visibility>,
) => {
  for (const room of ROOM_ORDER) {
    if (roomVisibility[room] !== "hidden") continue;
    const rect = ROOMS[room];
    context.fillStyle = "rgba(29, 38, 42, 0.68)";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
};

const drawFullCover = (
  context: CanvasRenderingContext2D,
  ownerAway: boolean,
) => {
  context.fillStyle = "rgba(37, 48, 52, 0.68)";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#fff8df";
  context.font = "800 28px sans-serif";
  context.textAlign = "center";
  context.fillText(
    ownerAway ? "보호자 외출 중 · 개입 불가" : "집중 업무 중 · 관찰 제한",
    WIDTH / 2,
    HEIGHT / 2,
  );
  context.textAlign = "start";
};

export function HouseCanvas({
  view,
  lastSeenRoom,
  ownerAway,
  disabled,
  onRoomSelect,
}: HouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotionRef = useRef(false);
  const dogPositionRef = useRef<Point>(dogAnchor(view.room ?? lastSeenRoom ?? "living"));
  const previousRoomRef = useRef<RoomId | null>(view.room);
  const transitionRef = useRef<RoomTransition | null>(null);
  const transientEventRef = useRef<{ key: string | null; startedAt: number }>({
    key: null,
    startedAt: 0,
  });
  const [artLoad, setArtLoad] = useState<ArtLoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let failed = false;
    let loaded = 0;
    const images: ArtImages = {
      background: new Image(),
      dogA: new Image(),
      dogB: new Image(),
      props: new Image(),
    };
    const entries = Object.entries(WAITDOG_ART_ASSETS) as Array<
      [keyof ArtImages, string]
    >;

    for (const [key, source] of entries) {
      const image = images[key];
      image.onload = () => {
        loaded += 1;
        if (active && !failed && loaded === entries.length) {
          setArtLoad({ status: "ready", images });
        }
      };
      image.onerror = () => {
        if (!active || failed) return;
        failed = true;
        setArtLoad({ status: "failed" });
      };
      image.src = source;
    }

    return () => {
      active = false;
      for (const image of Object.values(images)) {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reducedMotionRef.current = media.matches;
    };
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const effectStartedAt = performance.now();
    if (view.visibility === "seen" && view.room !== null) {
      const nextAnchor = dogAnchor(view.room);
      const previousRoom = previousRoomRef.current;
      if (previousRoom !== null && previousRoom !== view.room) {
        const from = transitionRef.current === null
          ? dogPositionRef.current
          : positionDuring(transitionRef.current, effectStartedAt);
        transitionRef.current = {
          from,
          to: nextAnchor,
          startedAt: effectStartedAt,
          duration: ROOM_TRANSITION_MS,
          movingLeft: nextAnchor.x < from.x,
        };
      } else if (previousRoom === null) {
        dogPositionRef.current = nextAnchor;
      }
      previousRoomRef.current = view.room;
    }

    const transientEvent = [...view.recentEvents].reverse().find((event) =>
      TRANSIENT_EVENT_TYPES.has(event.type)
    );
    if (transientEvent && view.t - transientEvent.t <= 10) {
      const key = `${transientEvent.t}:${transientEvent.type}:${transientEvent.room ?? "unknown"}`;
      if (transientEventRef.current.key !== key) {
        transientEventRef.current = { key, startedAt: effectStartedAt };
      }
    }

    const drawFallback = () => {
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "#b9dfd2";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      for (const room of ROOM_ORDER) {
        drawFallbackRoom(context, room, view.roomVisibility[room]);
      }
      drawFallbackMat(context);
      if (view.blocked) drawFallbackFence(context);
      if (!ownerAway) drawFallbackOwner(context, view.owner.room);
      if (view.visibility === "seen" && view.room !== null) {
        drawFallbackDog(context, dogAnchor(view.room));
      }
      if (view.activePoop !== null) {
        drawFallbackPoop(context, view.activePoop.room, view.activePoop.location);
      }
      drawRoomMasks(context, view.roomVisibility);
      if (view.visibility === "hidden" && lastSeenRoom !== null) {
        drawQuestion(context, lastSeenRoom);
      }
      if (view.visibility === "heard") drawSound(context);
      for (const room of ROOM_ORDER) {
        drawRoomLabel(context, room, view.roomVisibility[room]);
      }
      if (view.owner.focusLocked || ownerAway) drawFullCover(context, ownerAway);
    };

    if (artLoad.status !== "ready") {
      drawFallback();
      return;
    }

    let animationFrame = 0;
    const drawArt = (now: number) => {
      const { images } = artLoad;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.drawImage(images.background, 0, 0, WIDTH, HEIGHT);

      drawProp(context, images.props, PROP_SPRITE_INDEX.mat, { x: 158, y: 833 }, 150);
      drawProp(context, images.props, PROP_SPRITE_INDEX.ball, { x: 444, y: 786 }, 72);
      drawProp(context, images.props, PROP_SPRITE_INDEX.food, { x: 650, y: 390 }, 94);
      drawProp(context, images.props, PROP_SPRITE_INDEX.water, { x: 780, y: 390 }, 94);
      drawProp(context, images.props, PROP_SPRITE_INDEX.pad, { x: 785, y: 846 }, 142);
      if (view.blocked) drawRotatedFence(context, images.props);

      if (view.activePoop !== null) {
        drawProp(
          context,
          images.props,
          PROP_SPRITE_INDEX.poop,
          poopAnchor(view.activePoop.room, view.activePoop.location),
          ROOMS.living.width * 0.08,
        );
      }

      if (!ownerAway) {
        const ownerHeight = ROOMS.living.height * 0.22;
        const propCellWidth = images.props.naturalWidth / SPRITE_GRID.columns;
        const propCellHeight = images.props.naturalHeight / SPRITE_GRID.rows;
        drawProp(
          context,
          images.props,
          PROP_SPRITE_INDEX.owner,
          ownerAnchor(view.owner.room),
          ownerHeight * propCellWidth / propCellHeight,
          ownerHeight,
        );
      }

      if (view.visibility === "seen" && view.room !== null) {
        const transition = transitionRef.current;
        const moving = transition !== null &&
          now - transition.startedAt < transition.duration;
        if (transition !== null) {
          dogPositionRef.current = positionDuring(transition, now);
          if (!moving) {
            dogPositionRef.current = transition.to;
            transitionRef.current = null;
          }
        } else {
          dogPositionRef.current = dogAnchor(view.room);
        }
        const transient = transientEventRef.current.key !== null &&
          now - transientEventRef.current.startedAt < TRANSIENT_MOTION_MS;
        const motion = dogMotionFor(view, moving, transient);
        const point = !moving && motion === "mat" && view.room === "living"
          ? { x: 158, y: 816 }
          : dogPositionRef.current;
        drawDogSprite(
          context,
          images,
          point,
          motion,
          now,
          reducedMotionRef.current,
          moving && transition?.movingLeft === true,
        );
      }

      drawRoomMasks(context, view.roomVisibility);
      if (view.visibility === "hidden" && lastSeenRoom !== null) {
        drawQuestion(context, lastSeenRoom);
      }
      if (view.visibility === "heard") drawSound(context);
      for (const room of ROOM_ORDER) {
        drawRoomLabel(context, room, view.roomVisibility[room]);
      }
      if (view.owner.focusLocked || ownerAway) drawFullCover(context, ownerAway);

      animationFrame = window.requestAnimationFrame(drawArt);
    };
    animationFrame = window.requestAnimationFrame(drawArt);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [artLoad, lastSeenRoom, ownerAway, view]);

  const handlePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
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
        aria-disabled={disabled}
        aria-label={`생활방, 부엌, 화장실 평면도. ${dogLabel} 방을 클릭하면 보호자가 이동합니다.`}
        onPointerUp={handlePointer}
      />
      <div className="room-shortcuts" role="group" aria-label="보호자 방 이동">
        {ROOM_ORDER.map((room) => (
          <button
            type="button"
            key={room}
            disabled={disabled}
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
