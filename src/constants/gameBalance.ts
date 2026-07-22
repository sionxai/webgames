import type {
  BossDefinition,
  CatalystCountMap,
  CatalystDefinition,
  CatalystGateStatus,
  EnhancePreview,
  EnhancePreviewInput,
  PermanentUpgrade,
  ProgressChargeId,
  SwordSeries,
  SwordStageInfo,
  UserGameProfile
} from '../types/game';

export const SWORD_SERIES_LIST: SwordSeries[] = [
  {
    id: 'kingdom',
    name: '왕국 철검',
    description: '균형 잡힌 대표 검 계열. 기본 매각율 +0%',
    icon: '⚔️',
    unlockedByDefault: true,
    requiredBlueprintLevel: 0,
    goldBonusMultiplier: 1.0,
    crackResistanceBonus: 0,
    baseSuccessBonus: 0
  },
  {
    id: 'flame',
    name: '화염검',
    description: '검 매각 시 골드 +25% 추가 보너스!',
    icon: '🔥',
    unlockedByDefault: false,
    requiredBlueprintLevel: 1,
    goldBonusMultiplier: 1.25,
    crackResistanceBonus: 0,
    baseSuccessBonus: 0
  },
  {
    id: 'guardian',
    name: '수호검',
    description: '균열 발생 위험 20% 감소 특화 검.',
    icon: '🛡️',
    unlockedByDefault: false,
    requiredBlueprintLevel: 2,
    goldBonusMultiplier: 0.95,
    crackResistanceBonus: 0.2,
    baseSuccessBonus: 0
  },
  {
    id: 'berserk',
    name: '광전사의 검',
    description: '공격력과 정수가 높지만 균열 위험 소폭 증가.',
    icon: '🪓',
    unlockedByDefault: false,
    requiredBlueprintLevel: 3,
    goldBonusMultiplier: 1.4,
    crackResistanceBonus: -0.15,
    baseSuccessBonus: 0.5
  },
  {
    id: 'dragon',
    name: '고대용검',
    description: '전설의 용검. 매각가 +50% 및 성공률 보너스.',
    icon: '🐉',
    unlockedByDefault: false,
    requiredBlueprintLevel: 4,
    goldBonusMultiplier: 1.5,
    crackResistanceBonus: 0.1,
    baseSuccessBonus: 1.0
  }
];

