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
  WorldInteractionTarget,
  WorldTargetId,
} from "../services/waitdogSim";
import { WORLD_STATIONS } from "../services/waitdogSim";
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
const BOWL_HIT_RADIUS = 72;
const POOP_HIT_RADIUS = 58;
const BATH_HIT_RADIUS = 76;

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

const interactionTarget = (
  view: WaitdogUiView,
  id: WorldTargetId,
): WorldInteractionTarget | null =>
  view.interaction.targets.find((target) => target.id === id) ?? null;

const targetPoint = (target: WorldInteractionTarget): Point =>
  spatialPoint(target.room, target.x, target.y);

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
  work: {
    seated: boolean;
    progress: number;
    state: WaitdogUiView["work"]["state"];
  },
) => {
  const progress = Math.max(0, Math.min(100, work.progress));
  context.save();
  if (work.seated) {
    context.fillStyle = "rgba(79, 120, 198, 0.18)";
    context.beginPath();
    context.ellipse(point.x, point.y + 24, 82, 34, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(79, 120, 198, 0.72)";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(point.x, point.y + 10, 48, Math.PI, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = "#385664";
  context.beginPath();
  context.roundRect(point.x - 34, point.y + 18, 68, 58, 14);
  context.fill();
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
  context.font = "900 12px sans-serif";
  context.textAlign = "center";
  context.fillText(work.seated ? "업무 중" : "WORK", point.x, point.y - 50);
  context.fillStyle = "rgba(255, 255, 255, 0.36)";
  context.beginPath();
  context.roundRect(point.x - 32, point.y - 36, 64, 9, 5);
  context.fill();
  context.fillStyle = work.state === "complete" ? "#ffd86d" : "#92d8d0";
  context.beginPath();
  context.roundRect(point.x - 32, point.y - 36, 64 * progress / 100, 9, 5);
  context.fill();
  if (work.seated) {
    context.fillStyle = "#fff";
    context.strokeStyle = "#4f78c6";
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(point.x + 42, point.y - 96, 42, 31, 10);
    context.fill();
    context.stroke();
    context.fillStyle = "#345baf";
    context.font = "950 15px sans-serif";
    context.fillText("R", point.x + 63, point.y - 75);
  }
  context.restore();
};

const drawBowl = (
  context: CanvasRenderingContext2D,
  point: Point,
  kind: "food" | "water",
  level: number,
  status: "basic" | "comfort" | "empty" | "clean" | "dirty",
  images: ArtImages | null,
) => {
  const normalizedLevel = Math.max(0, Math.min(100, level));
  const drawEmptyBowl = () => {
    context.save();
    context.fillStyle = kind === "food" ? "#e9e2d8" : "#eef5f7";
    context.strokeStyle = "#6d756f";
    context.lineWidth = 4;
    context.beginPath();
    context.ellipse(point.x, point.y - 13, 38, 14, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, 0.72)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(point.x, point.y - 15, 24, 6, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  };

  if (images && normalizedLevel > 0) {
    drawProp(
      context,
      images.props,
      kind === "food" ? PROP_SPRITE_INDEX.food : PROP_SPRITE_INDEX.water,
      point,
      82,
    );
  } else {
    drawEmptyBowl();
  }

  context.save();
  const fillColor = kind === "food"
    ? status === "comfort" ? "#e2a268" : "#a96a36"
    : status === "dirty" ? "#8ea7a0" : "#64c3df";
  if (normalizedLevel > 0) {
    context.globalAlpha = 0.45 + normalizedLevel / 200;
    context.fillStyle = fillColor;
    context.beginPath();
    context.ellipse(
      point.x,
      point.y - 19,
      26,
      Math.max(2, 7 * normalizedLevel / 100),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.globalAlpha = 1;

  const gaugeX = point.x - 34;
  const gaugeY = point.y + 4;
  context.fillStyle = "rgba(32, 61, 54, 0.68)";
  context.beginPath();
  context.roundRect(gaugeX, gaugeY, 68, 12, 6);
  context.fill();
  if (normalizedLevel > 0) {
    context.fillStyle = fillColor;
    context.beginPath();
    context.roundRect(
      gaugeX + 2,
      gaugeY + 2,
      Math.max(4, 64 * normalizedLevel / 100),
      8,
      4,
    );
    context.fill();
  }

  const icon = status === "basic"
    ? "●"
    : status === "comfort"
    ? "♥"
    : status === "clean"
    ? "✓"
    : status === "dirty"
    ? "!"
    : "—";
  context.fillStyle = status === "dirty" ? "#c93e35" : "#2f6258";
  context.strokeStyle = "#fff";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(point.x + 32, point.y - 52, 15, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff";
  context.font = "950 13px sans-serif";
  context.textAlign = "center";
  context.fillText(icon, point.x + 32, point.y - 47);
  context.restore();
};

const drawBath = (
  context: CanvasRenderingContext2D,
  point: Point,
) => {
  context.save();
  context.fillStyle = "#f4fbff";
  context.strokeStyle = "#6aa8bb";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(point.x - 55, point.y - 42, 110, 48, 16);
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(100, 195, 223, 0.42)";
  context.beginPath();
  context.ellipse(point.x, point.y - 18, 43, 12, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#4f78c6";
  context.font = "900 12px sans-serif";
  context.textAlign = "center";
  context.fillText("BATH", point.x, point.y - 12);
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
  target: WorldInteractionTarget | null,
) => {
  const poop = view.activePoop;
  if (poop === null) return;
  const point = target
    ? targetPoint(target)
    : poop.location === "pad"
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

const worldTargetLabel = (targetId: WorldTargetId): string => {
  if (targetId.startsWith("door:")) return "문 이동";
  switch (targetId) {
    case "dog":
      return "강아지 관찰";
    case "cue":
      return "신호 관찰";
    case "computer":
      return "컴퓨터";
    case "foodBowl":
      return "사료 그릇";
    case "waterBowl":
      return "물그릇";
    case "activePoop":
      return "배변 흔적";
    case "bath":
      return "목욕";
  }
  return "대상";
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
  context.font = "950 19px sans-serif";
  const width = context.measureText(label).width + 42;
  const labelX = Math.max(10, Math.min(WIDTH - width - 10, point.x - width / 2));
  const labelY = Math.max(20, point.y - 190);
  const accent = encounter.safetyLevel === "high" ? "#c93e35" : "#ef7f68";
  context.fillStyle = "rgba(255, 255, 255, 0.98)";
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(labelX, labelY, width, 44, 15);
  context.fill();
  context.stroke();
  const tailX = Math.max(labelX + 20, Math.min(labelX + width - 20, point.x));
  context.fillStyle = "rgba(255, 255, 255, 0.98)";
  context.beginPath();
  context.moveTo(tailX - 10, labelY + 42);
  context.lineTo(tailX + 10, labelY + 42);
  context.lineTo(tailX, labelY + 58);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = encounter.safetyLevel === "high" ? "#8f302a" : "#27483f";
  context.textAlign = "center";
  context.fillText(label, labelX + width / 2, labelY + 29);
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.setLineDash([]);
  for (const offset of [-1, 1]) {
    context.beginPath();
    context.moveTo(point.x + offset * 42, point.y - 88);
    context.lineTo(point.x + offset * (59 + pulse * 0.2), point.y - 101);
    context.stroke();
  }
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

const drawHeardRoomIndicators = (
  context: CanvasRenderingContext2D,
  view: WaitdogUiView,
  now: number,
  reducedMotion: boolean,
) => {
  const pulse = reducedMotion ? 0 : (Math.sin(now / 220) + 1) * 5;
  for (const room of ROOM_ORDER) {
    if (view.roomVisibility[room] !== "heard") continue;
    const center = centerOf(room);
    context.save();
    context.fillStyle = "rgba(255, 248, 223, 0.94)";
    context.strokeStyle = "#ef7f68";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(center.x, center.y, 34 + pulse, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#27483f";
    context.font = "900 24px sans-serif";
    context.textAlign = "center";
    context.fillText("♪", center.x, center.y - 2);
    context.font = "800 13px sans-serif";
    context.fillText("소리 들림", center.x, center.y + 20);
    context.restore();
  }
};

const cueEdgeIndicator = (
  ownerRoom: RoomId,
  cue: Point,
): { point: Point; angle: number } => {
  const rect = ROOMS[ownerRoom];
  const center = centerOf(ownerRoom);
  const dx = cue.x - center.x;
  const dy = cue.y - center.y;
  const safeDx = Math.abs(dx) < 0.001 ? 0.001 : Math.abs(dx);
  const safeDy = Math.abs(dy) < 0.001 ? 0.001 : Math.abs(dy);
  const scale = Math.min(
    (rect.width / 2 - 28) / safeDx,
    (rect.height / 2 - 28) / safeDy,
  );
  return {
    point: {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    },
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
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
  const foodBowlTarget = interactionTarget(view, "foodBowl");
  const waterBowlTarget = interactionTarget(view, "waterBowl");
  const computerTarget = interactionTarget(view, "computer");
  const poopTarget = interactionTarget(view, "activePoop");
  const bathTarget = interactionTarget(view, "bath");
  const dogInteractionTarget = interactionTarget(view, "dog");
  const cueInteractionTarget = interactionTarget(view, "cue");
  const workSeated = view.work.seated;

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
      }
      const computerPoint = spatialPoint(
        WORLD_STATIONS.computer.room,
        WORLD_STATIONS.computer.x,
        WORLD_STATIONS.computer.y,
      );
      drawComputer(
        context,
        computerPoint,
        {
          seated: workSeated,
          progress: view.work.progress,
          state: view.work.state,
        },
      );
      drawBowl(
        context,
        spatialPoint(
          WORLD_STATIONS.foodBowl.room,
          WORLD_STATIONS.foodBowl.x,
          WORLD_STATIONS.foodBowl.y,
        ),
        "food",
        view.environmentPlacements.foodBowl.level,
        view.environmentPlacements.foodBowl.itemId === "food-comfort"
          ? "comfort"
          : view.environmentPlacements.foodBowl.itemId === "food-basic"
          ? "basic"
          : "empty",
        images,
      );
      drawBowl(
        context,
        spatialPoint(
          WORLD_STATIONS.waterBowl.room,
          WORLD_STATIONS.waterBowl.x,
          WORLD_STATIONS.waterBowl.y,
        ),
        "water",
        view.environmentPlacements.waterBowl.level,
        view.environmentPlacements.waterBowl.clean ? "clean" : "dirty",
        images,
      );
      drawBath(
        context,
        spatialPoint(
          WORLD_STATIONS.bath.room,
          WORLD_STATIONS.bath.x,
          WORLD_STATIONS.bath.y,
        ),
      );
      drawPadPlacement(context, view, images);
      drawPoop(context, view, images, poopTarget);
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
      const ownerPoint = ownerPositionRef.current;
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
      drawHeardRoomIndicators(
        context,
        view,
        now,
        reducedMotionRef.current,
      );

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
      WORLD_STATIONS.computer.room,
      WORLD_STATIONS.computer.x,
      WORLD_STATIONS.computer.y,
    );
    const foodPoint = spatialPoint(
      WORLD_STATIONS.foodBowl.room,
      WORLD_STATIONS.foodBowl.x,
      WORLD_STATIONS.foodBowl.y,
    );
    const waterPoint = spatialPoint(
      WORLD_STATIONS.waterBowl.room,
      WORLD_STATIONS.waterBowl.x,
      WORLD_STATIONS.waterBowl.y,
    );
    const bathPoint = spatialPoint(
      WORLD_STATIONS.bath.room,
      WORLD_STATIONS.bath.x,
      WORLD_STATIONS.bath.y,
    );
    const visiblePoopPoint = poopTarget
      ? targetPoint(poopTarget)
      : view.activePoop
      ? view.activePoop.location === "pad"
        ? spatialPoint(view.activePoop.room, 0.72, 0.82)
        : spatialPoint(view.activePoop.room, 0.16, 0.86)
      : null;
    const hits = (target: Point, radius: number) =>
      Math.hypot(point.x - target.x, point.y - target.y) <= radius;
    const moveToTarget = (
      target: WorldInteractionTarget | null,
      fallback: GroundMoveTarget,
    ) => {
      if (target?.nearby) {
        onInteract();
        return;
      }
      const destination: GroundMoveTarget = target
        ? { room: target.room, x: target.x, y: target.y }
        : fallback;
      setGroundMarker(destination);
      onGroundMove(destination);
    };

    if (
      encounter !== null &&
      currentCuePoint !== null &&
      hits(
        { x: currentCuePoint.x, y: currentCuePoint.y - 64 },
        CUE_HIT_RADIUS,
      )
    ) {
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
      moveToTarget(cueInteractionTarget, cueTarget);
      return;
    }

    if (
      hits(
        { x: computerPoint.x, y: computerPoint.y - 38 },
        COMPUTER_HIT_RADIUS,
      )
    ) {
      moveToTarget(computerTarget, { ...WORLD_STATIONS.computer });
      return;
    }

    if (hits({ x: foodPoint.x, y: foodPoint.y - 24 }, BOWL_HIT_RADIUS)) {
      moveToTarget(foodBowlTarget, { ...WORLD_STATIONS.foodBowl });
      return;
    }

    if (hits({ x: waterPoint.x, y: waterPoint.y - 24 }, BOWL_HIT_RADIUS)) {
      moveToTarget(waterBowlTarget, { ...WORLD_STATIONS.waterBowl });
      return;
    }

    if (visiblePoopPoint && hits(visiblePoopPoint, POOP_HIT_RADIUS)) {
      const fallback: GroundMoveTarget = view.activePoop
        ? {
          room: view.activePoop.room,
          x: view.activePoop.location === "pad" ? 0.72 : 0.16,
          y: view.activePoop.location === "pad" ? 0.82 : 0.86,
        }
        : { room: "toilet", x: 0.5, y: 0.5 };
      moveToTarget(poopTarget, fallback);
      return;
    }

    if (hits({ x: bathPoint.x, y: bathPoint.y - 18 }, BATH_HIT_RADIUS)) {
      moveToTarget(bathTarget, { ...WORLD_STATIONS.bath });
      return;
    }

    if (
      currentDogPoint !== null &&
      hits(
        { x: currentDogPoint.x, y: currentDogPoint.y - 48 },
        DOG_HIT_RADIUS,
      )
    ) {
      const fallback: GroundMoveTarget = view.spatial.room !== null &&
          view.spatial.x !== null && view.spatial.y !== null
        ? {
          room: view.spatial.room,
          x: view.spatial.x,
          y: view.spatial.y,
        }
        : {
          room: view.ownerSpatial.room,
          x: view.ownerSpatial.x,
          y: view.ownerSpatial.y,
        };
      moveToTarget(dogInteractionTarget, fallback);
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
    view.environmentPlacements.foodBowl.itemId
      ? `사료 그릇 ${view.environmentPlacements.foodBowl.level}%`
      : "사료 그릇 비어 있음",
    `물그릇 ${view.environmentPlacements.waterBowl.level}%${
      view.environmentPlacements.waterBowl.clean ? " 깨끗함" : " 세척 필요"
    }`,
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
  const cueEdge = encounter && publicCuePoint &&
      encounter.cue.room !== view.ownerSpatial.room
    ? cueEdgeIndicator(view.ownerSpatial.room, publicCuePoint)
    : null;
  const primaryContextAction = interaction.contextActions.find(
    (action) => action.enabled,
  ) ?? interaction.contextActions[0] ?? null;
  const proximityPrompt = interaction.nearbyTarget
    ? `[E] ${primaryContextAction?.label ??
      worldTargetLabel(interaction.nearbyTarget)}`
    : encounter
    ? `${ROOMS[encounter.cue.room].label} 신호로 이동`
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
        {cueEdge && (
          <span
            className={`canvas-edge-indicator safety-${encounter?.safetyLevel ?? "routine"}`}
            style={{
              left: `${cueEdge.point.x / WIDTH * 100}%`,
              top: `${cueEdge.point.y / HEIGHT * 100}%`,
              transform: `translate(-50%, -50%) rotate(${cueEdge.angle}deg)`,
            }}
            aria-label={`${encounter ? ROOMS[encounter.cue.room].label : "다른 방"}에 강아지 신호가 있습니다.`}
            role="status"
          >
            ➜
          </span>
        )}
        {proximityPrompt && (
          <span
            className={`proximity-prompt${interaction.nearbyTarget ? " is-ready" : ""}`}
            role="status"
            title={interaction.nearbyTarget
              ? `${worldTargetLabel(interaction.nearbyTarget)} 근처`
              : interaction.encounterDistance === null
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
