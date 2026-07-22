export const WAITDOG_ART_ASSETS = {
  background: "/assets/images/waitdog-house-bg-v1.webp",
  dogA: "/assets/images/waitdog-dog-a-v1.webp",
  dogB: "/assets/images/waitdog-dog-b-v1.webp",
  props: "/assets/images/waitdog-props-v1.webp",
} as const;

export const SPRITE_GRID = {
  columns: 4,
  rows: 2,
} as const;

export type DogMotionId = "idle" | "move" | "approach" | "mat" | "fast";

export const DOG_MOTIONS: Record<
  DogMotionId,
  { sheet: "dogA" | "dogB"; row: 0 | 1; fps: number }
> = {
  idle: { sheet: "dogA", row: 0, fps: 5 },
  move: { sheet: "dogA", row: 1, fps: 5 },
  approach: { sheet: "dogB", row: 0, fps: 5 },
  mat: { sheet: "dogB", row: 1, fps: 5 },
  fast: { sheet: "dogA", row: 1, fps: 8 },
};

export const PROP_SPRITE_INDEX = {
  mat: 0,
  poop: 1,
  food: 2,
  water: 3,
  ball: 4,
  fence: 5,
  owner: 6,
  pad: 7,
} as const;
