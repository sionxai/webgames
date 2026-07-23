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
import type {
  OwnerClickMoveTarget,
  WaitdogUiView,
} from "../services/waitdogSim";
import type {
  BarrierPlacement,
  EncounterCueKind,
  EncounterPublicView,
  RoomId,
  Visibility,
} from "../types";

export type GroundMoveTarget = OwnerClickMoveTarget;

export interface HouseCanvasProps {
  view: WaitdogUiView;
  lastSeenRoom: RoomId | null;
  disabled: boolean;
  compact: boolean;
  encounter: EncounterPublicView | null;
  onGroundMove: (target: GroundMoveTarget) => void;
  onInteract: () => void;
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

interface PositionTransition {
  from: Point;
  to: Point;
  startedAt: number;
  duration: number;
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
const DOG_POSITION_TWEEN_MS = 520;
const OWNER_POSITION_TWEEN_MS = 96;
const COMPUTER_LOCATION = { room: "living" as const, x: 0.82, y: 0.2 };

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
const DOG_HIT_RADIUS = 92;
const CUE_HIT_RADIUS = 126;
const COMPUTER_HIT_RADIUS = 88;

const clampCoordinate = (value: number): number =>
  Math.max(0, Math.min(1, value));

const centerOf = (room: RoomId): Point => {
  const rect = ROOMS[room];
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const spatialPoint = (room: RoomId, x: number, y: number): Point => {
  const rect = ROOMS[room];
  const horizontalPadding = Math.min(72, rect.width * 0.15);
  const topPadding = Math.min(100, rect.height * 0.2);
  const bottomPadding = Math.min(54, rect.height * 0.12);
  return {
    x: rect.x + horizontalPadding +
      clampCoordinate(x) * (rect.width - horizontalPadding * 2),
    y: rect.y + topPadding +
      clampCoordinate(y) * (rect.height - topPadding - bottomPadding),
  };
};

const groundTargetAt = (point: Point): GroundMoveTarget | null => {
  const room = ROOM_ORDER.find((roomId) => {
    const rect = ROOMS[roomId];
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
      point.y >= rect.y && point.y <= rect.y + rect.height;
  });
  if (!room) return null;
  const rect = ROOMS[room];
  const horizontalPadding = Math.min(72, rect.width * 0.15);
  const topPadding = Math.min(100, rect.height * 0.2);
  const bottomPadding = Math.min(54, rect.height * 0.12);
  return {
    room,
    x: clampCoordinate(
      (point.x - rect.x - horizontalPadding) /
        (rect.width - horizontalPadding * 2),
    ),
    y: clampCoordinate(
      (point.y - rect.y - topPadding) /
        (rect.height - topPadding - bottomPadding),
    ),
  };
};

const dogPoint = (view: WaitdogUiView): Point | null => {
  const spatial = view.spatial;
  if (
    view.visibility !== "seen" || spatial.room === null ||
    spatial.x === null || spatial.y === null
  ) return null;
  return spatialPoint(spatial.room, spatial.x, spatial.y);
};

const dogTargetPoint = (view: WaitdogUiView): Point | null => {
  const spatial = view.spatial;
  if (
    view.visibility !== "seen" || spatial.targetRoom === null ||
    spatial.targetX === null || spatial.targetY === null
  ) return null;
  return spatialPoint(spatial.targetRoom, spatial.targetX, spatial.targetY);
};

const positionDuring = (
  transition: PositionTransition,
  now: number,
): Point => {
  const raw = Math.min(1, (now - transition.startedAt) / transition.duration);
  const progress = raw < 0.5
    ? 2 * raw * raw
    : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  return {
    x: transition.from.x + (transition.to.x - transition.from.x) * progress,
    y: transition.from.y + (transition.to.y - transition.from.y) * progress,
  };
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

const drawFallbackFloor = (
  context: CanvasRenderingContext2D,
  roomVisibility: Record<RoomId, Visibility>,
) => {
  context.fillStyle = "#b9dfd2";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  for (const room of ROOM_ORDER) {
    const rect = ROOMS[room];
    context.fillStyle = roomVisibility[room] === "hidden" ? "#556268" : "#fff8df";
    context.strokeStyle = "#2f6258";
    context.lineWidth = 4;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
};

const drawComputer = (
  context: CanvasRenderingContext2D,
  point: Point,
) => {
  context.save();
  context.fillStyle = "#714a33";
  context.fillRect(point.x - 66, point.y - 8, 132, 18);
  context.fillRect(point.x - 54, point.y + 8, 10, 55);
  context.fillRect(point.x + 44, point.y + 8, 10, 55);
  context.fillStyle = "#243d52";
  context.strokeStyle = "#92d8d0";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(point.x - 45, point.y - 78, 90, 66, 8);
  context.fill();
  context.stroke();
  context.fillStyle = "#92d8d0";
  context.font = "800 14px sans-serif";
  context.textAlign = "center";
  context.fillText("WORK", point.x, point.y - 40);
  context.restore();
};

const drawPadPlacement = (
  context: CanvasRenderingContext2D,
  view: WaitdogUiView,
  images: ArtImages | null,
) => {
  const pad = view.environmentPlacements.padPlacement;
  if (pad === null) return;
  const point = spatialPoint(pad.room, pad.x, pad.y);
  const rect = ROOMS[pad.room];
  const coverage = Math.min(rect.width, rect.height) * pad.coverage;
  context.save();
  context.fillStyle = "rgba(79, 120, 198, 0.16)";
  context.strokeStyle = "rgba(79, 120, 198, 0.66)";
  context.lineWidth = 4;
  context.setLineDash([10, 8]);
  context.beginPath();
  context.arc(point.x, point.y, coverage, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
  if (images) {
    drawProp(
      context,
      images.props,
      PROP_SPRITE_INDEX.pad,
      { x: point.x, y: point.y + 24 },
      Math.max(80, coverage * 1.25),
    );
  } else {
    context.fillStyle = "#dbeafe";
    context.strokeStyle = "#4f78c6";
    context.lineWidth = 3;
    context.fillRect(point.x - coverage * 0.55, point.y - 18, coverage * 1.1, 36);
    context.strokeRect(point.x - coverage * 0.55, point.y - 18, coverage * 1.1, 36);
  }
};

const barrierCanvasSize = (
  barrier: BarrierPlacement,
): { width: number; height: number } => {
  const room = ROOMS[barrier.room];
  return {
    width: Math.max(34, barrier.width * room.width * 0.7),
    height: Math.max(18, barrier.height * room.height * 0.72),
  };
};

const drawBarrier = (
  context: CanvasRenderingContext2D,
  barrier: BarrierPlacement,
) => {
  const point = spatialPoint(barrier.room, barrier.x, barrier.y);
  const size = barrierCanvasSize(barrier);
  context.save();
  context.fillStyle = "rgba(226, 151, 73, 0.2)";
  context.strokeStyle = "#a95829";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(
    point.x - size.width / 2,
    point.y - size.height,
    size.width,
    size.height,
    8,
  );
  context.fill();
  context.stroke();
  const panelWidth = size.width / barrier.panels;
  context.lineWidth = 3;
  for (let index = 1; index < barrier.panels; index += 1) {
    context.beginPath();
    context.moveTo(point.x - size.width / 2 + panelWidth * index, point.y - size.height);
    context.lineTo(point.x - size.width / 2 + panelWidth * index, point.y);
    context.stroke();
  }
  context.fillStyle = "#7c3f22";
  context.font = "800 13px sans-serif";
  context.textAlign = "center";
  context.fillText(`${barrier.panels}P`, point.x, point.y - size.height / 2 + 5);
  context.restore();
};

const drawOwner = (
  context: CanvasRenderingContext2D,
  point: Point,
  images: ArtImages | null,
) => {
  context.save();
  context.fillStyle = "rgba(37, 55, 69, 0.16)";
  context.beginPath();
  context.ellipse(point.x, point.y, 28, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
  if (images) {
    const height = 145;
    const sourceWidth = images.props.naturalWidth / SPRITE_GRID.columns;
    const sourceHeight = images.props.naturalHeight / SPRITE_GRID.rows;
    drawProp(
      context,
      images.props,
      PROP_SPRITE_INDEX.owner,
      point,
      height * sourceWidth / sourceHeight,
      height,
    );
    return;
  }
  context.fillStyle = "#325ea8";
  context.beginPath();
  context.arc(point.x, point.y - 80, 17, 0, Math.PI * 2);
  context.fill();
  context.fillRect(point.x - 14, point.y - 62, 28, 58);
};

const dogMotionFor = (view: WaitdogUiView): DogMotionId => {
  const activity = view.spatial.activity;
  if (activity === "zoomies" || activity === "flee") return "fast";
  if (view.spatial.moving) return "move";
  if (activity === "moveToMat") return "mat";
  if (
    activity === "eatPoop" || activity === "sniffLeave" ||
    activity === "sniffFloor" || activity === "seekFood" ||
    activity === "seekWater"
  ) return "approach";
  return "idle";
};

const drawDog = (
  context: CanvasRenderingContext2D,
  point: Point,
  view: WaitdogUiView,
  images: ArtImages | null,
  now: number,
  reducedMotion: boolean,
) => {
  const target = dogTargetPoint(view);
  const flipX = target !== null && target.x < point.x;
  context.save();
  context.fillStyle = "rgba(75, 57, 39, 0.18)";
  context.beginPath();
  context.ellipse(point.x, point.y - 2, 40, 12, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
  if (images) {
    const motion = DOG_MOTIONS[dogMotionFor(view)];
    const image = images[motion.sheet];
    const frame = reducedMotion
      ? 0
      : Math.floor(now / (1000 / motion.fps)) % SPRITE_GRID.columns;
    const width = 110;
    const sourceWidth = image.naturalWidth / SPRITE_GRID.columns;
    const sourceHeight = image.naturalHeight / SPRITE_GRID.rows;
    const height = width * sourceHeight / sourceWidth;
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
    return;
  }
  context.fillStyle = "#dc8b43";
  context.beginPath();
  context.ellipse(point.x, point.y - 28, 42, 29, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(point.x + (flipX ? -34 : 34), point.y - 53, 24, 0, Math.PI * 2);
  context.fill();
};

const drawPoop = (
  context: CanvasRenderingContext2D,
  view: WaitdogUiView,
  images: ArtImages | null,
) => {
  const poop = view.activePoop;
  if (poop === null) return;
  const point = poop.location === "pad"
    ? spatialPoint(poop.room, 0.72, 0.82)
    : spatialPoint(poop.room, 0.16, 0.86);
  if (images) {
    drawProp(context, images.props, PROP_SPRITE_INDEX.poop, point, 46);
    return;
  }
  context.fillStyle = "#8d674d";
  context.beginPath();
  context.arc(point.x, point.y - 8, 14, 0, Math.PI * 2);
  context.fill();
};

const cueCopy: Record<EncounterCueKind, string> = {
  potty: "배변 신호",
  overexcited: "흥분 신호",
  recall: "부르기",
  settle: "진정 신호",
  bark: "멍! 멍!",
  whine: "낑…",
  anxiety: "불안 신호",
  biteWarning: "접근 멈춤",
  flee: "거리 확보",
};

const cueIcon: Record<EncounterCueKind, string> = {
  potty: "◌",
  overexcited: "↯",
  recall: "⌁",
  settle: "○",
  bark: "!",
  whine: "♪",
  anxiety: "≈",
  biteWarning: "!",
  flee: "➜",
};

const cuePoint = (
  encounter: EncounterPublicView,
  fallbackDogPoint: Point | null,
): Point => encounter.cue.anchor
  ? spatialPoint(
    encounter.cue.room,
    encounter.cue.anchor.x,
    encounter.cue.anchor.y,
  )
  : fallbackDogPoint ?? centerOf(encounter.cue.room);

const drawCueEffect = (
  context: CanvasRenderingContext2D,
  encounter: EncounterPublicView,
  fallbackDogPoint: Point | null,
  now: number,
  reducedMotion: boolean,
) => {
  const point = cuePoint(encounter, fallbackDogPoint);
  const pulse = reducedMotion ? 0 : Math.sin(now / 180) * 8;
  context.save();
  context.lineWidth = encounter.safetyLevel === "high" ? 7 : 5;
  context.strokeStyle = encounter.safetyLevel === "high" ? "#c93e35" : "#ef7f68";
  context.fillStyle = "rgba(255, 255, 255, 0.96)";

  if (encounter.cue.kind === "bark" || encounter.cue.kind === "whine") {
    for (const radius of [28, 48, 68]) {
      context.beginPath();
      context.arc(point.x, point.y - 70, radius + pulse * 0.25, -0.8, 0.8);
      context.stroke();
    }
  } else if (encounter.cue.kind === "biteWarning") {
    context.beginPath();
    context.moveTo(point.x, point.y - 150 - pulse);
    context.lineTo(point.x - 58, point.y - 54);
    context.lineTo(point.x + 58, point.y - 54);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#c93e35";
    context.font = "900 48px sans-serif";
    context.textAlign = "center";
    context.fillText("!", point.x, point.y - 78);
  } else if (encounter.cue.kind === "flee") {
    context.setLineDash([16, 10]);
    context.beginPath();
    context.moveTo(point.x - 90, point.y - 50);
    context.lineTo(point.x + 76 + pulse, point.y - 50);
    context.stroke();
    context.beginPath();
    context.moveTo(point.x + 76 + pulse, point.y - 50);
    context.lineTo(point.x + 48 + pulse, point.y - 72);
    context.moveTo(point.x + 76 + pulse, point.y - 50);
    context.lineTo(point.x + 48 + pulse, point.y - 28);
    context.stroke();
  } else if (encounter.cue.kind === "anxiety") {
    context.setLineDash([7, 8]);
    for (const radius of [48, 72]) {
      context.beginPath();
      context.arc(point.x, point.y - 55, radius + pulse * 0.3, 0, Math.PI * 2);
      context.stroke();
    }
  } else {
    context.beginPath();
    context.arc(point.x, point.y - 45, 58 + pulse * 0.35, 0, Math.PI * 2);
    context.stroke();
  }

  const label = cueCopy[encounter.cue.kind];
  context.font = "900 18px sans-serif";
  const width = context.measureText(label).width + 30;
  const labelX = Math.max(10, Math.min(WIDTH - width - 10, point.x - width / 2));
  const labelY = Math.max(20, point.y - 190);
  context.fillStyle = encounter.safetyLevel === "high" ? "#c93e35" : "#2f6258";
  context.beginPath();
  context.roundRect(labelX, labelY, width, 38, 13);
  context.fill();
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.fillText(label, labelX + width / 2, labelY + 25);
  context.restore();
};

const drawMasksAndSpotlight = (
  context: CanvasRenderingContext2D,
  view: WaitdogUiView,
  encounter: EncounterPublicView | null,
  fallbackDogPoint: Point | null,
) => {
  for (const room of ROOM_ORDER) {
    if (view.roomVisibility[room] !== "hidden") continue;
    const rect = ROOMS[room];
    context.fillStyle = "rgba(29, 38, 42, 0.68)";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  if (encounter) {
    const point = cuePoint(encounter, fallbackDogPoint);
    context.save();
    context.fillStyle = "rgba(24, 37, 40, 0.2)";
    context.beginPath();
    context.rect(0, 0, WIDTH, HEIGHT);
    context.arc(point.x, point.y - 48, 145, 0, Math.PI * 2, true);
    context.fill("evenodd");
    const rect = ROOMS[encounter.cue.room];
    context.strokeStyle = encounter.safetyLevel === "high" ? "#c93e35" : "#ffd86d";
    context.lineWidth = 9;
    context.strokeRect(rect.x + 5, rect.y + 5, rect.width - 10, rect.height - 10);
    context.restore();
  }
};

const drawGroundMarker = (
  context: CanvasRenderingContext2D,
  target: GroundMoveTarget,
  now: number,
  reducedMotion: boolean,
) => {
  const point = spatialPoint(target.room, target.x, target.y);
  const pulse = reducedMotion ? 0 : (Math.sin(now / 170) + 1) * 4;
  context.save();
  context.strokeStyle = "#4f78c6";
  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(point.x, point.y, 17 + pulse, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(point.x - 10, point.y);
  context.lineTo(point.x + 10, point.y);
  context.moveTo(point.x, point.y - 10);
  context.lineTo(point.x, point.y + 10);
  context.stroke();
  context.restore();
};

const drawRoomLabels = (
  context: CanvasRenderingContext2D,
  view: WaitdogUiView,
) => {
  for (const room of ROOM_ORDER) {
    const rect = ROOMS[room];
    context.save();
    context.font = "800 15px sans-serif";
    const width = context.measureText(rect.label).width + 22;
    context.fillStyle = view.roomVisibility[room] === "hidden"
      ? "rgba(44, 54, 58, 0.92)"
      : "rgba(255, 255, 255, 0.9)";
    context.beginPath();
    context.roundRect(rect.x + 10, rect.y + 10, width, 28, 9);
    context.fill();
    context.fillStyle = view.roomVisibility[room] === "hidden"
      ? "#fff8df"
      : "#27483f";
    context.fillText(rect.label, rect.x + 21, rect.y + 30);
    context.restore();
  }
};

const separatedOwnerPoint = (
  owner: Point,
  ownerRoom: RoomId,
  dog: Point | null,
  dogRoom: RoomId | null,
): Point => {
  if (dog === null || dogRoom !== ownerRoom) return owner;
  if (Math.abs(owner.x - dog.x) >= 82 || Math.abs(owner.y - dog.y) >= 48) {
    return owner;
  }
  const rect = ROOMS[ownerRoom];
  const direction = owner.x <= dog.x ? -1 : 1;
  return {
    x: Math.max(rect.x + 46, Math.min(rect.x + rect.width - 46, owner.x + direction * 42)),
    y: owner.y,
  };
};

export function HouseCanvas({
  view,
  lastSeenRoom,
  disabled,
  compact,
  encounter,
  onGroundMove,
  onInteract,
}: HouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotionRef = useRef(false);
  const initialDog = dogPoint(view) ?? centerOf(lastSeenRoom ?? "living");
  const dogPositionRef = useRef<Point>(initialDog);
  const ownerPositionRef = useRef<Point>(
    spatialPoint(view.ownerSpatial.room, view.ownerSpatial.x, view.ownerSpatial.y),
  );
  const dogTransitionRef = useRef<PositionTransition | null>(null);
  const ownerTransitionRef = useRef<PositionTransition | null>(null);
  const [artLoad, setArtLoad] = useState<ArtLoadState>({ status: "loading" });
  const [groundMarker, setGroundMarker] = useState<GroundMoveTarget | null>(
    null,
  );
  const interaction = view.interaction;

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
      }
    };
  }, []);

  useEffect(() => {
    if (groundMarker === null) return;
    if (encounter !== null && interaction.encounterReady) {
      setGroundMarker(null);
      return;
    }
    if (
      view.ownerSpatial.moving ||
      view.ownerSpatial.room !== groundMarker.room
    ) return;
    if (
      Math.hypot(
        view.ownerSpatial.x - groundMarker.x,
        view.ownerSpatial.y - groundMarker.y,
      ) <= 0.035
    ) {
      setGroundMarker(null);
    }
  }, [
    encounter,
    groundMarker,
    interaction.encounterReady,
    view.ownerSpatial.moving,
    view.ownerSpatial.room,
    view.ownerSpatial.x,
    view.ownerSpatial.y,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = media.matches;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const startedAt = performance.now();
    const nextDog = dogPoint(view);
    if (nextDog !== null) {
      const currentDog = dogTransitionRef.current
        ? positionDuring(dogTransitionRef.current, startedAt)
        : dogPositionRef.current;
      if (reducedMotionRef.current) {
        dogPositionRef.current = nextDog;
        dogTransitionRef.current = null;
      } else {
        dogTransitionRef.current = {
          from: currentDog,
          to: nextDog,
          startedAt,
          duration: DOG_POSITION_TWEEN_MS,
        };
      }
    }
    const nextOwner = spatialPoint(
      view.ownerSpatial.room,
      view.ownerSpatial.x,
      view.ownerSpatial.y,
    );
    const currentOwner = ownerTransitionRef.current
      ? positionDuring(ownerTransitionRef.current, startedAt)
      : ownerPositionRef.current;
    if (reducedMotionRef.current) {
      ownerPositionRef.current = nextOwner;
      ownerTransitionRef.current = null;
    } else {
      ownerTransitionRef.current = {
        from: currentOwner,
        to: nextOwner,
        startedAt,
        duration: OWNER_POSITION_TWEEN_MS,
      };
    }

    let animationFrame = 0;
    const draw = (now: number) => {
      const images = artLoad.status === "ready" ? artLoad.images : null;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      if (images) context.drawImage(images.background, 0, 0, WIDTH, HEIGHT);
      else drawFallbackFloor(context, view.roomVisibility);

      if (images) {
        drawProp(context, images.props, PROP_SPRITE_INDEX.mat, { x: 158, y: 833 }, 150);
        drawProp(context, images.props, PROP_SPRITE_INDEX.ball, { x: 444, y: 786 }, 72);
        drawProp(context, images.props, PROP_SPRITE_INDEX.food, { x: 650, y: 390 }, 94);
        drawProp(context, images.props, PROP_SPRITE_INDEX.water, { x: 780, y: 390 }, 94);
      }
      drawComputer(
        context,
        spatialPoint(COMPUTER_LOCATION.room, COMPUTER_LOCATION.x, COMPUTER_LOCATION.y),
      );
      drawPadPlacement(context, view, images);
      drawPoop(context, view, images);
      view.environmentPlacements.barriers.forEach((barrier) =>
        drawBarrier(context, barrier)
      );
      if (groundMarker) {
        drawGroundMarker(
          context,
          groundMarker,
          now,
          reducedMotionRef.current,
        );
      }

      if (ownerTransitionRef.current) {
        ownerPositionRef.current = positionDuring(ownerTransitionRef.current, now);
        if (now - ownerTransitionRef.current.startedAt >=
          ownerTransitionRef.current.duration) {
          ownerPositionRef.current = ownerTransitionRef.current.to;
          ownerTransitionRef.current = null;
        }
      }
      if (dogTransitionRef.current) {
        dogPositionRef.current = positionDuring(dogTransitionRef.current, now);
        if (now - dogTransitionRef.current.startedAt >=
          dogTransitionRef.current.duration) {
          dogPositionRef.current = dogTransitionRef.current.to;
          dogTransitionRef.current = null;
        }
      }

      const publicDogPoint = view.visibility === "seen" ? dogPositionRef.current : null;
      const dogRoom = view.visibility === "seen" ? view.spatial.room : null;
      const ownerPoint = separatedOwnerPoint(
        ownerPositionRef.current,
        view.ownerSpatial.room,
        publicDogPoint,
        dogRoom,
      );
      const entities: Array<{ footY: number; draw: () => void }> = [
        {
          footY: ownerPoint.y,
          draw: () => drawOwner(context, ownerPoint, images),
        },
      ];
      if (publicDogPoint !== null) {
        entities.push({
          footY: publicDogPoint.y,
          draw: () => drawDog(
            context,
            publicDogPoint,
            view,
            images,
            now,
            reducedMotionRef.current,
          ),
        });
      }
      entities.sort((first, second) => first.footY - second.footY);
      entities.forEach((entity) => entity.draw());

      if (encounter) {
        drawCueEffect(
          context,
          encounter,
          publicDogPoint,
          now,
          reducedMotionRef.current,
        );
      }
      drawMasksAndSpotlight(context, view, encounter, publicDogPoint);
      drawRoomLabels(context, view);

      if (view.visibility === "hidden" && lastSeenRoom !== null) {
        const center = centerOf(lastSeenRoom);
        context.fillStyle = "rgba(255,255,255,.92)";
        context.beginPath();
        context.arc(center.x, center.y, 30, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#425058";
        context.font = "900 36px sans-serif";
        context.textAlign = "center";
        context.fillText("?", center.x, center.y + 13);
      }

      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [artLoad, encounter, groundMarker, lastSeenRoom, view]);

  const handlePointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
    const currentDogPoint = view.visibility === "seen"
      ? dogPositionRef.current
      : null;
    const currentCuePoint = encounter
      ? cuePoint(encounter, currentDogPoint)
      : null;
    const computerPoint = spatialPoint(
      COMPUTER_LOCATION.room,
      COMPUTER_LOCATION.x,
      COMPUTER_LOCATION.y,
    );
    const hits = (target: Point, radius: number) =>
      Math.hypot(point.x - target.x, point.y - target.y) <= radius;

    if (
      encounter !== null &&
      currentCuePoint !== null &&
      hits(
        { x: currentCuePoint.x, y: currentCuePoint.y - 64 },
        CUE_HIT_RADIUS,
      )
    ) {
      if (interaction.encounterReady) {
        onInteract();
        return;
      }
      const cueTarget: GroundMoveTarget = encounter.cue.anchor
        ? {
          room: encounter.cue.room,
          x: encounter.cue.anchor.x,
          y: encounter.cue.anchor.y,
        }
        : view.visibility === "seen" &&
            view.spatial.room === encounter.cue.room &&
            view.spatial.x !== null &&
            view.spatial.y !== null
        ? {
          room: encounter.cue.room,
          x: view.spatial.x,
          y: view.spatial.y,
        }
        : { room: encounter.cue.room, x: 0.5, y: 0.5 };
      setGroundMarker(cueTarget);
      onGroundMove(cueTarget);
      return;
    }

    if (
      hits(
        { x: computerPoint.x, y: computerPoint.y - 38 },
        COMPUTER_HIT_RADIUS,
      )
    ) {
      if (interaction.nearbyTarget === "computer") {
        onInteract();
        return;
      }
      const computerTarget: GroundMoveTarget = { ...COMPUTER_LOCATION };
      setGroundMarker(computerTarget);
      onGroundMove(computerTarget);
      return;
    }

    if (
      currentDogPoint !== null &&
      hits(
        { x: currentDogPoint.x, y: currentDogPoint.y - 48 },
        DOG_HIT_RADIUS,
      )
    ) {
      onInteract();
      return;
    }
    const target = groundTargetAt(point);
    if (!target) return;
    setGroundMarker(target);
    onGroundMove(target);
  };

  const placementSummary = [
    view.environmentPlacements.padPlacement ? "패드 1개" : null,
    view.environmentPlacements.barriers.length > 0
      ? `칸막이 ${view.environmentPlacements.barriers.length}개`
      : null,
  ].filter(Boolean).join(", ");
  const dogLabel = view.visibility === "seen"
    ? "강아지가 보입니다."
    : view.visibility === "heard"
    ? "강아지는 보이지 않고 소리만 들립니다."
    : "강아지가 보이지 않습니다.";
  const publicDogPoint = dogPoint(view);
  const publicCuePoint = encounter
    ? cuePoint(encounter, publicDogPoint)
    : null;
  const proximityPrompt = encounter
    ? interaction.encounterReady
      ? "[E] 관찰"
      : "가까이 가기"
    : null;

  return (
    <section className={`house-card${compact ? " is-compact" : ""}`} aria-labelledby="house-title">
      <div className="section-heading house-heading">
        <div>
          <span className="section-kicker">LIVE HOUSE</span>
          <h2 id="house-title">하우스 뷰</h2>
        </div>
        <span className="click-hint">
          클릭 이동 · 가까운 대상 E
        </span>
      </div>
      <div className="canvas-stage">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          tabIndex={0}
          aria-disabled={disabled}
          aria-label={`생활방, 부엌, 화장실 평면도. WASD 또는 바닥 클릭으로 이동합니다. ${dogLabel} ${placementSummary || "배치 아이템 없음"}.`}
          onPointerUp={handlePointer}
        />
        <span className="canvas-control-hint" aria-hidden="true">
          <kbd>WASD</kbd>
          이동
        </span>
        {encounter && publicCuePoint && (
          <span
            className={`canvas-cue-beacon safety-${encounter.safetyLevel}`}
            style={{
              left: `${publicCuePoint.x / WIDTH * 100}%`,
              top: `${(publicCuePoint.y - 58) / HEIGHT * 100}%`,
            }}
            aria-hidden="true"
          >
            {cueIcon[encounter.cue.kind]}
          </span>
        )}
        {proximityPrompt && (
          <span
            className={`proximity-prompt${interaction.encounterReady ? " is-ready" : ""}`}
            role="status"
            title={interaction.encounterDistance === null
              ? undefined
              : `신호까지 거리 ${interaction.encounterDistance.toFixed(2)}`}
          >
            {proximityPrompt}
          </span>
        )}
      </div>
    </section>
  );
}