// 사냥 골드 수급 최소화 (1~25 G/s)
export const SWORD_STAGES: SwordStageInfo[] = [
  { level: 0, name: '녹슨 철검', attackPower: 10, goldPerSec: 1, enhanceCost: 100, baseSuccessRate: 100, keepFailRate: 100, crackFailRate: 0, dropFailRate: 0, color: '#9e9e9e', glowColor: 'rgba(158, 158, 158, 0.4)' },
  { level: 1, name: '날카로운 철검', attackPower: 25, goldPerSec: 2, enhanceCost: 250, baseSuccessRate: 95, keepFailRate: 100, crackFailRate: 0, dropFailRate: 0, color: '#b0bec5', glowColor: 'rgba(176, 190, 197, 0.4)' },
  { level: 2, name: '강철 장검', attackPower: 55, goldPerSec: 3, enhanceCost: 600, baseSuccessRate: 90, keepFailRate: 100, crackFailRate: 0, dropFailRate: 0, color: '#90caf9', glowColor: 'rgba(144, 202, 249, 0.5)' },
  { level: 3, name: '정련된 세이버', attackPower: 120, goldPerSec: 4, enhanceCost: 1200, baseSuccessRate: 85, keepFailRate: 100, crackFailRate: 0, dropFailRate: 0, color: '#64b5f6', glowColor: 'rgba(100, 181, 246, 0.5)' },
  { level: 4, name: '기사의 미스릴검', attackPower: 260, goldPerSec: 5, enhanceCost: 2500, baseSuccessRate: 75, keepFailRate: 90, crackFailRate: 10, dropFailRate: 0, color: '#42a5f5', glowColor: 'rgba(66, 165, 245, 0.6)' },
  
  { level: 5, name: '불꽃을 머금은 검', attackPower: 550, goldPerSec: 7, enhanceCost: 5000, baseSuccessRate: 65, keepFailRate: 70, crackFailRate: 30, dropFailRate: 0, color: '#ff9800', glowColor: 'rgba(255, 152, 0, 0.6)' },
  { level: 6, name: '화염 블레이드', attackPower: 1200, goldPerSec: 9, enhanceCost: 10000, baseSuccessRate: 55, keepFailRate: 60, crackFailRate: 40, dropFailRate: 0, color: '#ff5722', glowColor: 'rgba(255, 87, 34, 0.6)' },
  { level: 7, name: '서리 칼날', attackPower: 2500, goldPerSec: 11, enhanceCost: 20000, baseSuccessRate: 48, keepFailRate: 55, crackFailRate: 40, dropFailRate: 5, color: '#26c6da', glowColor: 'rgba(38, 198, 218, 0.6)' },
  { level: 8, name: '폭풍의 가디언', attackPower: 5200, goldPerSec: 13, enhanceCost: 40000, baseSuccessRate: 40, keepFailRate: 50, crackFailRate: 42, dropFailRate: 8, color: '#26a69a', glowColor: 'rgba(38, 166, 154, 0.7)' },
  { level: 9, name: '흑요석 마검', attackPower: 11000, goldPerSec: 15, enhanceCost: 80000, baseSuccessRate: 35, keepFailRate: 45, crackFailRate: 45, dropFailRate: 10, color: '#ab47bc', glowColor: 'rgba(171, 71, 188, 0.7)' },
  
  { level: 10, name: '용의 송곳니', attackPower: 24000, goldPerSec: 17, enhanceCost: 150000, baseSuccessRate: 28, keepFailRate: 45, crackFailRate: 45, dropFailRate: 10, color: '#ec407a', glowColor: 'rgba(236, 64, 122, 0.8)' },
  { level: 11, name: '태양의 심장검', attackPower: 50000, goldPerSec: 19, enhanceCost: 300000, baseSuccessRate: 22, keepFailRate: 40, crackFailRate: 48, dropFailRate: 12, color: '#ffa726', glowColor: 'rgba(255, 167, 38, 0.8)' },
  { level: 12, name: '심해의 트라이던트', attackPower: 110000, goldPerSec: 20, enhanceCost: 600000, baseSuccessRate: 18, keepFailRate: 35, crackFailRate: 50, dropFailRate: 15, color: '#29b6f6', glowColor: 'rgba(41, 182, 246, 0.8)' },
  { level: 13, name: '뇌신 마스터포지', attackPower: 240000, goldPerSec: 22, enhanceCost: 1200000, baseSuccessRate: 14, keepFailRate: 30, crackFailRate: 52, dropFailRate: 18, color: '#7e57c2', glowColor: 'rgba(126, 87, 194, 0.8)' },
  { level: 14, name: '시공의 단도', attackPower: 520000, goldPerSec: 23, enhanceCost: 2500000, baseSuccessRate: 10, keepFailRate: 25, crackFailRate: 55, dropFailRate: 20, color: '#8d6e63', glowColor: 'rgba(141, 110, 99, 0.8)' },
  
  { level: 15, name: '천뢰신검', attackPower: 1200000, goldPerSec: 25, enhanceCost: 5000000, baseSuccessRate: 8.0, keepFailRate: 20, crackFailRate: 58, dropFailRate: 22, color: '#ffee58', glowColor: 'rgba(255, 238, 88, 0.9)' },
  { level: 16, name: '신성 집행자', attackPower: 2800000, goldPerSec: 26, enhanceCost: 10000000, baseSuccessRate: 5.5, keepFailRate: 15, crackFailRate: 60, dropFailRate: 25, color: '#d4e157', glowColor: 'rgba(212, 225, 87, 0.9)' },
  { level: 17, name: '영혼 파쇄검', attackPower: 6500000, goldPerSec: 28, enhanceCost: 22000000, baseSuccessRate: 4.0, keepFailRate: 10, crackFailRate: 62, dropFailRate: 28, color: '#78909c', glowColor: 'rgba(120, 144, 156, 0.9)' },
  { level: 18, name: '신살의 패검', attackPower: 15000000, goldPerSec: 30, enhanceCost: 45000000, baseSuccessRate: 2.8, keepFailRate: 8, crackFailRate: 62, dropFailRate: 30, color: '#ef5350', glowColor: 'rgba(239, 83, 80, 0.95)' },
  { level: 19, name: '멸계검', attackPower: 35000000, goldPerSec: 32, enhanceCost: 90000000, baseSuccessRate: 1.8, keepFailRate: 5, crackFailRate: 65, dropFailRate: 30, color: '#b71c1c', glowColor: 'rgba(183, 28, 28, 0.95)' },
  
  { level: 20, name: '전설의 검 (LEGENDARY)', attackPower: 100000000, goldPerSec: 50, enhanceCost: 0, baseSuccessRate: 0, keepFailRate: 0, crackFailRate: 0, dropFailRate: 0, color: '#ffd700', glowColor: 'rgba(255, 215, 0, 1)' }
];

