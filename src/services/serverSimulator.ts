import type {
  ActiveBossEncounter,
  BossDefeatResult,
  BossEncounterState,
  CatalystActivationResult,
  CatalystCountMap,
  CatalystDefinition,
  CatalystId,
  CurrentWeaponState,
  EnhanceAttemptResult,
  FailResultType,
  HuntResolution,
  ProgressChargeMap,
  ProgressChargeRewardResult,
  SwordSeriesId,
  TranscendenceProgress,
  TranscendenceRelicId,
  TranscendenceRewardResult,
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
  getBossBagSizeForLevel,
  getBossDefinitionForMilestone,
  getRequiredProgressChargeId
} from '../constants/gameBalance';

const LOCAL_STORAGE_KEY = 'project_forge_user_profile_v1';
const LOCAL_STORAGE_BACKUP_KEY = 'project_forge_user_profile_v1_backup_before_schema_v2';
const SCHEMA_VERSION = 2 as const;
const PROGRESS_CHARGE_CAPS: ProgressChargeMap = { tempered: 4, awakened: 3 };
const TRANSCENDENCE_THRESHOLDS: Record<TranscendenceRelicId, number> = {
  godblood: 40,
  end: 100
};
const DEFAULT_UPGRADES: UserGameProfile['upgrades'] = {
  forge_temp: 0,
  master_capital: 0,
  precision_hammer: 0,
  crack_control: 0,
  repair_tech: 0,
  ancient_blueprint: 0
};

let fallbackIdSequence = 0;

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

function createEmptyProgressChargeMap(): ProgressChargeMap {
  return { tempered: 0, awakened: 0 };
}

function createEmptyTranscendenceProgress(): TranscendenceProgress {
  return {
    godblood: { relics: 0, shards: 0 },
    end: { relics: 0, shards: 0 }
  };
}

