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

export function characterFrames(c: CharacterDef): string[] {
  return [0, 1, 2, 3].map((i) => `/characters/${c.id}-${i}.png`);
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
    neutral: `/characters/${c.id}-neutral.png`,
    blink: `/characters/${c.id}-blink.png`,
    happy: `/characters/${c.id}-happy.png`,
    star: `/characters/${c.id}-star.png`,
    proud: `/characters/${c.id}-proud.png`,
    sleepy: `/characters/${c.id}-sleepy.png`,
  };
}