export const PERMANENT_UPGRADES: PermanentUpgrade[] = [
  {
    id: 'forge_temp',
    name: '화로 온도',
    description: '검 매각 시 획득 골드 +15% 추가 상승',
    currentLevel: 0,
    maxLevel: 15,
    baseCost: 5,
    costMultiplier: 2.0,
    icon: '🔥'
  },
  {
    id: 'master_capital',
    name: '장인의 자본',
    description: '런 시작/매각 후 기본 시작 골드 수량 증가 (+1,000 G / Lv)',
    currentLevel: 0,
    maxLevel: 20,
    baseCost: 10,
    costMultiplier: 1.8,
    icon: '💰'
  },
  {
    id: 'precision_hammer',
    name: '정밀 망치질',
    description: '강화 실패 시 연속 보정 상승치 +0.2%p 증가',
    currentLevel: 0,
    maxLevel: 5,
    baseCost: 25,
    costMultiplier: 2.5,
    icon: '🔨'
  },
  {
    id: 'crack_control',
    name: '균열 제어',
    description: '강화 실패 시 균열 발생 위험 확률 소폭 감소',
    currentLevel: 0,
    maxLevel: 10,
    baseCost: 20,
    costMultiplier: 2.2,
    icon: '🛡️'
  },
  {
    id: 'repair_tech',
    name: '수리 기술',
    description: '균열 수리 비용 8% 할인 (최대 -80%)',
    currentLevel: 0,
    maxLevel: 10,
    baseCost: 15,
    costMultiplier: 2.0,
    icon: '🔧'
  },
  {
    id: 'ancient_blueprint',
    name: '고대 설계도',
    description: '화염검, 수호검, 광전사검, 고대용검 해금',
    currentLevel: 0,
    maxLevel: 4,
    baseCost: 50,
    costMultiplier: 3.5,
    icon: '📜'
  }
];

type CatalystBossDefinition = BossDefinition & {
  readonly atlasCell: number;
  readonly catalyst: CatalystDefinition;
};

