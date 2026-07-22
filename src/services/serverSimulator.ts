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
  ForgeBestRecords,
  ForgeController,
  ForgeRunRecord,
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
  calculateEssenceExtraction,
  calculateEnhancePreview,
  calculateRepairCost,
  calculateSwordSellValue,
  createEmptyCatalystCountMap,
  getBossBagSizeForLevel,
  getBossDefinitionForMilestone,
  getRequiredProgressChargeId
} from '../constants/gameBalance';

const LOCAL_STORAGE_KEY = 'project_forge_user_profile_v1';
const LOCAL_STORAGE_BACKUP_KEY = 'project_forge_user_profile_v1_backup_before_schema_v3';
const AGENT_STORAGE_KEY = 'project_forge_agent_profile_v1';
const AGENT_STORAGE_BACKUP_KEY = 'project_forge_agent_profile_v1_backup_before_schema_v3';
const SCHEMA_VERSION = 3 as const;
const MAX_ENHANCE_LEVEL = 20;
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

export interface ServerSimulatorOptions {
  storageKey?: string;
  backupKey?: string;
  controller?: ForgeController;
  nickname?: string;
}

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

function createEmptyFailCountsByTargetLevel(): number[] {
  return Array.from({ length: MAX_ENHANCE_LEVEL + 1 }, () => 0);
}

function readFailCountsByTargetLevel(
  value: unknown,
  legacyConsecutiveFailCount: unknown,
  currentLevel: number
): number[] {
  const counts = createEmptyFailCountsByTargetLevel();
  if (Array.isArray(value)) {
    for (let targetLevel = 0; targetLevel <= MAX_ENHANCE_LEVEL; targetLevel += 1) {
      counts[targetLevel] = readNonNegativeInteger(value[targetLevel], 0);
    }
    return counts;
  }

  const legacyCount = readNonNegativeInteger(legacyConsecutiveFailCount, 0);
  const targetLevel = Math.min(MAX_ENHANCE_LEVEL, currentLevel + 1);
  if (targetLevel >= 1) counts[targetLevel] = legacyCount;
  return counts;
}

function createEmptyBestRecords(): ForgeBestRecords {
  return { human: null, agent: null };
}

function readForgeRunRecord(value: unknown, controller: ForgeController): ForgeRunRecord | null {
  if (!isRecord(value)) return null;
  const seriesId = value.seriesId;
  if (
    typeof value.weaponId !== 'string'
    || value.weaponId.length === 0
    || typeof seriesId !== 'string'
    || !SWORD_SERIES_LIST.some(series => series.id === seriesId)
    || typeof value.level !== 'number'
    || !Number.isFinite(value.level)
    || typeof value.achievedAt !== 'number'
    || !Number.isFinite(value.achievedAt)
  ) {
    return null;
  }

  return {
    weaponId: value.weaponId,
    seriesId: seriesId as SwordSeriesId,
    level: readNonNegativeInteger(value.level, 0, MAX_ENHANCE_LEVEL),
    weaponAttempts: readNonNegativeInteger(value.weaponAttempts, 0),
    repairCount: readNonNegativeInteger(value.repairCount, 0),
    adRestoreCount: readNonNegativeInteger(value.adRestoreCount, 0),
    controller,
    achievedAt: value.achievedAt,
    isPure: readBoolean(value.isPure, false)
  };
}

function readBestRecords(value: unknown): ForgeBestRecords {
  const records = createEmptyBestRecords();
  if (!isRecord(value)) return records;
  records.human = readForgeRunRecord(value.human, 'human');
  records.agent = readForgeRunRecord(value.agent, 'agent');
  return records;
}

