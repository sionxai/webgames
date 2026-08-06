export type AscensionModifier = {
  enemyDamageMultiplier: number;
  enemyHpMultiplier: number;
  startingHp: number;
  purifyHeal: number;
  // B8 실측에서 defensive가 방어량으로 흡수해 무효로 판명된 죽은 지렛대이며, 호환성을 위해 필드만 유지한다.
  bossOpeningAffliction: number;
};

export const ASCENSION_MODIFIERS: readonly AscensionModifier[] = [
  // B13 스윕 1차에서 승천 0→1 낙폭 -55%p, 승천 10 최강덱 16.5%(목표 20~30 미달)가 나와
  // 미세조정했다: 초반은 피해 배율을 1.40에 묶어 걸음을 줄이고(절벽은 피해 축에서 발생),
  // 상단은 보조 축(시작 명·정화)을 60/6으로 되돌려 그리드 예측(27.5%)과의 편차를 줄인다.
  { enemyDamageMultiplier: 1.40, enemyHpMultiplier: 1.20, startingHp: 70, purifyHeal: 8, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.40, enemyHpMultiplier: 1.25, startingHp: 70, purifyHeal: 8, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.45, enemyHpMultiplier: 1.35, startingHp: 70, purifyHeal: 8, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.50, enemyHpMultiplier: 1.40, startingHp: 70, purifyHeal: 8, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.50, enemyHpMultiplier: 1.50, startingHp: 65, purifyHeal: 8, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.55, enemyHpMultiplier: 1.60, startingHp: 65, purifyHeal: 6, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.55, enemyHpMultiplier: 1.70, startingHp: 65, purifyHeal: 6, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.60, enemyHpMultiplier: 1.75, startingHp: 60, purifyHeal: 6, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.60, enemyHpMultiplier: 1.80, startingHp: 60, purifyHeal: 6, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.60, enemyHpMultiplier: 1.90, startingHp: 60, purifyHeal: 6, bossOpeningAffliction: 0 },
  { enemyDamageMultiplier: 1.60, enemyHpMultiplier: 2.00, startingHp: 60, purifyHeal: 6, bossOpeningAffliction: 0 },
];

export const MAX_ASCENSION = ASCENSION_MODIFIERS.length - 1;

export function getAscensionModifier(ascension: number): AscensionModifier {
  if (!Number.isInteger(ascension) || ascension < 0 || ascension > MAX_ASCENSION) {
    throw new RangeError(`ascension must be an integer between 0 and ${MAX_ASCENSION}`);
  }
  return ASCENSION_MODIFIERS[ascension];
}
