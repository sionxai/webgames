export type SwordSeriesId = 'kingdom' | 'flame' | 'guardian' | 'berserk' | 'dragon';

export interface SwordSeries {
  id: SwordSeriesId;
  name: string;
  description: string;
  icon: string;
  unlockedByDefault: boolean;
  requiredBlueprintLevel: number;
  goldBonusMultiplier: number;
  crackResistanceBonus: number; // 0 to 1
  baseSuccessBonus: number; // %p
}

export interface SwordStageInfo {
  level: number; // 0 ~ 20
  name: string;
  attackPower: number;
  goldPerSec: number;
  enhanceCost: number;
  baseSuccessRate: number; // 0 ~ 100
  keepFailRate: number; // %
  crackFailRate: number; // %
  dropFailRate: number; // %
  color: string;
  glowColor: string;
}

export type FailResultType = 'KEEP' | 'CRACK' | 'DROP' | 'DESTROYED';

export type CatalystId =
  | 'molten_core'
  | 'abyss_pearl'
  | 'titan_heart'
  | 'thunder_horn'
  | 'stopped_gear'
  | 'rebirth_feather'
  | 'void_fang'
  | 'collapsed_star'
  | 'godblood_crystal'
  | 'end_ember';

export type CatalystCountMap = Record<CatalystId, number>;

export interface CatalystDefinition {
  readonly id: CatalystId;
  readonly name: string;
  readonly gateLevel: number;
  readonly dropRate: number; // 0 ~ 100
  readonly pityThreshold: number;
  readonly chargesPerItem: number;
  readonly atlasCell: number;
}

export interface CatalystGateStatus {
  definition: CatalystDefinition;
  inventoryCount: number;
  pityCount: number;
  activeCharges: number;
  discovered: boolean;
  killsUntilGuaranteed: number;
  canActivate: boolean;
}

export type CatalystDropReason = 'NONE' | 'NATURAL' | 'PITY' | 'FIRST_DISCOVERY';

export interface CatalystDropResult {
  catalystId: CatalystId;
  gateLevel: number;
  dropped: boolean;
  quantityGained: number;
  reason: CatalystDropReason;
  guaranteed: boolean;
  pityBefore: number;
  pityAfter: number;
  inventoryAfter: number;
  discoveredForFirstTime: boolean;
}

export interface CatalystActivationResult {
  catalystId: CatalystId;
  gateLevel: number;
  inventoryRemaining: number;
  activeCharges: number;
}

export interface EnhanceAttemptResult {
  success: boolean;
  previousLevel: number;
  newLevel: number;
  resultType: 'SUCCESS' | FailResultType;
  crackCount: number;
  isRestored: boolean;
  costSpent: number;
  catalystId: CatalystId | null;
  catalystChargeSpent: boolean;
  catalystChargesRemaining: number;
  message: string;
  timestamp: number;
}

export interface EnhancePreviewInput {
  currentSeriesId: SwordSeriesId;
  currentLevel: number;
  consecutiveFailCount: number;
  totalEnhanceAttempts: number;
  upgrades: Readonly<Record<string, number>>;
}

export interface EnhancePreview {
  successRate: number;
  crackRate: number;
  failBonus: number;
  cost: number;
  isProtected: boolean;
}

export interface BossRewardClaimResult {
  milestone: number;
  claimed: boolean;
  goldGained: number;
  essencesGained: number;
}

export interface BossDefeatResult extends BossRewardClaimResult {
  firstRewardGranted: boolean;
  catalystDrop: CatalystDropResult | null;
}

export interface BossDefinition {
  readonly id: string;
  readonly name: string;
  readonly milestone: number;
  readonly maxHp: number;
  readonly rewardEssences: number;
  readonly rewardGold: number;
  readonly rewardBlueprint: boolean;
  readonly icon: string;
  readonly isBoss: true;
  readonly atlasCell: number | null;
  readonly catalyst: CatalystDefinition | null;
}

export interface PermanentUpgrade {
  id: 'forge_temp' | 'master_capital' | 'precision_hammer' | 'crack_control' | 'repair_tech' | 'ancient_blueprint';
  name: string;
  description: string;
  currentLevel: number;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  icon: string;
}

export interface UserGameProfile {
  userId: string;
  nickname: string;
  gold: number;
  essences: number;
  currentSeriesId: SwordSeriesId;
  currentLevel: number;
  currentCrackCount: number;
  consecutiveFailCount: number; // 실패 보정용
  maxLevelReached: number;
  totalEnhanceAttempts: number;
  totalDestroyedCount: number;
  adRestoredCountThisRun: number;
  isPureRun: boolean; // 광고 복구 안 쓴 런 여부
  runStartTime: number;
  claimedBossMilestonesThisRun: number[];
  catalystInventory: CatalystCountMap;
  catalystPity: CatalystCountMap;
  discoveredCatalysts: CatalystId[];
  activeCatalystCharges: CatalystCountMap;
  
  // 영구 성장 레벨
  upgrades: Record<string, number>;
  
  // 도감 & 업적
  unlockedSwords: string[]; // `${seriesId}_${level}`
  unlockedAchievements: string[];
}

export interface MonsterBoss {
  id: string;
  name: string;
  maxHp: number;
  currentHp: number;
  rewardEssences: number;
  rewardGold: number;
  rewardBlueprint: boolean;
  icon: string;
  isBoss: boolean;
  levelMilestone: number; // 5, 10, 15, 20
}

export interface RankingEntry {
  id: string;
  userId: string;
  nickname: string;
  swordSeriesId: SwordSeriesId;
  maxLevel: number;
  attemptsCount: number;
  isPure: boolean;
  timestamp: number;
  dateStr: string;
}

export interface SharedChallenge {
  id: string;
  creatorNickname: string;
  seriesId: SwordSeriesId;
  targetLevel: number;
  attemptsCount: number;
  percentileText: string;
  timestamp: number;
}

export interface ProbabilityTableItem {
  level: number;
  name: string;
  cost: number;
  successRate: number;
  keepRate: number;
  crackRate: number;
  dropRate: number;
  expectedGold: number;
}