function createUniqueId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  fallbackIdSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackIdSequence.toString(36)}`;
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

function readProgressCharges(value: unknown): ProgressChargeMap {
  if (!isRecord(value)) return createEmptyProgressChargeMap();
  return {
    tempered: readNonNegativeInteger(value.tempered, 0, PROGRESS_CHARGE_CAPS.tempered),
    awakened: readNonNegativeInteger(value.awakened, 0, PROGRESS_CHARGE_CAPS.awakened)
  };
}

function readRareBossStages(value: unknown): Array<18 | 19> {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((stage): stage is 18 | 19 => stage === 18 || stage === 19))];
}

function readTranscendenceProgress(value: unknown): TranscendenceProgress {
  const progress = createEmptyTranscendenceProgress();
  if (!isRecord(value)) return progress;

  (Object.keys(progress) as TranscendenceRelicId[]).forEach(relicId => {
    const savedRelic = value[relicId];
    if (!isRecord(savedRelic)) return;
    const threshold = TRANSCENDENCE_THRESHOLDS[relicId];
    const rawShards = readNonNegativeInteger(savedRelic.shards, 0);
    progress[relicId] = {
      relics: readNonNegativeInteger(savedRelic.relics, 0) + Math.floor(rawShards / threshold),
      shards: rawShards % threshold
    };
  });
  return progress;
}

function cloneEncounter(encounter: BossEncounterState | null): BossEncounterState | null {
  if (!encounter) return null;
  return {
    ...encounter,
    active: encounter.active ? { ...encounter.active } : null
  };
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
    activeCatalystCharges: { ...profile.activeCatalystCharges },
    currentWeapon: {
      ...profile.currentWeapon,
      progressCharges: { ...profile.currentWeapon.progressCharges },
      bossEncounter: cloneEncounter(profile.currentWeapon.bossEncounter),
      claimedRareBossStages: [...profile.currentWeapon.claimedRareBossStages]
    },
    transcendence: {
      godblood: { ...profile.transcendence.godblood },
      end: { ...profile.transcendence.end }
    }
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

  public createFreshWeaponState(ordinal = 1): CurrentWeaponState {
    return {
      weaponId: createUniqueId('weapon'),
      ordinal: Math.max(1, Math.floor(ordinal)),
      progressCharges: createEmptyProgressChargeMap(),
      bossEncounter: null,
      claimedRareBossStages: [],
      endShardFirstAttemptGranted: false
    };
  }

  private createDefaultProfile(): UserGameProfile {
    return {
      schemaVersion: SCHEMA_VERSION,
      userId: createUniqueId('usr'),
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
      currentWeapon: this.createFreshWeaponState(1),
      transcendence: createEmptyTranscendenceProgress(),
      upgrades: { ...DEFAULT_UPGRADES },
      unlockedSwords: ['kingdom_0'],
      unlockedAchievements: []
    };
  }

  private readEncounter(value: unknown, weaponId: string): BossEncounterState | null {
    if (!isRecord(value) || value.weaponId !== weaponId) return null;

    const bagSize = readNonNegativeInteger(value.bagSize, 0);
    if (![6, 8, 12, 20, 30].includes(bagSize)) return null;
    const bossSlot = readNonNegativeInteger(value.bossSlot, 0, bagSize);
    if (bossSlot < 1) return null;
    const cursor = readNonNegativeInteger(value.cursor, 0, bagSize);
    const cycle = Math.max(1, readNonNegativeInteger(value.cycle, 1));
    let active: ActiveBossEncounter | null = null;

    if (isRecord(value.active)) {
      const levelSnapshot = readNonNegativeInteger(value.active.levelSnapshot, 0, 20);
      const boss = getBossDefinitionForMilestone(levelSnapshot);
      const encounterId = readString(value.active.encounterId, '');
      if (
        encounterId
        && value.active.weaponId === weaponId
        && boss
        && levelSnapshot >= 5
        && levelSnapshot <= 19
      ) {
        active = {
          encounterId,
          weaponId,
          levelSnapshot,
          bossId: boss.id,
          revealedAt: readFiniteNumber(value.active.revealedAt, Date.now())
        };
      }
    }

    return {
      weaponId,
      bagSize,
      cursor: active ? bossSlot : Math.min(cursor, bossSlot),
      bossSlot,
      cycle,
      active
    };
  }

  private migrateProfile(savedProfile: Record<string, unknown>, defaults: UserGameProfile): UserGameProfile {
    const savedSeriesId = savedProfile.currentSeriesId;
    const currentSeriesId = typeof savedSeriesId === 'string'
      && SWORD_SERIES_LIST.some(series => series.id === savedSeriesId)
      ? savedSeriesId as SwordSeriesId
      : defaults.currentSeriesId;
    const currentLevel = readNonNegativeInteger(
      savedProfile.currentLevel,
      defaults.currentLevel,
      SWORD_STAGES.length - 1
    );
    const savedWeapon = isRecord(savedProfile.currentWeapon) ? savedProfile.currentWeapon : null;
    const weaponId = savedWeapon ? readString(savedWeapon.weaponId, createUniqueId('weapon')) : createUniqueId('weapon');
    const ordinal = savedWeapon ? Math.max(1, readNonNegativeInteger(savedWeapon.ordinal, 1)) : 1;
    const currentWeapon: CurrentWeaponState = {
      weaponId,
      ordinal,
      progressCharges: readProgressCharges(savedWeapon?.progressCharges),
      bossEncounter: this.readEncounter(savedWeapon?.bossEncounter, weaponId),
      claimedRareBossStages: readRareBossStages(savedWeapon?.claimedRareBossStages),
      endShardFirstAttemptGranted: readBoolean(savedWeapon?.endShardFirstAttemptGranted, false)
    };

    if (!currentWeapon.bossEncounter && getBossBagSizeForLevel(currentLevel) !== null) {
      currentWeapon.bossEncounter = this.createBossEncounterState(weaponId, currentLevel, 1);
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      userId: readString(savedProfile.userId, defaults.userId),
      nickname: readString(savedProfile.nickname, defaults.nickname),
      gold: readFiniteNumber(savedProfile.gold, defaults.gold),
      essences: readFiniteNumber(savedProfile.essences, defaults.essences),
      currentSeriesId,
      currentLevel,
      currentCrackCount: readNonNegativeInteger(savedProfile.currentCrackCount, defaults.currentCrackCount, 3),
      consecutiveFailCount: readNonNegativeInteger(savedProfile.consecutiveFailCount, defaults.consecutiveFailCount),
      maxLevelReached: readNonNegativeInteger(savedProfile.maxLevelReached, defaults.maxLevelReached, SWORD_STAGES.length - 1),
      totalEnhanceAttempts: readNonNegativeInteger(savedProfile.totalEnhanceAttempts, defaults.totalEnhanceAttempts),
      totalDestroyedCount: readNonNegativeInteger(savedProfile.totalDestroyedCount, defaults.totalDestroyedCount),
      adRestoredCountThisRun: readNonNegativeInteger(savedProfile.adRestoredCountThisRun, defaults.adRestoredCountThisRun),
      isPureRun: readBoolean(savedProfile.isPureRun, defaults.isPureRun),
      runStartTime: readFiniteNumber(savedProfile.runStartTime, defaults.runStartTime),
      claimedBossMilestonesThisRun: readClaimedBossMilestones(savedProfile.claimedBossMilestonesThisRun),
      catalystInventory: readCatalystCounts(savedProfile.catalystInventory ?? savedProfile.inventory),
      catalystPity: readCatalystCounts(savedProfile.catalystPity ?? savedProfile.pity),
      discoveredCatalysts: readDiscoveredCatalysts(savedProfile.discoveredCatalysts ?? savedProfile.discovered),
      activeCatalystCharges: readCatalystCounts(savedProfile.activeCatalystCharges ?? savedProfile.activeCharges),
      currentWeapon,
      transcendence: readTranscendenceProgress(savedProfile.transcendence),
      upgrades: mergeUpgradeLevels(savedProfile.upgrades),
      unlockedSwords: mergeStringArray(defaults.unlockedSwords, savedProfile.unlockedSwords),
      unlockedAchievements: mergeStringArray(defaults.unlockedAchievements, savedProfile.unlockedAchievements)
    };
  }

  private persistProfile(profile: UserGameProfile): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
  }

  private backupRawProfile(rawProfile: string): void {
    localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, rawProfile);
  }

  private commitProfile(profile: UserGameProfile): void {
    const committedProfile = cloneProfile(profile);
    this.persistProfile(committedProfile);
    this.profile = committedProfile;
  }

  private loadOrCreateProfile(): UserGameProfile {
    const defaults = this.createDefaultProfile();
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (saved !== null) {
      let parsedProfile: unknown;
      try {
        parsedProfile = JSON.parse(saved);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        this.backupRawProfile(saved);
        this.persistProfile(defaults);
        return defaults;
      }

      if (!isRecord(parsedProfile)) {
        this.backupRawProfile(saved);
        this.persistProfile(defaults);
        return defaults;
      }

      if (parsedProfile.schemaVersion !== SCHEMA_VERSION) {
        this.backupRawProfile(saved);
      }

      const migratedProfile = this.migrateProfile(parsedProfile, defaults);
      this.persistProfile(migratedProfile);
      return migratedProfile;
    }

    this.persistProfile(defaults);
    return defaults;
  }

  public saveProfile(updatedProfile?: UserGameProfile): void {
    this.commitProfile(updatedProfile ? cloneProfile(updatedProfile) : this.getProfile());
  }

  private rollUnit(): number {
    const randomValue = this.random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError('난수 공급자는 0 이상 1 미만의 유한수를 반환해야 합니다.');
    }
    return randomValue;
  }

  private rollPercentage(): number {
    return this.rollUnit() * 100;
  }

  private createBossEncounterState(
    weaponId: string,
    level: number,
    cycle: number
  ): BossEncounterState | null {
    const bagSize = getBossBagSizeForLevel(level);
    if (bagSize === null) return null;

    return {
      weaponId,
      bagSize,
      cursor: 0,
      bossSlot: Math.floor(this.rollUnit() * bagSize) + 1,
      cycle,
      active: null
    };
  }

  private isBossProgressPaused(profile: UserGameProfile): boolean {
    if (profile.currentLevel >= 5 && profile.currentLevel <= 9) {
      return profile.currentWeapon.progressCharges.tempered > 0;
    }
    const requiredCharge = getRequiredProgressChargeId(profile.currentLevel);
    return requiredCharge !== null && profile.currentWeapon.progressCharges[requiredCharge] > 0;
  }

  private grantTranscendence(
    profile: UserGameProfile,
    relicId: TranscendenceRelicId,
    source: TranscendenceRewardResult['source'],
    fullRelicDropped: boolean,
    shardsGained: number
  ): TranscendenceRewardResult {
    const progress = profile.transcendence[relicId];
    const directRelics = fullRelicDropped ? 1 : 0;
    progress.relics += directRelics;
    progress.shards += shardsGained;

    const threshold = TRANSCENDENCE_THRESHOLDS[relicId];
    const synthesizedRelics = Math.floor(progress.shards / threshold);
    if (synthesizedRelics > 0) {
      progress.shards %= threshold;
      progress.relics += synthesizedRelics;
    }

    return {
      source,
      relicId,
      fullRelicDropped,
      relicsGained: directRelics + synthesizedRelics,
      shardsGained,
      synthesizedRelics,
      relicsAfter: progress.relics,
      shardsAfter: progress.shards
    };
  }

  private grantProgressCharges(profile: UserGameProfile, level: number): ProgressChargeRewardResult {
    const before = { ...profile.currentWeapon.progressCharges };
    const targets = createEmptyProgressChargeMap();

    if (level >= 5 && level <= 9) {
      targets.tempered = 4;
    } else if (level >= 10 && level <= 13) {
      targets.tempered = 3;
      targets.awakened = 2;
    } else if (level >= 14 && level <= 17) {
      targets.awakened = 2;
    } else if (level >= 18 && level <= 19) {
      targets.awakened = 1;
    }

    profile.currentWeapon.progressCharges.tempered = Math.min(
      PROGRESS_CHARGE_CAPS.tempered,
      Math.max(before.tempered, targets.tempered)
    );
    profile.currentWeapon.progressCharges.awakened = Math.min(
      PROGRESS_CHARGE_CAPS.awakened,
      Math.max(before.awakened, targets.awakened)
    );
    const after = { ...profile.currentWeapon.progressCharges };

    return {
      before,
      gained: {
        tempered: after.tempered - before.tempered,
        awakened: after.awakened - before.awakened
      },
      after
    };
  }

  private resolveBossTranscendence(
    profile: UserGameProfile,
    levelSnapshot: number
  ): TranscendenceRewardResult | null {
    if (levelSnapshot !== 18 && levelSnapshot !== 19) return null;
    if (profile.currentWeapon.claimedRareBossStages.includes(levelSnapshot)) return null;

    profile.currentWeapon.claimedRareBossStages.push(levelSnapshot);
    const relicId: TranscendenceRelicId = levelSnapshot === 18 ? 'godblood' : 'end';
    const fullRelicDropped = this.rollPercentage() < (levelSnapshot === 18 ? 3 : 1);
    return this.grantTranscendence(
      profile,
      relicId,
      levelSnapshot === 18 ? 'BOSS_18' : 'BOSS_19',
      fullRelicDropped,
      fullRelicDropped ? 0 : 1
    );
  }

  /** 일반 적 처치의 골드와 저장된 셔플백 진행을 한 번에 반영한다. */
  public defeatNormalEnemy(baseGold: number): HuntResolution {
    if (!Number.isFinite(baseGold) || baseGold < 0) {
      throw new RangeError('사냥 기본 골드는 0 이상의 유한수여야 합니다.');
    }
    if (this.profile.currentCrackCount >= 3) {
      return {
        goldGained: 0,
        bagProgressed: false,
        paused: true,
        bossRevealed: false,
        activeEncounter: this.profile.currentWeapon.bossEncounter?.active
          ? { ...this.profile.currentWeapon.bossEncounter.active }
          : null,
        encounter: cloneEncounter(this.profile.currentWeapon.bossEncounter)
      };
    }
    if (this.profile.currentWeapon.bossEncounter?.active) {
      throw new Error('활성 보스를 해결하기 전에는 일반 적 처치를 기록할 수 없습니다.');
    }

    const nextProfile = this.getProfile();
    const seriesInfo = SWORD_SERIES_LIST.find(series => series.id === nextProfile.currentSeriesId) || SWORD_SERIES_LIST[0];
    const goldGained = Math.round(baseGold * seriesInfo.goldBonusMultiplier);
    nextProfile.gold += goldGained;

    let encounter = nextProfile.currentWeapon.bossEncounter;
    if (!encounter && getBossBagSizeForLevel(nextProfile.currentLevel) !== null) {
      encounter = this.createBossEncounterState(
        nextProfile.currentWeapon.weaponId,
        nextProfile.currentLevel,
        1
      );
      nextProfile.currentWeapon.bossEncounter = encounter;
    }

    const paused = this.isBossProgressPaused(nextProfile);
    let bagProgressed = false;
    let bossRevealed = false;
    if (encounter && !paused && getBossBagSizeForLevel(nextProfile.currentLevel) !== null) {
      encounter.cursor = Math.min(encounter.bagSize, encounter.cursor + 1);
      bagProgressed = true;

      if (encounter.cursor === encounter.bossSlot) {
        const boss = getBossDefinitionForMilestone(nextProfile.currentLevel);
        if (!boss || nextProfile.currentLevel > 19) {
          throw new Error(`+${nextProfile.currentLevel} 단계의 자동 조우 보스가 없습니다.`);
        }
        encounter.active = {
          encounterId: `${encounter.weaponId}:encounter:${encounter.cycle}`,
          weaponId: encounter.weaponId,
          levelSnapshot: nextProfile.currentLevel,
          bossId: boss.id,
          revealedAt: Date.now()
        };
        bossRevealed = true;
      }
    }

    this.commitProfile(nextProfile);
    const committedEncounter = this.profile.currentWeapon.bossEncounter;
    return {
      goldGained,
      bagProgressed,
      paused,
      bossRevealed,
      activeEncounter: committedEncounter?.active ? { ...committedEncounter.active } : null,
      encounter: cloneEncounter(committedEncounter)
    };
  }

  /**
   * 활성 encounterId만 보상할 수 있다. number 인자는 UI 전환 기간의 안전한 호환 경로다.
   */
  public defeatBoss(encounterId: string | number): BossDefeatResult {
    const activeEncounter = this.profile.currentWeapon.bossEncounter?.active;
    if (!activeEncounter) {
      throw new Error('처치할 활성 보스 조우가 없습니다.');
    }
    if (activeEncounter.weaponId !== this.profile.currentWeapon.weaponId) {
      throw new Error('현재 검에 귀속되지 않은 보스 조우입니다.');
    }
    if (typeof encounterId === 'number') {
      if (encounterId !== activeEncounter.levelSnapshot) {
        throw new Error('활성 보스의 공개 단계와 요청 단계가 일치하지 않습니다.');
      }
    } else if (encounterId !== activeEncounter.encounterId) {
      throw new Error('만료되었거나 이미 해결된 보스 조우입니다.');
    }
    if (this.profile.currentCrackCount >= 3) {
      throw new Error('파괴된 검으로는 보스를 처치할 수 없습니다.');
    }

    const boss = getBossDefinitionForMilestone(activeEncounter.levelSnapshot);
    if (!boss || activeEncounter.levelSnapshot > 19 || boss.id !== activeEncounter.bossId) {
      throw new Error('저장된 보스 조우 정의가 유효하지 않습니다.');
    }

    const nextProfile = this.getProfile();
    const firstRewardGranted = !nextProfile.claimedBossMilestonesThisRun.includes(activeEncounter.levelSnapshot);
    const seriesInfo = SWORD_SERIES_LIST.find(series => series.id === nextProfile.currentSeriesId) || SWORD_SERIES_LIST[0];
    const goldGained = firstRewardGranted ? Math.round(boss.rewardGold * seriesInfo.goldBonusMultiplier) : 0;
    const essencesGained = firstRewardGranted ? boss.rewardEssences : 0;

    if (firstRewardGranted) {
      nextProfile.gold += goldGained;
      nextProfile.essences += essencesGained;
      nextProfile.claimedBossMilestonesThisRun.push(activeEncounter.levelSnapshot);
    }

    const progressReward = this.grantProgressCharges(nextProfile, activeEncounter.levelSnapshot);
    const transcendenceReward = this.resolveBossTranscendence(nextProfile, activeEncounter.levelSnapshot);
    const previousCycle = nextProfile.currentWeapon.bossEncounter?.cycle || 1;
    const nextEncounterLevel = getBossBagSizeForLevel(nextProfile.currentLevel) !== null
      ? nextProfile.currentLevel
      : activeEncounter.levelSnapshot;
    nextProfile.currentWeapon.bossEncounter = this.createBossEncounterState(
      nextProfile.currentWeapon.weaponId,
      nextEncounterLevel,
      previousCycle + 1
    );

    this.commitProfile(nextProfile);
    return {
      encounterId: activeEncounter.encounterId,
      levelSnapshot: activeEncounter.levelSnapshot,
      milestone: activeEncounter.levelSnapshot,
      claimed: firstRewardGranted,
      firstRewardGranted,
      goldGained,
      essencesGained,
      catalystDrop: null,
      progressReward,
      transcendenceReward,
      nextEncounter: cloneEncounter(this.profile.currentWeapon.bossEncounter)
    };
  }

  /** @deprecated 활성 조우의 단계가 정확히 일치할 때만 처리한다. */
  public claimBossReward(milestone: number): BossDefeatResult {
    return this.defeatBoss(milestone);
  }

  /** @deprecated 기존 촉매는 스키마 v2에서 읽기 전용 아카이브다. */
  public activateCatalyst(_currentLevel: number): CatalystActivationResult {
    throw new Error('기존 촉매는 레거시 아카이브이며 신규 진행 충전으로 활성화할 수 없습니다.');
  }

  /** 최종 4분포에 단일 난수를 적용하는 강화 시도. */
  public attemptEnhance(): EnhanceAttemptResult {
    if (this.profile.currentCrackCount >= 3) {
      throw new Error('파괴된 검은 강화할 수 없습니다. 먼저 복구하거나 런을 정산하세요.');
    }
    const currentLevel = this.profile.currentLevel;
    if (currentLevel >= 20) {
      throw new Error('이미 최고 +20 레벨입니다.');
    }

    const preview = calculateEnhancePreview(this.profile);
    const requiredCharge = getRequiredProgressChargeId(currentLevel);
    if (requiredCharge && this.profile.currentWeapon.progressCharges[requiredCharge] <= 0) {
      const chargeName = requiredCharge === 'tempered' ? '제련의 불씨' : '심연의 인장';
      throw new Error(`+${currentLevel} 강화에는 ${chargeName} 충전이 필요합니다.`);
    }
    if (this.profile.gold < preview.cost) {
      throw new Error('골드가 부족합니다. 현재 검을 매각하거나 사냥하세요!');
    }

    const nextProfile = this.getProfile();
    if (requiredCharge) {
      nextProfile.currentWeapon.progressCharges[requiredCharge] -= 1;
    }
    nextProfile.gold -= preview.cost;
    nextProfile.totalEnhanceAttempts += 1;

    const transcendenceRewards: TranscendenceRewardResult[] = [];
    if (currentLevel === 19 && !nextProfile.currentWeapon.endShardFirstAttemptGranted) {
      nextProfile.currentWeapon.endShardFirstAttemptGranted = true;
      transcendenceRewards.push(this.grantTranscendence(
        nextProfile,
        'end',
        'ENHANCE_20_FIRST_ATTEMPT',
        false,
        1
      ));
    }

    const roll = this.rollPercentage();
    const successBoundary = preview.successRate;
    const keepBoundary = successBoundary + preview.keepRate;
    const crackBoundary = keepBoundary + preview.crackRate;
    let resultType: 'SUCCESS' | FailResultType;
    let newLevel = currentLevel;
    let message: string;

    if (roll < successBoundary) {
      resultType = 'SUCCESS';
      newLevel = currentLevel + 1;
      nextProfile.currentLevel = newLevel;
      nextProfile.consecutiveFailCount = 0;
      if (newLevel > nextProfile.maxLevelReached) {
        nextProfile.maxLevelReached = newLevel;
      }
      const swordKey = `${nextProfile.currentSeriesId}_${newLevel}`;
      if (!nextProfile.unlockedSwords.includes(swordKey)) {
        nextProfile.unlockedSwords.push(swordKey);
      }
      if (newLevel === 5 && !nextProfile.currentWeapon.bossEncounter) {
        nextProfile.currentWeapon.bossEncounter = this.createBossEncounterState(
          nextProfile.currentWeapon.weaponId,
          newLevel,
          1
        );
      }
      if (currentLevel === 19) {
        transcendenceRewards.push(this.grantTranscendence(
          nextProfile,
          'end',
          'ENHANCE_20_SUCCESS',
          false,
          2
        ));
      }
      message = `🎉 강화 성공! +${newLevel} [${SWORD_STAGES[newLevel].name}] (성공률 ${preview.successRate.toFixed(1)}%)`;
    } else {
      nextProfile.consecutiveFailCount += 1;
      if (roll < keepBoundary) {
        resultType = 'KEEP';
        message = `강화 실패! 단계 유지 (+${newLevel})`;
      } else if (roll < crackBoundary) {
        nextProfile.currentCrackCount += 1;
        if (nextProfile.currentCrackCount >= 3) {
          resultType = 'DESTROYED';
          nextProfile.totalDestroyedCount += 1;
          message = '💥 3번째 균열 발생으로 검이 파괴되었습니다!';
        } else {
          resultType = 'CRACK';
          message = `⚠️ 강화 실패! 균열 발생 (${nextProfile.currentCrackCount}/3)`;
        }
      } else {
        resultType = 'DROP';
        newLevel = Math.max(0, currentLevel - 1);
        nextProfile.currentLevel = newLevel;
        message = `📉 강화 실패! 단계 하락 (+${newLevel})`;
      }
    }

    this.commitProfile(nextProfile);
    const progressChargesRemaining = requiredCharge
      ? this.profile.currentWeapon.progressCharges[requiredCharge]
      : 0;
    return {
      success: resultType === 'SUCCESS',
      previousLevel: currentLevel,
      newLevel,
      resultType,
      crackCount: this.profile.currentCrackCount,
      isRestored: false,
      costSpent: preview.cost,
      catalystId: null,
      catalystChargeSpent: false,
      catalystChargesRemaining: 0,
      progressChargeId: requiredCharge,
      progressChargeSpent: requiredCharge !== null,
      progressChargesRemaining,
      transcendenceRewards,
      message,
      timestamp: Date.now()
    };
  }

  /** 현재 검 매각. 계정 영구/레거시 자원은 보존하고 무기 귀속 상태만 새로 만든다. */
  public sellCurrentSword(): number {
    const nextProfile = this.getProfile();
    const currentLevel = nextProfile.currentLevel;
    const rawValue = calculateSwordSellValue(currentLevel, nextProfile.currentSeriesId, nextProfile.currentCrackCount);
    const forgeTemperatureLevel = nextProfile.upgrades.forge_temp || 0;
    const goldGained = Math.round(rawValue * (1 + forgeTemperatureLevel * 0.15));

    nextProfile.essences += Math.floor(Math.pow(currentLevel, 1.2));
    nextProfile.gold += goldGained;
    nextProfile.currentLevel = 0;
    nextProfile.currentCrackCount = 0;
    nextProfile.consecutiveFailCount = 0;
    nextProfile.currentWeapon = this.createFreshWeaponState(nextProfile.currentWeapon.ordinal + 1);

    this.commitProfile(nextProfile);
    return goldGained;
  }

  public repairCrack(): boolean {
    if (this.profile.currentCrackCount <= 0) return false;

    const nextProfile = this.getProfile();
    const stageInfo = SWORD_STAGES[nextProfile.currentLevel];
    const repairTechLevel = nextProfile.upgrades.repair_tech || 0;
    const discount = Math.min(0.8, repairTechLevel * 0.08);
    let repairCost = Math.round(stageInfo.enhanceCost * 4 * (1 - discount));
    if (nextProfile.totalEnhanceAttempts <= 10 && nextProfile.totalDestroyedCount === 0) {
      repairCost = 0;
    }
    if (nextProfile.gold < repairCost) {
      throw new Error('수리 비용 골드가 부족합니다.');
    }

    nextProfile.gold -= repairCost;
    nextProfile.currentCrackCount = Math.max(0, nextProfile.currentCrackCount - 1);
    this.commitProfile(nextProfile);
    return true;
  }

  /** 파괴 정산 및 런 리셋. */
  public finishRunAndClaimEssences(): number {
    const nextProfile = this.getProfile();
    const maxLevel = nextProfile.currentLevel;
    const totalGained = Math.floor(Math.pow(maxLevel, 1.5)) + (maxLevel >= 10 ? 10 : 0);
    nextProfile.essences += totalGained;

    const masterCapitalLevel = nextProfile.upgrades.master_capital || 0;
    nextProfile.gold = 500 + masterCapitalLevel * 1000;
    nextProfile.currentLevel = 0;
    nextProfile.currentCrackCount = 0;
    nextProfile.consecutiveFailCount = 0;
    nextProfile.adRestoredCountThisRun = 0;
    nextProfile.isPureRun = true;
    nextProfile.runStartTime = Date.now();
    nextProfile.claimedBossMilestonesThisRun = [];
    nextProfile.currentWeapon = this.createFreshWeaponState(nextProfile.currentWeapon.ordinal + 1);

    this.commitProfile(nextProfile);
    return totalGained;
  }

  /** 보상형 광고 모의 복구. 동일 무기 귀속 상태를 그대로 보존한다. */
  public adRestoreSword(): boolean {
    if (this.profile.currentCrackCount < 3) {
      throw new Error('파괴된 검만 광고 복구할 수 있습니다.');
    }
    if (this.profile.adRestoredCountThisRun >= 1) {
      throw new Error('이 런에서는 이미 파괴 복구를 1회 사용했습니다.');
    }

    const nextProfile = this.getProfile();
    nextProfile.currentLevel = Math.max(0, nextProfile.currentLevel - 2);
    nextProfile.currentCrackCount = 1;
    nextProfile.adRestoredCountThisRun += 1;
    nextProfile.isPureRun = false;
    this.commitProfile(nextProfile);
    return true;
  }

  public buyUpgrade(upgradeId: string): boolean {
    const upgrade = PERMANENT_UPGRADES.find(item => item.id === upgradeId);
    if (!upgrade) return false;

    const nextProfile = this.getProfile();
    const currentLevel = nextProfile.upgrades[upgradeId] || 0;
    if (currentLevel >= upgrade.maxLevel) {
      throw new Error('이미 최고 레벨에 도달했습니다.');
    }
    const cost = Math.round(upgrade.baseCost * Math.pow(upgrade.costMultiplier, currentLevel));
    if (nextProfile.essences < cost) {
      throw new Error('대장장이 정수가 부족합니다.');
    }

    nextProfile.essences -= cost;
    nextProfile.upgrades[upgradeId] = currentLevel + 1;
    this.commitProfile(nextProfile);
    return true;
  }

  /** @deprecated 신규 호출부는 defeatNormalEnemy를 사용한다. */
  public addGoldFromHunting(amount: number): number {
    return this.defeatNormalEnemy(amount).goldGained;
  }
}

export const serverSimulator = new ServerSimulator();
