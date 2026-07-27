export interface CharacterDef {
  id: string;
  name: string;
  unlock: { type: "default" } | { type: "grade"; gradeName: string };
  /** public/characters/{id}-0..3.png */
}

export const CHARACTERS: CharacterDef[] = [
  { id: "octopus", name: "뽁뽁", unlock: { type: "default" } },
  { id: "cat", name: "말랑", unlock: { type: "grade", gradeName: "멤브레인" } },
  { id: "chick", name: "삐약", unlock: { type: "grade", gradeName: "펜타그래프" } },
  { id: "strawberry", name: "딸콩", unlock: { type: "grade", gradeName: "적축" } },
  { id: "bear", name: "곰곰", unlock: { type: "grade", gradeName: "갈축" } },
  { id: "penguin", name: "뒤뚱", unlock: { type: "grade", gradeName: "청축" } },
  { id: "panda", name: "얼룩", unlock: { type: "grade", gradeName: "은축" } },
  { id: "star", name: "반짝", unlock: { type: "grade", gradeName: "광축" } },
  { id: "frog", name: "폴짝", unlock: { type: "grade", gradeName: "무접점" } },
];

export function characterById(id: string | null | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/**
 * 정적 배포에서 next/image가 이 경로들에는 basePath를 붙여주지 않아
 * 캐릭터 이미지만 깨졌다. 여기서 직접 붙인다.
 * next.config.ts의 basePath와 반드시 같아야 한다.
 */
const ASSET_BASE = "/games/dadadak";

export function characterFrames(c: CharacterDef): string[] {
  return [0, 1, 2, 3].map((i) => `${ASSET_BASE}/characters/${c.id}-${i}.png`);
}

export const EXPRESSIONS = [
  "neutral",
  "blink",
  "happy",
  "star",
  "proud",
  "sleepy",
] as const;

export type Expression = (typeof EXPRESSIONS)[number];

export function characterExpr(c: CharacterDef): Record<Expression, string> {
  return {
    neutral: `${ASSET_BASE}/characters/${c.id}-neutral.png`,
    blink: `${ASSET_BASE}/characters/${c.id}-blink.png`,
    happy: `${ASSET_BASE}/characters/${c.id}-happy.png`,
    star: `${ASSET_BASE}/characters/${c.id}-star.png`,
    proud: `${ASSET_BASE}/characters/${c.id}-proud.png`,
    sleepy: `${ASSET_BASE}/characters/${c.id}-sleepy.png`,
  };
}
