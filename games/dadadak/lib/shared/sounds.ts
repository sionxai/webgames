export interface SoundDefinition {
  id: string;
  name: string;
  gradeName: string;
}

export const SOUNDS: SoundDefinition[] = [
  { id: "bubble", name: "뽁뽁이", gradeName: "뽁뽁이" },
  { id: "membrane", name: "멤브레인", gradeName: "멤브레인" },
  { id: "pantograph", name: "펜타그래프", gradeName: "펜타그래프" },
  { id: "red", name: "적축", gradeName: "적축" },
  { id: "brown", name: "갈축", gradeName: "갈축" },
  { id: "blue", name: "청축", gradeName: "청축" },
  { id: "silver", name: "은축", gradeName: "은축" },
  { id: "optical", name: "광축", gradeName: "광축" },
  { id: "topre", name: "무접점", gradeName: "무접점" },
];

export function soundForGradeName(gradeName: string): SoundDefinition {
  return SOUNDS.find((sound) => sound.gradeName === gradeName) ?? SOUNDS[0];
}
