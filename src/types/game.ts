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

export type ProgressChargeId = 'tempered' | 'awakened';

export interface ProgressChargeMap {
  tempered: number;
  awakened: number;
}

export interface ActiveBossEncounter {
  encounterId: string;
  weaponId: string;
  levelSnapshot: number;
  bossId: string;
  revealedAt: number;
}

export interface BossEncounterState {
  weaponId: string;
  bagSize: number;
  cursor: number;
  bossSlot: number;
  cycle: number;
  active: ActiveBossEncounter | null;
}

export interface CurrentWeaponState {
  weaponId: string;
  ordinal: number;
  progressCharges: ProgressChargeMap;
  bossEncounter: BossEncounterState | null;
  claimedRareBossStages: Array<18 | 19>;
  endShardFirstAttemptGranted: boolean;
}

export type TranscendenceRelicId = 'godblood' | 'end';

export interface TranscendenceRelicProgress {
  relics: number;
  shards: number;
}

export interface TranscendenceProgress {
  godblood: TranscendenceRelicProgress;
  end: TranscendenceRelicProgress;
}

export interface TranscendenceRewardResult {
  source: 'BOSS_18' | 'BOSS_19' | 'ENHANCE_20_FIRST_ATTEMPT' | 'ENHANCE_20_SUCCESS';
  relicId: TranscendenceRelicId;
  fullRelicDropped: boolean;
  relicsGained: number;
  shardsGained: number;
  synthesizedRelics: number;
  relicsAfter: number;
  shardsAfter: number;
}

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
  progressChargeId: ProgressChargeId | null;
  progressChargeSpent: boolean;
  progressChargesRemaining: number;
  transcendenceRewards: TranscendenceRewardResult[];
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
  keepRate: number;
  crackRate: number;
  dropRate: number;
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
  encounterId: string;
  levelSnapshot: number;
  firstRewardGranted: boolean;
  catalystDrop: CatalystDropResult | null;
  progressReward: ProgressChargeRewardResult;
  transcendenceReward: TranscendenceRewardResult | null;
  nextEncounter: BossEncounterState | null;
}

export interface ProgressChargeRewardResult {
  before: ProgressChargeMap;
  gained: ProgressChargeMap;
  after: ProgressChargeMap;
}

export interface HuntResolution {
  goldGained: number;
  bagProgressed: boolean;
  paused: boolean;
  bossRevealed: boolean;
  activeEncounter: ActiveBossEncounter | null;
  encounter: BossEncounterState | null;
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
  readonly atlasSource: 'midboss' | 'boss' | null;
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
  schemaVersion: 2;
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
  currentWeapon: CurrentWeaponState;
  transcendence: TranscendenceProgress;
  
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
