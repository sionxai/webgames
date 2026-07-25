export interface SkinDef {
  id: string;
  name: string;
  unlock:
    | { type: "default" }
    | { type: "grade"; gradeName: string }
    | { type: "achievement"; achievementId: string };
  colors: { bg: string; ink: string; edge: string };
}

export const SKINS: SkinDef[] = [
  {
    id: "classic",
    name: "클래식 옐로",
    unlock: { type: "default" },
    colors: { bg: "#FFD60A", ink: "#1A1A00", edge: "#B89B07" },
  },
  {
    id: "red-linear",
    name: "적축 리니어",
    unlock: { type: "grade", gradeName: "적축" },
    colors: { bg: "#FF6B7E", ink: "#33060C", edge: "#C24857" },
  },
  {
    id: "brown-tactile",
    name: "갈축 택타일",
    unlock: { type: "grade", gradeName: "갈축" },
    colors: { bg: "#D9A05B", ink: "#2E1E08", edge: "#A67435" },
  },
  {
    id: "blue-clicky",
    name: "청축 클리키",
    unlock: { type: "grade", gradeName: "청축" },
    colors: { bg: "#4DA3FF", ink: "#06172E", edge: "#2F77C9" },
  },
  {
    id: "silver-speed",
    name: "은축 스피드",
    unlock: { type: "grade", gradeName: "은축" },
    colors: { bg: "#D7DDEB", ink: "#14171F", edge: "#9AA3B8" },
  },
  {
    id: "optical",
    name: "광축 네온",
    unlock: { type: "grade", gradeName: "광축" },
    colors: { bg: "#F5F7FF", ink: "#0F1220", edge: "#C9CFDD" },
  },
  {
    id: "emerald-champ",
    name: "전국구 에메랄드",
    unlock: { type: "achievement", achievementId: "event-win" },
    colors: { bg: "#3DDC84", ink: "#05230F", edge: "#22A85F" },
  },
  {
    id: "midnight",
    name: "미드나잇",
    unlock: { type: "achievement", achievementId: "night-owl" },
    colors: { bg: "#1B2030", ink: "#F5F7FF", edge: "#2B3247" },
  },
];

export function skinById(id: string | null | undefined): SkinDef {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}
