import type {
  BossDefeatResult,
  CatalystActivationResult,
  CatalystCountMap,
  CatalystDefinition,
  CatalystDropResult,
  CatalystId,
  EnhanceAttemptResult,
  FailResultType,
  SwordSeriesId,
  UserGameProfile
} from '../types/game';
import {
  BOSS_LIST,
  CATALYST_DEFINITIONS,
  PERMANENT_UPGRADES,
  SWORD_SERIES_LIST,
  SWORD_STAGES,
  calculateEnhancePreview,
  calculateSwordSellValue,
  createEmptyCatalystCountMap,
  getBossDefinitionForMilestone,
  getCatalystGateStatus
} from '../constants/gameBalance';

const LOCAL_STORAGE_KEY = 'project_forge_user_profile_v1';
const DEFAULT_UPGRADES: UserGameProfile['upgrades'] = {
  forge_temp: 0,
  master_capital: 0,
  precision_hammer: 0,
  crack_control: 0,
  repair_tech: 0,
  ancient_blueprint: 0
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNonNegativeInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const numericValue = readFiniteNumber(value, fallback);
  return Math.min(maximum, Math.max(0, Math.floor(numericValue)));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function mergeUpgradeLevels(value: unknown): Record<string, number> {
  const upgrades = { ...DEFAULT_UPGRADES };
  if (!isRecord(value)) return upgrades;

  Object.entries(value).forEach(([upgradeId, level]) => {
    if (typeof level === 'number' && Number.isFinite(level)) {
      upgrades[upgradeId] = Math.max(0, Math.floor(level));
    }
  });
  return upgrades;
}

function mergeStringArray(defaults: string[], value: unknown): string[] {
  if (!Array.isArray(value)) return [...defaults];
  const savedValues = value.filter((item): item is string => typeof item === 'string');
  return [...new Set([...defaults, ...savedValues])];
}

function readClaimedBossMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const validMilestones = new Set(BOSS_LIST.map(boss => boss.milestone));
  const savedMilestones = value.filter(
    (milestone): milestone is number => typeof milestone === 'number' && validMilestones.has(milestone)
  );
  return [...new Set(savedMilestones)];
}

function readCatalystCounts(
  value: unknown,
  maximumForDefinition: (definition: CatalystDefinition) => number = () => Number.MAX_SAFE_INTEGER
): CatalystCountMap {
  const counts = createEmptyCatalystCountMap();
  if (!isRecord(value)) return counts;

  CATALYST_DEFINITIONS.forEach(definition => {
    counts[definition.id] = readNonNegativeInteger(
      value[definition.id],
      0,
      maximumForDefinition(definition)
    );
  });
  return counts;
}

function readDiscoveredCatalysts(value: unknown): CatalystId[] {
  const validIds = new Set<CatalystId>(CATALYST_DEFINITIONS.map(definition => definition.id));

  if (Array.isArray(value)) {
    return [...new Set(value.filter((id): id is CatalystId => typeof id === 'string' && validIds.has(id as CatalystId)))];
  }

  if (isRecord(value)) {
    return CATALYST_DEFINITIONS
      .filter(definition => value[definition.id] === true)
      .map(definition => definition.id);
  }

  return [];
}

function cloneProfile(profile: UserGameProfile): UserGameProfile {
  return {
    ...profile,
    upgrades: { ...profile.upgrades },
    unlockedSwords: [...profile.unlockedSwords],
    unlockedAchievements: [...profile.unlockedAchievements],
    claimedBossMilestonesThisRun: [...profile.claimedBossMilestonesThisRun],
    catalystInventory: { ...profile.catalystInventory },
    catalystPity: { ...profile.catalystPity },
    discoveredCatalysts: [...profile.discoveredCatalysts],
    activeCatalystCharges: { ...profile.activeCatalystCharges }
  };
}