const CATALYST_BOSSES: readonly CatalystBossDefinition[] = [
  {
    id: 'boss_10', name: '불꽃 골렘', milestone: 10, maxHp: SWORD_STAGES[10].attackPower * 36,
    rewardEssences: 30, rewardGold: 2000, rewardBlueprint: true, icon: '🔥', isBoss: true, atlasSource: 'boss', atlasCell: 0,
    catalyst: { id: 'molten_core', name: '용융된 화염핵', gateLevel: 10, dropRate: 60, pityThreshold: 3, chargesPerItem: 3, atlasCell: 0 }
  },
  {
    id: 'boss_11', name: '심해 크라켄', milestone: 11, maxHp: SWORD_STAGES[11].attackPower * 40,
    rewardEssences: 0, rewardGold: 3000, rewardBlueprint: false, icon: '🐙', isBoss: true, atlasSource: 'boss', atlasCell: 1,
    catalyst: { id: 'abyss_pearl', name: '심연의 진주', gateLevel: 11, dropRate: 55, pityThreshold: 3, chargesPerItem: 3, atlasCell: 1 }
  },
  {
    id: 'boss_12', name: '흑철 거신', milestone: 12, maxHp: SWORD_STAGES[12].attackPower * 44,
    rewardEssences: 0, rewardGold: 4500, rewardBlueprint: false, icon: '🗿', isBoss: true, atlasSource: 'boss', atlasCell: 2,
    catalyst: { id: 'titan_heart', name: '거인의 심장', gateLevel: 12, dropRate: 50, pityThreshold: 4, chargesPerItem: 3, atlasCell: 2 }
  },
  {
    id: 'boss_13', name: '천뢰신수', milestone: 13, maxHp: SWORD_STAGES[13].attackPower * 48,
    rewardEssences: 0, rewardGold: 6500, rewardBlueprint: false, icon: '⚡', isBoss: true, atlasSource: 'boss', atlasCell: 3,
    catalyst: { id: 'thunder_horn', name: '뇌전의 뿔', gateLevel: 13, dropRate: 45, pityThreshold: 4, chargesPerItem: 3, atlasCell: 3 }
  },
  {
    id: 'boss_14', name: '시간의 사신', milestone: 14, maxHp: SWORD_STAGES[14].attackPower * 52,
    rewardEssences: 0, rewardGold: 8000, rewardBlueprint: false, icon: '⏳', isBoss: true, atlasSource: 'boss', atlasCell: 4,
    catalyst: { id: 'stopped_gear', name: '멈춰버린 톱니', gateLevel: 14, dropRate: 40, pityThreshold: 5, chargesPerItem: 3, atlasCell: 4 }
  },
  {
    id: 'boss_15', name: '불멸의 봉황', milestone: 15, maxHp: SWORD_STAGES[15].attackPower * 56,
    rewardEssences: 150, rewardGold: 10000, rewardBlueprint: true, icon: '🦅', isBoss: true, atlasSource: 'boss', atlasCell: 5,
    catalyst: { id: 'rebirth_feather', name: '윤회의 깃털', gateLevel: 15, dropRate: 35, pityThreshold: 5, chargesPerItem: 2, atlasCell: 5 }
  },
  {
    id: 'boss_16', name: '공허룡', milestone: 16, maxHp: SWORD_STAGES[16].attackPower * 60,
    rewardEssences: 0, rewardGold: 15000, rewardBlueprint: false, icon: '🐉', isBoss: true, atlasSource: 'boss', atlasCell: 6,
    catalyst: { id: 'void_fang', name: '공허의 송곳니', gateLevel: 16, dropRate: 28, pityThreshold: 6, chargesPerItem: 2, atlasCell: 6 }
  },
  {
    id: 'boss_17', name: '별을 먹는 자', milestone: 17, maxHp: SWORD_STAGES[17].attackPower * 64,
    rewardEssences: 0, rewardGold: 22000, rewardBlueprint: false, icon: '🌌', isBoss: true, atlasSource: 'boss', atlasCell: 7,
    catalyst: { id: 'collapsed_star', name: '붕괴한 별의 핵', gateLevel: 17, dropRate: 20, pityThreshold: 8, chargesPerItem: 2, atlasCell: 7 }
  },
  {
    id: 'boss_18', name: '타락한 신', milestone: 18, maxHp: SWORD_STAGES[18].attackPower * 68,
    rewardEssences: 0, rewardGold: 32000, rewardBlueprint: false, icon: '😈', isBoss: true, atlasSource: 'boss', atlasCell: 8,
    catalyst: { id: 'godblood_crystal', name: '신혈 결정', gateLevel: 18, dropRate: 15, pityThreshold: 10, chargesPerItem: 1, atlasCell: 8 }
  },
  {
    id: 'boss_19', name: '종말의 마왕', milestone: 19, maxHp: SWORD_STAGES[19].attackPower * 72,
    rewardEssences: 0, rewardGold: 45000, rewardBlueprint: false, icon: '👿', isBoss: true, atlasSource: 'boss', atlasCell: 9,
    catalyst: { id: 'end_ember', name: '종말의 불씨', gateLevel: 19, dropRate: 10, pityThreshold: 15, chargesPerItem: 1, atlasCell: 9 }
  }
];