function cloneForgeRunRecord(record: ForgeRunRecord | null): ForgeRunRecord | null {
  return record ? { ...record } : null;
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
    bestRecords: {
      human: cloneForgeRunRecord(profile.bestRecords.human),
      agent: cloneForgeRunRecord(profile.bestRecords.agent)
    },
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
      failCountsByTargetLevel: [...profile.currentWeapon.failCountsByTargetLevel],
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
  private readonly storageKey: string;
  private readonly backupKey: string;
  private readonly controller: ForgeController;
  private readonly initialNickname: string | undefined;

  constructor(random: () => number = Math.random, options: ServerSimulatorOptions = {}) {
    const controller = options.controller ?? 'human';
    if (controller !== 'human' && controller !== 'agent') {
      throw new TypeError('controller는 human 또는 agent여야 합니다.');
    }
    const defaultStorageKey = controller === 'human' ? LOCAL_STORAGE_KEY : AGENT_STORAGE_KEY;
    const defaultBackupKey = controller === 'human' ? LOCAL_STORAGE_BACKUP_KEY : AGENT_STORAGE_BACKUP_KEY;
    const storageKey = options.storageKey ?? defaultStorageKey;
    const backupKey = options.backupKey ?? (options.storageKey
      ? `${options.storageKey}_backup_before_schema_v3`
      : defaultBackupKey);
    if (!storageKey || !backupKey || storageKey === backupKey) {
      throw new TypeError('프로필 저장 키와 백업 키는 서로 다른 비어 있지 않은 문자열이어야 합니다.');
    }
    if (options.nickname !== undefined && options.nickname.length === 0) {
      throw new TypeError('nickname은 비어 있지 않은 문자열이어야 합니다.');
    }

    this.random = random;
    this.storageKey = storageKey;
    this.backupKey = backupKey;
    this.controller = controller;
    this.initialNickname = options.nickname;
    this.profile = this.loadOrCreateProfile();
  }

  public getProfile(): UserGameProfile {
    return cloneProfile(this.profile);
  }

  public createFreshWeaponState(ordinal = 1): CurrentWeaponState {
    return {
      weaponId: createUniqueId('weapon'),
      ordinal: Math.max(1, Math.floor(ordinal)),
      enhanceAttempts: 0,
      repairCount: 0,
      adRestoreCount: 0,
      failCountsByTargetLevel: createEmptyFailCountsByTargetLevel(),
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
      nickname: this.initialNickname
        ?? `${this.controller === 'agent' ? 'AI_대장장이' : '대장장이'}_${Math.floor(1000 + Math.random() * 9000)}`,
      controller: this.controller,
      bestRecords: createEmptyBestRecords(),
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
    if (![1, 6, 8, 12, 20, 30].includes(bagSize)) return null;
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
        && levelSnapshot <= 20
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

    if (
      (bagSize === 1 && active?.levelSnapshot !== 20)
      || (active?.levelSnapshot === 20 && bagSize !== 1)
    ) return null;

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
    const failCountsByTargetLevel = readFailCountsByTargetLevel(
      savedWeapon?.failCountsByTargetLevel ?? savedWeapon?.targetFailCounts ?? savedProfile.failCountsByTargetLevel,
      savedProfile.consecutiveFailCount,
      currentLevel
    );
    const currentWeapon: CurrentWeaponState = {
      weaponId,
      ordinal,
      enhanceAttempts: readNonNegativeInteger(savedWeapon?.enhanceAttempts, 0),
      repairCount: readNonNegativeInteger(savedWeapon?.repairCount, 0),
      adRestoreCount: readNonNegativeInteger(savedWeapon?.adRestoreCount, 0),
      failCountsByTargetLevel,
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
      controller: this.controller,
      bestRecords: readBestRecords(savedProfile.bestRecords),
      gold: readFiniteNumber(savedProfile.gold, defaults.gold),
      essences: readFiniteNumber(savedProfile.essences, defaults.essences),
      currentSeriesId,
      currentLevel,
      currentCrackCount: readNonNegativeInteger(savedProfile.currentCrackCount, defaults.currentCrackCount, 3),
      consecutiveFailCount: currentLevel < MAX_ENHANCE_LEVEL
        ? failCountsByTargetLevel[currentLevel + 1]
        : 0,
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
    localStorage.setItem(this.storageKey, JSON.stringify(profile));
  }

  private backupRawProfile(rawProfile: string): void {
    if (localStorage.getItem(this.backupKey) !== null) {
      throw new Error('v3 백업이 이미 존재하여 현재 프로필을 안전하게 교체할 수 없습니다.');
    }
    localStorage.setItem(this.backupKey, rawProfile);
  }

  private commitProfile(profile: UserGameProfile): void {
    const committedProfile = cloneProfile(profile);
    committedProfile.schemaVersion = SCHEMA_VERSION;
    committedProfile.controller = this.controller;
    this.persistProfile(committedProfile);
    this.profile = committedProfile;
  }

  private loadOrCreateProfile(): UserGameProfile {
    const defaults = this.createDefaultProfile();
    const saved = localStorage.getItem(this.storageKey);

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

  private createFinalBossEncounterState(weaponId: string): BossEncounterState {
    const boss = getBossDefinitionForMilestone(20);
    if (!boss) throw new Error('+20 최종 보스 정의가 없습니다.');
    return {
      weaponId,
      bagSize: 1,
      cursor: 1,
      bossSlot: 1,
      cycle: 1,
      active: {
        encounterId: `${weaponId}:final:20`,
        weaponId,
        levelSnapshot: 20,
        bossId: boss.id,
        revealedAt: Date.now()
      }
    };
  }

  private syncConsecutiveFailCount(profile: UserGameProfile): void {
    profile.consecutiveFailCount = profile.currentLevel < MAX_ENHANCE_LEVEL
      ? profile.currentWeapon.failCountsByTargetLevel[profile.currentLevel + 1]
      : 0;
  }

  private updateBestRecord(profile: UserGameProfile): void {
    const candidate: ForgeRunRecord = {
      weaponId: profile.currentWeapon.weaponId,
      seriesId: profile.currentSeriesId,
      level: profile.currentLevel,
      weaponAttempts: profile.currentWeapon.enhanceAttempts,
      repairCount: profile.currentWeapon.repairCount,
      adRestoreCount: profile.currentWeapon.adRestoreCount,
      controller: profile.controller,
      achievedAt: Date.now(),
      isPure: profile.isPureRun
        && profile.currentWeapon.repairCount === 0
        && profile.currentWeapon.adRestoreCount === 0
    };
    const previous = profile.bestRecords[profile.controller];
    if (
      !previous
      || candidate.level > previous.level
      || (candidate.level === previous.level && candidate.weaponAttempts < previous.weaponAttempts)
    ) {
      profile.bestRecords[profile.controller] = candidate;
    }
  }

  private resetForNewRun(profile: UserGameProfile): void {
    const masterCapitalLevel = profile.upgrades.master_capital || 0;
    profile.gold = 500 + masterCapitalLevel * 1000;
    profile.currentLevel = 0;
    profile.currentCrackCount = 0;
    profile.consecutiveFailCount = 0;
    profile.adRestoredCountThisRun = 0;
    profile.isPureRun = true;
    profile.runStartTime = Date.now();
    profile.claimedBossMilestonesThisRun = [];
    profile.currentWeapon = this.createFreshWeaponState(profile.currentWeapon.ordinal + 1);
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
    if (!boss || activeEncounter.levelSnapshot > 20 || boss.id !== activeEncounter.bossId) {
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
    if (activeEncounter.levelSnapshot === 20) {
      nextProfile.currentWeapon.bossEncounter = null;
    } else {
      const previousCycle = nextProfile.currentWeapon.bossEncounter?.cycle || 1;
      const nextEncounterLevel = getBossBagSizeForLevel(nextProfile.currentLevel) !== null
        ? nextProfile.currentLevel
        : activeEncounter.levelSnapshot;
      nextProfile.currentWeapon.bossEncounter = this.createBossEncounterState(
        nextProfile.currentWeapon.weaponId,
        nextEncounterLevel,
        previousCycle + 1
      );
    }

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
    const targetLevel = currentLevel + 1;
    if (requiredCharge) {
      nextProfile.currentWeapon.progressCharges[requiredCharge] -= 1;
    }
    nextProfile.gold -= preview.cost;
    nextProfile.totalEnhanceAttempts += 1;
    nextProfile.currentWeapon.enhanceAttempts += 1;

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
      nextProfile.currentWeapon.failCountsByTargetLevel[targetLevel] = 0;
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
      } else if (newLevel === 20) {
        nextProfile.currentWeapon.bossEncounter = this.createFinalBossEncounterState(
          nextProfile.currentWeapon.weaponId
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
      this.syncConsecutiveFailCount(nextProfile);
      this.updateBestRecord(nextProfile);
      message = `🎉 강화 성공! +${newLevel} [${SWORD_STAGES[newLevel].name}] (성공률 ${preview.successRate.toFixed(1)}%)`;
    } else {
      nextProfile.currentWeapon.failCountsByTargetLevel[targetLevel] += 1;
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
      this.syncConsecutiveFailCount(nextProfile);
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

  /** 현재 검 매각. 런은 유지하며 골드만 지급하고 새 검을 만든다. */
  public sellCurrentSword(): number {
    if (this.profile.currentLevel <= 0) {
      throw new Error('+1 이상 검만 매각할 수 있습니다.');
    }
    if (this.profile.currentCrackCount >= 3) {
      throw new Error('파괴된 검은 매각할 수 없습니다. 파괴 정산을 사용하세요.');
    }

    const nextProfile = this.getProfile();
    const currentLevel = nextProfile.currentLevel;
    const rawValue = calculateSwordSellValue(currentLevel, nextProfile.currentSeriesId, nextProfile.currentCrackCount);
    const forgeTemperatureLevel = nextProfile.upgrades.forge_temp || 0;
    const masterCapitalLevel = nextProfile.upgrades.master_capital || 0;
    const goldGained = Math.round(rawValue * (1 + forgeTemperatureLevel * 0.15))
      + masterCapitalLevel * 1000;

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
    if (this.profile.currentCrackCount >= 3) {
      throw new Error('파괴된 검은 수리할 수 없습니다. 광고 복구 또는 파괴 정산을 사용하세요.');
    }

    const repairCost = calculateRepairCost(this.profile);
    if (this.profile.gold < repairCost) {
      throw new Error('수리 비용 골드가 부족합니다.');
    }

    const nextProfile = this.getProfile();
    nextProfile.gold -= repairCost;
    nextProfile.currentCrackCount = Math.max(0, nextProfile.currentCrackCount - 1);
    nextProfile.currentWeapon.repairCount += 1;
    nextProfile.isPureRun = false;
    this.commitProfile(nextProfile);
    return true;
  }

  /** +5 이상 비파괴 검을 자발적으로 추출하고 새 런을 시작한다. */
  public extractCurrentSword(): number {
    if (this.profile.currentLevel < 5) {
      throw new Error('+5 이상 검만 정수로 추출할 수 있습니다.');
    }
    if (this.profile.currentCrackCount >= 3) {
      throw new Error('파괴된 검은 자발적으로 추출할 수 없습니다. 파괴 정산을 사용하세요.');
    }

    const nextProfile = this.getProfile();
    const totalGained = calculateEssenceExtraction(nextProfile.currentLevel);
    nextProfile.essences += totalGained;
    this.resetForNewRun(nextProfile);
    this.commitProfile(nextProfile);
    return totalGained;
  }

  /** 파괴된 검의 잔해 정산 및 런 리셋. */
  public finishRunAndClaimEssences(): number {
    if (this.profile.currentCrackCount < 3) {
      throw new Error('파괴된 검만 잔해 정산할 수 있습니다.');
    }

    const nextProfile = this.getProfile();
    const totalGained = Math.floor(calculateEssenceExtraction(nextProfile.currentLevel) * 0.25);
    nextProfile.essences += totalGained;
    this.resetForNewRun(nextProfile);
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
    nextProfile.currentWeapon.adRestoreCount += 1;
    nextProfile.isPureRun = false;
    this.syncConsecutiveFailCount(nextProfile);
    this.commitProfile(nextProfile);
    return true;
  }

  /** 시도 전 +0 새 검의 해금된 계열을 선택한다. */
  public selectSwordSeries(seriesId: SwordSeriesId): boolean {
    const series = SWORD_SERIES_LIST.find(item => item.id === seriesId);
    if (!series) {
      throw new Error('존재하지 않는 검 계열입니다.');
    }
    if (
      this.profile.currentLevel !== 0
      || this.profile.currentCrackCount !== 0
      || this.profile.currentWeapon.enhanceAttempts !== 0
    ) {
      throw new Error('+0 새 검은 강화 시도와 균열이 없을 때만 계열을 선택할 수 있습니다.');
    }
    const blueprintLevel = this.profile.upgrades.ancient_blueprint || 0;
    if (blueprintLevel < series.requiredBlueprintLevel) {
      throw new Error(`${series.name} 계열에 필요한 고대 설계도 레벨이 부족합니다.`);
    }
    if (this.profile.currentSeriesId === series.id) return true;

    const nextProfile = this.getProfile();
    nextProfile.currentSeriesId = series.id;
    const swordKey = `${series.id}_0`;
    if (!nextProfile.unlockedSwords.includes(swordKey)) {
      nextProfile.unlockedSwords.push(swordKey);
    }
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