export class ServerSimulator {
  private profile: UserGameProfile;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.profile = this.loadOrCreateProfile();
  }

  public getProfile(): UserGameProfile {
    return cloneProfile(this.profile);
  }

  private createDefaultProfile(): UserGameProfile {
    return {
      userId: 'usr_' + Math.random().toString(36).substring(2, 9),
      nickname: '대장장이_' + Math.floor(1000 + Math.random() * 9000),
      gold: 500,
      essences: 0,
      currentSeriesId: 'kingdom',
      currentLevel: 0,
      currentCrackCount: 0,
      consecutiveFailCount: 0,
      maxLevelReached: 0,
      totalEnhanceAttempts: 0,
      totalDestroyedCount: 0,
      adRestoredCountThisRun: 0,
      isPureRun: true,
      runStartTime: Date.now(),
      claimedBossMilestonesThisRun: [],
      catalystInventory: createEmptyCatalystCountMap(),
      catalystPity: createEmptyCatalystCountMap(),
      discoveredCatalysts: [],
      activeCatalystCharges: createEmptyCatalystCountMap(),
      upgrades: { ...DEFAULT_UPGRADES },
      unlockedSwords: ['kingdom_0'],
      unlockedAchievements: []
    };
  }

  private migrateProfile(savedProfile: Record<string, unknown>, defaults: UserGameProfile): UserGameProfile {
    const savedSeriesId = savedProfile.currentSeriesId;
    const currentSeriesId = typeof savedSeriesId === 'string'
      && SWORD_SERIES_LIST.some(series => series.id === savedSeriesId)
      ? savedSeriesId as SwordSeriesId
      : defaults.currentSeriesId;

    const currentCrackCount = readNonNegativeInteger(savedProfile.currentCrackCount, defaults.currentCrackCount, 3);
    const catalystInventory = readCatalystCounts(savedProfile.catalystInventory ?? savedProfile.inventory);
    const catalystPity = readCatalystCounts(
      savedProfile.catalystPity ?? savedProfile.pity,
      definition => definition.pityThreshold - 1
    );
    let activeCatalystCharges = readCatalystCounts(
      savedProfile.activeCatalystCharges ?? savedProfile.activeCharges,
      definition => definition.chargesPerItem
    );
    const discoveredCatalysts = readDiscoveredCatalysts(
      savedProfile.discoveredCatalysts ?? savedProfile.discovered
    );

    CATALYST_DEFINITIONS.forEach(definition => {
      if ((catalystInventory[definition.id] > 0 || activeCatalystCharges[definition.id] > 0)
        && !discoveredCatalysts.includes(definition.id)) {
        discoveredCatalysts.push(definition.id);
      }
    });

    if (currentCrackCount >= 3) {
      activeCatalystCharges = createEmptyCatalystCountMap();
    }

    return {
      userId: readString(savedProfile.userId, defaults.userId),
      nickname: readString(savedProfile.nickname, defaults.nickname),
      gold: readFiniteNumber(savedProfile.gold, defaults.gold),
      essences: readFiniteNumber(savedProfile.essences, defaults.essences),
      currentSeriesId,
      currentLevel: readNonNegativeInteger(savedProfile.currentLevel, defaults.currentLevel, SWORD_STAGES.length - 1),
      currentCrackCount,
      consecutiveFailCount: readNonNegativeInteger(savedProfile.consecutiveFailCount, defaults.consecutiveFailCount),
      maxLevelReached: readNonNegativeInteger(savedProfile.maxLevelReached, defaults.maxLevelReached, SWORD_STAGES.length - 1),
      totalEnhanceAttempts: readNonNegativeInteger(savedProfile.totalEnhanceAttempts, defaults.totalEnhanceAttempts),
      totalDestroyedCount: readNonNegativeInteger(savedProfile.totalDestroyedCount, defaults.totalDestroyedCount),
      adRestoredCountThisRun: readNonNegativeInteger(savedProfile.adRestoredCountThisRun, defaults.adRestoredCountThisRun),
      isPureRun: readBoolean(savedProfile.isPureRun, defaults.isPureRun),
      runStartTime: readFiniteNumber(savedProfile.runStartTime, defaults.runStartTime),
      claimedBossMilestonesThisRun: readClaimedBossMilestones(savedProfile.claimedBossMilestonesThisRun),
      catalystInventory,
      catalystPity,
      discoveredCatalysts,
      activeCatalystCharges,
      upgrades: mergeUpgradeLevels(savedProfile.upgrades),
      unlockedSwords: mergeStringArray(defaults.unlockedSwords, savedProfile.unlockedSwords),
      unlockedAchievements: mergeStringArray(defaults.unlockedAchievements, savedProfile.unlockedAchievements)
    };
  }

  private persistProfile(profile: UserGameProfile): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error('Failed to save profile', error);
    }
  }

  private loadOrCreateProfile(): UserGameProfile {
    const defaults = this.createDefaultProfile();
    let saved: string | null = null;

    try {
      saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to load profile from localStorage', error);
    }

    if (saved !== null) {
      try {
        const parsedProfile: unknown = JSON.parse(saved);
        if (isRecord(parsedProfile)) {
          const migratedProfile = this.migrateProfile(parsedProfile, defaults);
          this.persistProfile(migratedProfile);
          return migratedProfile;
        }
        console.warn('Stored profile is not an object; a new profile will be created.');
      } catch (error) {
        console.warn('Failed to parse profile from localStorage', error);
      }
    }

    this.persistProfile(defaults);
    return defaults;
  }

  public saveProfile(updatedProfile?: UserGameProfile): void {
    if (updatedProfile) {
      this.profile = cloneProfile(updatedProfile);
    }
    this.persistProfile(this.profile);
  }

  private rollPercentage(): number {
    const randomValue = this.random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError('난수 공급자는 0 이상 1 미만의 유한수를 반환해야 합니다.');
    }
    return randomValue * 100;
  }

  /**
   * 강화 시도 (서버 난수 판정)
   */
  public attemptEnhance(): EnhanceAttemptResult {
    const nextProfile = this.getProfile();
    const currentLvl = nextProfile.currentLevel;
    if (nextProfile.currentCrackCount >= 3) {
      throw new Error('파괴된 검은 강화할 수 없습니다. 먼저 복구하거나 런을 정산하세요.');
    }
    if (currentLvl >= 20) {
      throw new Error('이미 최고 +20 레벨입니다.');
    }

    const stageInfo = SWORD_STAGES[currentLvl];
    const enhancePreview = calculateEnhancePreview(nextProfile);
    const catalystStatus = getCatalystGateStatus(nextProfile, currentLvl);
    const catalystDefinition = catalystStatus?.definition || null;

    if (catalystStatus && catalystStatus.activeCharges <= 0) {
      throw new Error(`+${currentLvl} 강화에는 ${catalystStatus.definition.name} 촉매 충전이 필요합니다.`);
    }

    if (nextProfile.gold < enhancePreview.cost) {
      throw new Error('골드가 부족합니다. 현재 검을 매각하거나 사냥하세요!');
    }

    if (catalystDefinition) {
      nextProfile.activeCatalystCharges[catalystDefinition.id] -= 1;
    }

    nextProfile.gold -= enhancePreview.cost;
    nextProfile.totalEnhanceAttempts += 1;

    const roll = this.rollPercentage();
    const isSuccess = roll < enhancePreview.successRate;

    let resultType: 'SUCCESS' | FailResultType = 'SUCCESS';
    let newLevel = currentLvl;
    let message = '';

    if (isSuccess) {
      newLevel = currentLvl + 1;
      nextProfile.currentLevel = newLevel;
      nextProfile.consecutiveFailCount = 0;
      if (catalystDefinition) {
        nextProfile.activeCatalystCharges[catalystDefinition.id] = 0;
      }
      if (newLevel > nextProfile.maxLevelReached) {
        nextProfile.maxLevelReached = newLevel;
      }
      
      const swordKey = `${nextProfile.currentSeriesId}_${newLevel}`;
      if (!nextProfile.unlockedSwords.includes(swordKey)) {
        nextProfile.unlockedSwords.push(swordKey);
      }

      message = `🎉 강화 성공! +${newLevel} [${SWORD_STAGES[newLevel].name}] (성공률 ${enhancePreview.successRate.toFixed(1)}%)`;
    } else {
      nextProfile.consecutiveFailCount += 1;

      const rollFail = this.rollPercentage();

      if (rollFail < enhancePreview.crackRate) {
        nextProfile.currentCrackCount += 1;
        if (nextProfile.currentCrackCount >= 3) {
          resultType = 'DESTROYED';
          nextProfile.totalDestroyedCount += 1;
          nextProfile.activeCatalystCharges = createEmptyCatalystCountMap();
          message = `💥 3번째 균열 발생으로 검이 파괴되었습니다!`;
        } else {
          resultType = 'CRACK';
          message = `⚠️ 강화 실패! 균열 발생 (${nextProfile.currentCrackCount}/3)`;
        }
      } else if (rollFail < enhancePreview.crackRate + stageInfo.dropFailRate) {
        newLevel = Math.max(0, currentLvl - 1);
        nextProfile.currentLevel = newLevel;
        resultType = 'DROP';
        message = `📉 강화 실패! 단계 하락 (+${newLevel})`;
      } else {
        resultType = 'KEEP';
        message = `강화 실패! 단계 유지 (+${newLevel})`;
      }
    }

    this.saveProfile(nextProfile);

    return {
      success: isSuccess,
      previousLevel: currentLvl,
      newLevel,
      resultType,
      crackCount: nextProfile.currentCrackCount,
      isRestored: false,
      costSpent: enhancePreview.cost,
      catalystId: catalystDefinition?.id || null,
      catalystChargeSpent: catalystDefinition !== null,
      catalystChargesRemaining: catalystDefinition
        ? nextProfile.activeCatalystCharges[catalystDefinition.id]
        : 0,
      message,
      timestamp: Date.now()
    };
  }

  /**
   * 💰 현재 검 매각 (검 매각으로 막대한 골드 창출)
   */
  public sellCurrentSword(): number {
    const nextProfile = this.getProfile();
    const currentLvl = nextProfile.currentLevel;
    const crackCount = nextProfile.currentCrackCount;
    
    // 매각가 산정
    const rawVal = calculateSwordSellValue(currentLvl, nextProfile.currentSeriesId, crackCount);
    
    // 영구 성장 [화로 온도] 추가 보너스 (+15% / Lv)
    const forgeTempLvl = nextProfile.upgrades.forge_temp || 0;
    const finalGoldGained = Math.round(rawVal * (1 + forgeTempLvl * 0.15));

    // 정수 보너스 (고강화 매각 시)
    const essenceBonus = Math.floor(Math.pow(currentLvl, 1.2));
    nextProfile.essences += essenceBonus;

    // 골드 가산
    nextProfile.gold += finalGoldGained;

    // 검 +0 초기화 (새 검 제작)
    nextProfile.currentLevel = 0;
    nextProfile.currentCrackCount = 0;
    nextProfile.consecutiveFailCount = 0;
    nextProfile.activeCatalystCharges = createEmptyCatalystCountMap();

    this.saveProfile(nextProfile);
    return finalGoldGained;
  }

  private resolveCatalystDrop(
    profile: UserGameProfile,
    definition: CatalystDefinition
  ): CatalystDropResult {
    const pityBefore = profile.catalystPity[definition.id];
    const alreadyDiscovered = profile.discoveredCatalysts.includes(definition.id);
    const isFirstDiscoveryGuarantee = definition.gateLevel === 10 && !alreadyDiscovered;
    const isNaturalDrop = !isFirstDiscoveryGuarantee && this.rollPercentage() < definition.dropRate;
    const isPityDrop = !isFirstDiscoveryGuarantee
      && !isNaturalDrop
      && pityBefore + 1 >= definition.pityThreshold;
    const dropped = isFirstDiscoveryGuarantee || isNaturalDrop || isPityDrop;

    return {
      catalystId: definition.id,
      gateLevel: definition.gateLevel,
      dropped,
      quantityGained: dropped ? 1 : 0,
      reason: isFirstDiscoveryGuarantee
        ? 'FIRST_DISCOVERY'
        : isNaturalDrop
          ? 'NATURAL'
          : isPityDrop
            ? 'PITY'
            : 'NONE',
      guaranteed: isFirstDiscoveryGuarantee || isPityDrop,
      pityBefore,
      pityAfter: dropped ? 0 : pityBefore + 1,
      inventoryAfter: profile.catalystInventory[definition.id] + (dropped ? 1 : 0),
      discoveredForFirstTime: dropped && !alreadyDiscovered
    };
  }

  /**
   * 보스 처치 처리: 런당 최초 보상과 매 처치 촉매 판정을 한 번에 저장한다.
   */
  public defeatBoss(milestone: number): BossDefeatResult {
    const boss = getBossDefinitionForMilestone(milestone);
    if (!boss) {
      throw new RangeError(`존재하지 않는 보스 마일스톤입니다: ${milestone}`);
    }

    const nextProfile = this.getProfile();
    if (nextProfile.currentLevel !== boss.milestone) {
      throw new Error(`현재 +${nextProfile.currentLevel} 단계에서는 +${boss.milestone} 보스를 처치할 수 없습니다.`);
    }
    if (nextProfile.currentCrackCount >= 3) {
      throw new Error('파괴된 검으로는 보스를 처치할 수 없습니다.');
    }

    const firstRewardGranted = !nextProfile.claimedBossMilestonesThisRun.includes(boss.milestone);
    const seriesInfo = SWORD_SERIES_LIST.find(series => series.id === nextProfile.currentSeriesId) || SWORD_SERIES_LIST[0];
    const goldGained = firstRewardGranted
      ? Math.round(boss.rewardGold * seriesInfo.goldBonusMultiplier)
      : 0;
    const essencesGained = firstRewardGranted ? boss.rewardEssences : 0;
    const catalystDrop = boss.catalyst
      ? this.resolveCatalystDrop(nextProfile, boss.catalyst)
      : null;

    if (firstRewardGranted) {
      nextProfile.gold += goldGained;
      nextProfile.essences += essencesGained;
      nextProfile.claimedBossMilestonesThisRun.push(boss.milestone);
    }

    if (catalystDrop) {
      nextProfile.catalystPity[catalystDrop.catalystId] = catalystDrop.pityAfter;
      nextProfile.catalystInventory[catalystDrop.catalystId] = catalystDrop.inventoryAfter;
      if (catalystDrop.discoveredForFirstTime) {
        nextProfile.discoveredCatalysts.push(catalystDrop.catalystId);
      }
    }

    this.saveProfile(nextProfile);

    return {
      milestone: boss.milestone,
      claimed: firstRewardGranted,
      firstRewardGranted,
      goldGained,
      essencesGained,
      catalystDrop
    };
  }

  /**
   * 이전 호출부 호환용 별칭. 반복 호출도 defeatBoss와 동일하게 촉매를 판정한다.
   */
  public claimBossReward(milestone: number): BossDefeatResult {
    return this.defeatBoss(milestone);
  }

  public activateCatalyst(currentLevel: number): CatalystActivationResult {
    const nextProfile = this.getProfile();
    const catalystStatus = getCatalystGateStatus(nextProfile, currentLevel);
    if (!catalystStatus) {
      throw new RangeError('촉매는 +10부터 +19 단계에서만 활성화할 수 있습니다.');
    }
    const { definition } = catalystStatus;

    if (nextProfile.currentLevel !== currentLevel) {
      throw new Error(`현재 단계(+${nextProfile.currentLevel})와 촉매 단계(+${currentLevel})가 일치하지 않습니다.`);
    }
    if (nextProfile.currentCrackCount >= 3) {
      throw new Error('파괴된 검에는 촉매를 활성화할 수 없습니다.');
    }
    if (catalystStatus.activeCharges > 0) {
      throw new Error(`${definition.name} 촉매 충전이 이미 남아 있습니다.`);
    }
    if (catalystStatus.inventoryCount <= 0) {
      throw new Error(`${definition.name} 재료가 부족합니다.`);
    }

    nextProfile.catalystInventory[definition.id] -= 1;
    nextProfile.activeCatalystCharges[definition.id] = definition.chargesPerItem;
    this.saveProfile(nextProfile);

    return {
      catalystId: definition.id,
      gateLevel: definition.gateLevel,
      inventoryRemaining: nextProfile.catalystInventory[definition.id],
      activeCharges: nextProfile.activeCatalystCharges[definition.id]
    };
  }

  /**
   * 균열 수리
   */
  public repairCrack(): boolean {
    if (this.profile.currentCrackCount <= 0) return false;

    const currentLvl = this.profile.currentLevel;
    const stageInfo = SWORD_STAGES[currentLvl];
    const repairTechLvl = this.profile.upgrades.repair_tech || 0;
    const discount = Math.min(0.8, repairTechLvl * 0.08);

    let repairCost = Math.round(stageInfo.enhanceCost * 4 * (1 - discount));

    if (this.profile.totalEnhanceAttempts <= 10 && this.profile.totalDestroyedCount === 0) {
      repairCost = 0;
    }

    if (this.profile.gold < repairCost) {
      throw new Error('수리 비용 골드가 부족합니다.');
    }

    this.profile.gold -= repairCost;
    this.profile.currentCrackCount = Math.max(0, this.profile.currentCrackCount - 1);
    this.saveProfile();
    return true;
  }

  /**
   * 파괴 정산 및 런 리셋
   */
  public finishRunAndClaimEssences(): number {
    const nextProfile = this.getProfile();
    const maxLvl = nextProfile.currentLevel;
    const baseEssence = Math.floor(Math.pow(maxLvl, 1.5));
    const bonus = maxLvl >= 10 ? 10 : 0;
    const totalGained = baseEssence + bonus;

    nextProfile.essences += totalGained;

    const masterCapLvl = nextProfile.upgrades.master_capital || 0;
    const startingGold = 500 + masterCapLvl * 1000;

    nextProfile.gold = startingGold;
    nextProfile.currentLevel = 0;
    nextProfile.currentCrackCount = 0;
    nextProfile.consecutiveFailCount = 0;
    nextProfile.adRestoredCountThisRun = 0;
    nextProfile.isPureRun = true;
    nextProfile.runStartTime = Date.now();
    nextProfile.claimedBossMilestonesThisRun = [];
    nextProfile.activeCatalystCharges = createEmptyCatalystCountMap();

    this.saveProfile(nextProfile);
    return totalGained;
  }

  /**
   * 보상형 광고 모의 - 검 복구
   */
  public adRestoreSword(): boolean {
    if (this.profile.adRestoredCountThisRun >= 1) {
      throw new Error('이 런에서는 이미 파괴 복구를 1회 사용했습니다.');
    }

    const restoredLvl = Math.max(0, this.profile.currentLevel - 2);
    this.profile.currentLevel = restoredLvl;
    this.profile.currentCrackCount = 1;
    this.profile.adRestoredCountThisRun += 1;
    this.profile.isPureRun = false;

    this.saveProfile();
    return true;
  }

  /**
   * 영구 성장 구매
   */
  public buyUpgrade(upgradeId: string): boolean {
    const upgradeObj = PERMANENT_UPGRADES.find(u => u.id === upgradeId);
    if (!upgradeObj) return false;

    const currentLvl = this.profile.upgrades[upgradeId] || 0;
    if (currentLvl >= upgradeObj.maxLevel) {
      throw new Error('이미 최고 레벨에 도달했습니다.');
    }

    const cost = Math.round(upgradeObj.baseCost * Math.pow(upgradeObj.costMultiplier, currentLvl));
    if (this.profile.essences < cost) {
      throw new Error('대장장이 정수가 부족합니다.');
    }

    this.profile.essences -= cost;
    this.profile.upgrades[upgradeId] = currentLvl + 1;
    this.saveProfile();
    return true;
  }

  public addGoldFromHunting(amount: number): number {
    if (this.profile.currentCrackCount >= 3) return 0;

    const seriesInfo = SWORD_SERIES_LIST.find(s => s.id === this.profile.currentSeriesId) || SWORD_SERIES_LIST[0];
    const finalGold = Math.round(amount * seriesInfo.goldBonusMultiplier);
    this.profile.gold += finalGold;
    this.saveProfile();
    return finalGold;
  }
}

export const serverSimulator = new ServerSimulator();