export const CATALYST_DEFINITIONS: readonly CatalystDefinition[] = CATALYST_BOSSES.map(boss => boss.catalyst);

export const BOSS_LIST: readonly BossDefinition[] = [
  {
    id: 'boss_5', name: '잿불 사냥개', milestone: 5, maxHp: SWORD_STAGES[5].attackPower * 28,
    rewardEssences: 8, rewardGold: 500, rewardBlueprint: true, icon: '🐺', isBoss: true,
    atlasSource: 'midboss', atlasCell: 0, catalyst: null
  },
  {
    id: 'boss_6', name: '용광로 난동꾼', milestone: 6, maxHp: SWORD_STAGES[6].attackPower * 30,
    rewardEssences: 0, rewardGold: 750, rewardBlueprint: false, icon: '👹', isBoss: true,
    atlasSource: 'midboss', atlasCell: 1, catalyst: null
  },
  {
    id: 'boss_7', name: '쇠사슬 감시자', milestone: 7, maxHp: SWORD_STAGES[7].attackPower * 32,
    rewardEssences: 0, rewardGold: 1000, rewardBlueprint: false, icon: '⛓️', isBoss: true,
    atlasSource: 'midboss', atlasCell: 2, catalyst: null
  },
  {
    id: 'boss_8', name: '잿불 와이번', milestone: 8, maxHp: SWORD_STAGES[8].attackPower * 34,
    rewardEssences: 0, rewardGold: 1350, rewardBlueprint: false, icon: '🐲', isBoss: true,
    atlasSource: 'midboss', atlasCell: 3, catalyst: null
  },
  {
    id: 'boss_9', name: '흑철 모루기사', milestone: 9, maxHp: SWORD_STAGES[9].attackPower * 36,
    rewardEssences: 0, rewardGold: 1700, rewardBlueprint: false, icon: '🛡️', isBoss: true,
    atlasSource: 'midboss', atlasCell: 4, catalyst: null
  },
  ...CATALYST_BOSSES,
  {
    id: 'boss_20', name: '종말의 마왕', milestone: 20, maxHp: 250000000,
    rewardEssences: 600, rewardGold: 50000, rewardBlueprint: true, icon: '👿', isBoss: true,
    atlasSource: null, atlasCell: null, catalyst: null
  }
];

export function getBossBagSizeForLevel(level: number): number | null {
  if (level >= 5 && level <= 9) return 6;
  if (level >= 10 && level <= 13) return 8;
  if (level >= 14 && level <= 17) return 12;
  if (level === 18) return 20;
  if (level === 19) return 30;
  return null;
}

export function getRequiredProgressChargeId(level: number): ProgressChargeId | null {
  if (level >= 10 && level <= 13) return 'tempered';
  if (level >= 14 && level <= 19) return 'awakened';
  return null;
}

export function createEmptyCatalystCountMap(): CatalystCountMap {
  return Object.fromEntries(CATALYST_DEFINITIONS.map(definition => [definition.id, 0])) as CatalystCountMap;
}

export function getCatalystDefinitionForLevel(level: number): CatalystDefinition | null {
  return CATALYST_DEFINITIONS.find(definition => definition.gateLevel === level) || null;
}

export function getCatalystGateStatus(
  profile: UserGameProfile,
  level = profile.currentLevel
): CatalystGateStatus | null {
  const definition = getCatalystDefinitionForLevel(level);
  if (!definition) return null;

  const inventoryCount = profile.catalystInventory[definition.id] || 0;
  const pityCount = profile.catalystPity[definition.id] || 0;
  const activeCharges = profile.activeCatalystCharges[definition.id] || 0;
  const discovered = profile.discoveredCatalysts.includes(definition.id);

  return {
    definition,
    inventoryCount,
    pityCount,
    activeCharges,
    discovered,
    killsUntilGuaranteed: definition.gateLevel === 10 && !discovered
      ? 1
      : Math.max(1, definition.pityThreshold - pityCount),
    canActivate: profile.currentLevel === level
      && profile.currentCrackCount < 3
      && inventoryCount > 0
      && activeCharges === 0
  };
}

export function getBossDefinitionForMilestone(milestone: number): BossDefinition | null {
  return BOSS_LIST.find(boss => boss.milestone === milestone) || null;
}

/**
 * 강화 표시와 실제 판정에서 함께 사용하는 계산 계약
 */
export function calculateEnhancePreview(profile: EnhancePreviewInput): EnhancePreview {
  const stageInfo = SWORD_STAGES[profile.currentLevel];
  if (!stageInfo) {
    throw new RangeError(`지원하지 않는 강화 단계입니다: ${profile.currentLevel}`);
  }

  const seriesInfo = SWORD_SERIES_LIST.find(series => series.id === profile.currentSeriesId) || SWORD_SERIES_LIST[0];
  const precisionLevel = profile.upgrades.precision_hammer || 0;
  const failBonusPerFail = 0.5 + precisionLevel * 0.2;
  const failBonus = profile.consecutiveFailCount * failBonusPerFail;

  let successRate = stageInfo.baseSuccessRate + seriesInfo.baseSuccessBonus + failBonus;
  const maxAllowedSuccess = Math.min(stageInfo.baseSuccessRate * 2, stageInfo.baseSuccessRate + 5);
  successRate = Math.max(0, Math.min(100, successRate, maxAllowedSuccess));

  const isProtected = profile.totalEnhanceAttempts + 1 <= 3 && profile.currentLevel < 3;
  if (isProtected) {
    successRate = 100;
  }

  const crackControlLevel = profile.upgrades.crack_control || 0;
  const crackResistance = seriesInfo.crackResistanceBonus + crackControlLevel * 0.02;
  const failureMass = Math.max(0, 100 - successRate);
  const conditionalCrackRate = Math.max(0, Math.min(100, stageInfo.crackFailRate * (1 - crackResistance)));
  const conditionalDropRate = Math.max(0, Math.min(stageInfo.dropFailRate, 100 - conditionalCrackRate));
  const crackRate = failureMass * conditionalCrackRate / 100;
  const dropRate = failureMass * conditionalDropRate / 100;
  const keepRate = Math.max(0, 100 - successRate - crackRate - dropRate);

  return {
    successRate,
    keepRate,
    crackRate,
    dropRate,
    failBonus,
    cost: stageInfo.enhanceCost,
    isProtected
  };
}

/**
 * 검 매각가 산정 공식
 */
export function calculateSwordSellValue(level: number, seriesId: string, crackCount: number): number {
  if (level <= 0) return 150; // 기본 +0 철검 매각가

  // 총 누적 강화 비용 계산
  let totalCostSpent = 0;
  for (let i = 0; i < level; i++) {
    totalCostSpent += SWORD_STAGES[i].enhanceCost;
  }

  // 매각 배율 (기본 1.8배 + 고강화 추가 제곱 가치)
  const baseValue = totalCostSpent * 1.8 + Math.floor(Math.pow(level, 2.3) * 600);

  // 계열 보너스
  const seriesInfo = SWORD_SERIES_LIST.find(s => s.id === seriesId) || SWORD_SERIES_LIST[0];
  let finalVal = baseValue * seriesInfo.goldBonusMultiplier;

  // 균열 감가상각 (1개 당 -15%)
  if (crackCount > 0) {
    finalVal *= (1 - crackCount * 0.15);
  }

  return Math.round(finalVal);
}
