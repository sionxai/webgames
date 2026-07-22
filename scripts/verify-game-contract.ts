import assert from 'node:assert/strict';

const STORAGE_KEY = 'project_forge_user_profile_v1';
const V2_BACKUP_STORAGE_KEY = 'project_forge_user_profile_v1_backup_before_schema_v2';
const V3_BACKUP_STORAGE_KEY = 'project_forge_user_profile_v1_backup_before_schema_v3';
const AGENT_STORAGE_KEY = 'project_forge_agent_profile_v1';
const AGENT_BACKUP_STORAGE_KEY = 'project_forge_agent_profile_v1_backup_before_schema_v3';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  public failReads = false;
  public failWrites = false;
  public failWriteAt: number | null = null;
  public writeCount = 0;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('injected storage read failure');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writeCount += 1;
    if (this.failWrites || this.failWriteAt === this.writeCount) {
      throw new Error('injected storage failure');
    }
    this.values.set(key, value);
  }

  resetWriteTracking(): void {
    this.writeCount = 0;
    this.failWriteAt = null;
    this.failWrites = false;
  }

  clear(): void {
    this.values.clear();
    this.failReads = false;
    this.failWrites = false;
    this.failWriteAt = null;
    this.writeCount = 0;
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: storage
});

const { ServerSimulator } = await import('../src/services/serverSimulator');
const {
  SWORD_SERIES_LIST,
  calculateEssenceExtraction,
  calculateEnhancePreview,
  calculateRepairCost,
  calculateSwordSellValue,
  createEmptyCatalystCountMap,
  getBossBagSizeForLevel,
  getBossDefinitionForMilestone
} = await import('../src/constants/gameBalance');

type Simulator = InstanceType<typeof ServerSimulator>;
type Profile = ReturnType<Simulator['getProfile']>;

let assertionCount = 0;

function same(actual: unknown, expected: unknown, message?: string): void {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function truthy(value: unknown, message?: string): asserts value {
  assertionCount += 1;
  assert.ok(value, message);
}

function rejects(action: () => unknown, pattern: RegExp, message?: string): void {
  assertionCount += 1;
  assert.throws(action, pattern, message);
}

function controlledRandom(initialValues: number[] = [], throwWhenEmpty = false) {
  const values = [...initialValues];
  let calls = 0;
  return {
    random: () => {
      calls += 1;
      if (values.length > 0) return values.shift() as number;
      if (throwWhenEmpty) throw new Error('unexpected RNG call');
      return 0.5;
    },
    get calls() {
      return calls;
    }
  };
}

function freshSimulator(randomValues: number[] = []) {
  storage.clear();
  const rng = controlledRandom(randomValues);
  return { simulator: new ServerSimulator(rng.random), rng };
}

function saveAtLevel(
  simulator: Simulator,
  level: number,
  mutate?: (profile: Profile) => void
): void {
  const profile = simulator.getProfile();
  profile.currentLevel = level;
  profile.maxLevelReached = Math.max(profile.maxLevelReached, level);
  profile.currentCrackCount = 0;
  profile.gold = 1_000_000_000;
  mutate?.(profile);
  simulator.saveProfile(profile);
}

function setActiveBoss(
  simulator: Simulator,
  level: number,
  mutate?: (profile: Profile) => void
): string {
  const profile = simulator.getProfile();
  const boss = getBossDefinitionForMilestone(level);
  const bagSize = getBossBagSizeForLevel(level);
  if (!boss || bagSize === null) throw new Error(`invalid test boss level: ${level}`);
  profile.currentLevel = level;
  profile.maxLevelReached = Math.max(profile.maxLevelReached, level);
  profile.currentCrackCount = 0;
  profile.gold = 1_000_000_000;
  profile.currentWeapon.progressCharges = { tempered: 0, awakened: 0 };
  const encounterId = `${profile.currentWeapon.weaponId}:test:${level}`;
  profile.currentWeapon.bossEncounter = {
    weaponId: profile.currentWeapon.weaponId,
    bagSize,
    cursor: 1,
    bossSlot: 1,
    cycle: 1,
    active: {
      encounterId,
      weaponId: profile.currentWeapon.weaponId,
      levelSnapshot: level,
      bossId: boss.id,
      revealedAt: 1
    }
  };
  mutate?.(profile);
  simulator.saveProfile(profile);
  return encounterId;
}

// 1-2. 모든 단계/계열/대표 저항 조합에서 네 최종 확률의 범위와 합계를 묶어 검사한다.
let distributionsValid = true;
for (let level = 0; level <= 19; level += 1) {
  for (const series of SWORD_SERIES_LIST) {
    for (const crackControl of [0, 10]) {
      const preview = calculateEnhancePreview({
        currentSeriesId: series.id,
        currentLevel: level,
        consecutiveFailCount: 3,
        totalEnhanceAttempts: 20,
        upgrades: { precision_hammer: 2, crack_control: crackControl }
      });
      const rates = [preview.successRate, preview.keepRate, preview.crackRate, preview.dropRate];
      distributionsValid &&= rates.every(rate => rate >= 0 && rate <= 100)
        && Math.abs(rates.reduce((sum, rate) => sum + rate, 0) - 100) <= 1e-9;
    }
  }
}
truthy(distributionsValid, 'all enhancement distributions must be bounded and sum to 100');
const kingdomPreview = calculateEnhancePreview({
  currentSeriesId: 'kingdom', currentLevel: 12, consecutiveFailCount: 0, totalEnhanceAttempts: 20, upgrades: {}
});
const guardianPreview = calculateEnhancePreview({
  currentSeriesId: 'guardian', currentLevel: 12, consecutiveFailCount: 0, totalEnhanceAttempts: 20, upgrades: {}
});
truthy(
  guardianPreview.crackRate < kingdomPreview.crackRate && guardianPreview.keepRate > kingdomPreview.keepRate,
  'crack resistance must transfer removed crack mass to keep'
);

// 3-4. 실제 강화는 같은 누적분포를 사용하며 판정 RNG는 시도당 한 번이다.
const observedOutcomes: string[] = [];
const observedRngCalls: number[] = [];
for (const expected of ['SUCCESS', 'KEEP', 'CRACK', 'DROP'] as const) {
  const preview = calculateEnhancePreview({
    currentSeriesId: 'kingdom', currentLevel: 17, consecutiveFailCount: 0, totalEnhanceAttempts: 20, upgrades: {}
  });
  const roll = expected === 'SUCCESS'
    ? preview.successRate / 2
    : expected === 'KEEP'
      ? preview.successRate + preview.keepRate / 2
      : expected === 'CRACK'
        ? preview.successRate + preview.keepRate + preview.crackRate / 2
        : preview.successRate + preview.keepRate + preview.crackRate + preview.dropRate / 2;
  const { simulator, rng } = freshSimulator([roll / 100]);
  saveAtLevel(simulator, 17, profile => {
    profile.totalEnhanceAttempts = 20;
    profile.currentWeapon.progressCharges.awakened = 1;
  });
  observedOutcomes.push(simulator.attemptEnhance().resultType);
  observedRngCalls.push(rng.calls);
}
same(observedOutcomes, ['SUCCESS', 'KEEP', 'CRACK', 'DROP']);
same(observedRngCalls, [1, 1, 1, 1]);

// 5-13. +5 최초 bag, reload 유지, reveal, 보상 후 새 bag, pause/resume, stale 거부.
{
  const { simulator, rng } = freshSimulator([0, 0.5, 0.25]);
  saveAtLevel(simulator, 4);
  const enhanced = simulator.attemptEnhance();
  same(
    [enhanced.newLevel, simulator.getProfile().currentWeapon.bossEncounter?.bossSlot, rng.calls],
    [5, 4, 2]
  );

  const beforeReload = simulator.getProfile().currentWeapon.bossEncounter;
  const reloadRng = controlledRandom([], true);
  const reloaded = new ServerSimulator(reloadRng.random);
  same(reloaded.getProfile().currentWeapon.bossEncounter, beforeReload);
  same(reloadRng.calls, 0);

  simulator.defeatNormalEnemy(10);
  simulator.defeatNormalEnemy(10);
  simulator.defeatNormalEnemy(10);
  same(simulator.getProfile().currentWeapon.bossEncounter?.cursor, 3);
  const reveal = simulator.defeatNormalEnemy(10);
  truthy(reveal.bossRevealed && reveal.activeEncounter);
  const encounterId = reveal.activeEncounter.encounterId;
  const defeated = simulator.defeatBoss(encounterId);
  same([defeated.progressReward.after.tempered, rng.calls], [4, 3]);

  const pausedCursor = simulator.getProfile().currentWeapon.bossEncounter?.cursor;
  const paused = simulator.defeatNormalEnemy(10);
  same(
    [paused.paused, paused.bagProgressed, simulator.getProfile().currentWeapon.bossEncounter?.cursor, rng.calls],
    [true, false, pausedCursor, 3]
  );

  const resumedProfile = simulator.getProfile();
  resumedProfile.currentWeapon.progressCharges.tempered = 0;
  simulator.saveProfile(resumedProfile);
  const resumed = simulator.defeatNormalEnemy(10);
  same([resumed.bagProgressed, resumed.encounter?.cursor, rng.calls], [true, (pausedCursor ?? 0) + 1, 3]);
  rejects(() => simulator.defeatBoss(encounterId), /만료|활성 보스/);
}

// 14. 단계별 진행 보상은 목표치 fill이며 이미 높은 값은 줄이지 않는다.
{
  const rewards: unknown[] = [];
  for (const fixture of [
    { level: 5, before: { tempered: 0, awakened: 0 }, after: { tempered: 4, awakened: 0 } },
    { level: 10, before: { tempered: 1, awakened: 1 }, after: { tempered: 3, awakened: 2 } },
    { level: 14, before: { tempered: 4, awakened: 1 }, after: { tempered: 4, awakened: 2 } },
    { level: 18, before: { tempered: 4, awakened: 0 }, after: { tempered: 4, awakened: 1 } }
  ]) {
    const { simulator } = freshSimulator(fixture.level === 18 ? [0.5, 0.1] : [0.1]);
    const encounterId = setActiveBoss(simulator, fixture.level, profile => {
      profile.currentWeapon.progressCharges = { ...fixture.before };
    });
    const result = simulator.defeatBoss(encounterId);
    rewards.push({ before: result.progressReward.before, gained: result.progressReward.gained, after: result.progressReward.after });
  }
  same(rewards, [
    { before: { tempered: 0, awakened: 0 }, gained: { tempered: 4, awakened: 0 }, after: { tempered: 4, awakened: 0 } },
    { before: { tempered: 1, awakened: 1 }, gained: { tempered: 2, awakened: 1 }, after: { tempered: 3, awakened: 2 } },
    { before: { tempered: 4, awakened: 1 }, gained: { tempered: 0, awakened: 1 }, after: { tempered: 4, awakened: 2 } },
    { before: { tempered: 4, awakened: 0 }, gained: { tempered: 0, awakened: 1 }, after: { tempered: 4, awakened: 1 } }
  ]);
}

// 15-18. +9->10과 +13->14 경계에서 현재 구간의 공용 충전만 소비한다.
{
  const { simulator } = freshSimulator([0, 0, 0]);
  saveAtLevel(simulator, 9, profile => {
    profile.currentWeapon.progressCharges = { tempered: 4, awakened: 0 };
  });
  simulator.attemptEnhance();
  same([simulator.getProfile().currentLevel, simulator.getProfile().currentWeapon.progressCharges.tempered], [10, 4]);
  simulator.attemptEnhance();
  same(simulator.getProfile().currentWeapon.progressCharges.tempered, 3);

  saveAtLevel(simulator, 13, profile => {
    profile.currentWeapon.progressCharges = { tempered: 1, awakened: 2 };
  });
  simulator.attemptEnhance();
  same([simulator.getProfile().currentLevel, simulator.getProfile().currentWeapon.progressCharges], [14, { tempered: 0, awakened: 2 }]);
  simulator.attemptEnhance();
  same(simulator.getProfile().currentWeapon.progressCharges.awakened, 1);
}

// 19-21. 세 번째 crack 파괴와 광고 복구는 encounter/weaponId/잔여 충전을 보존한다.
{
  const preview = calculateEnhancePreview({
    currentSeriesId: 'kingdom', currentLevel: 10, consecutiveFailCount: 0, totalEnhanceAttempts: 20, upgrades: {}
  });
  const crackRoll = preview.successRate + preview.keepRate + preview.crackRate / 2;
  const { simulator } = freshSimulator([crackRoll / 100]);
  saveAtLevel(simulator, 10, profile => {
    profile.totalEnhanceAttempts = 20;
    profile.currentCrackCount = 2;
    profile.currentWeapon.progressCharges = { tempered: 2, awakened: 1 };
    profile.currentWeapon.bossEncounter = {
      weaponId: profile.currentWeapon.weaponId, bagSize: 8, cursor: 2, bossSlot: 6, cycle: 2, active: null
    };
  });
  const beforeWeapon = simulator.getProfile().currentWeapon;
  same(simulator.attemptEnhance().resultType, 'DESTROYED');
  same(
    [simulator.getProfile().currentWeapon.weaponId, simulator.getProfile().currentWeapon.progressCharges, simulator.getProfile().currentWeapon.bossEncounter],
    [beforeWeapon.weaponId, { tempered: 1, awakened: 1 }, beforeWeapon.bossEncounter]
  );
  simulator.adRestoreSword();
  same(
    [simulator.getProfile().currentLevel, simulator.getProfile().currentWeapon.weaponId, simulator.getProfile().currentWeapon.progressCharges, simulator.getProfile().currentWeapon.bossEncounter],
    [8, beforeWeapon.weaponId, { tempered: 1, awakened: 1 }, beforeWeapon.bossEncounter]
  );
}

// 22-25. 매각/정산만 fresh weapon을 만들고 영구/레거시 자원은 보존한다.
{
  const { simulator } = freshSimulator();
  saveAtLevel(simulator, 12, profile => {
    profile.currentWeapon.progressCharges = { tempered: 3, awakened: 2 };
    profile.transcendence.godblood = { relics: 2, shards: 17 };
    profile.catalystInventory.molten_core = 9;
  });
  const beforeSale = simulator.getProfile();
  simulator.sellCurrentSword();
  const afterSale = simulator.getProfile();
  truthy(afterSale.currentWeapon.weaponId !== beforeSale.currentWeapon.weaponId);
  same(
    [afterSale.currentWeapon.ordinal, afterSale.currentWeapon.progressCharges, afterSale.currentWeapon.bossEncounter, afterSale.transcendence.godblood, afterSale.catalystInventory.molten_core],
    [beforeSale.currentWeapon.ordinal + 1, { tempered: 0, awakened: 0 }, null, { relics: 2, shards: 17 }, 9]
  );

  saveAtLevel(simulator, 10, profile => {
    profile.currentWeapon.progressCharges.tempered = 3;
    profile.currentCrackCount = 3;
  });
  const beforeFinishId = simulator.getProfile().currentWeapon.weaponId;
  simulator.finishRunAndClaimEssences();
  const afterFinish = simulator.getProfile();
  truthy(afterFinish.currentWeapon.weaponId !== beforeFinishId);
  same(
    [afterFinish.currentWeapon.progressCharges, afterFinish.transcendence.godblood, afterFinish.catalystInventory.molten_core],
    [{ tempered: 0, awakened: 0 }, { relics: 2, shards: 17 }, 9]
  );
}

// 26-29. v1 레거시 네 묶음은 원값 보존, 신규 live는 0, v2 재로드는 멱등이다.
{
  storage.clear();
  const inventory = createEmptyCatalystCountMap();
  const pity = createEmptyCatalystCountMap();
  const active = createEmptyCatalystCountMap();
  inventory.molten_core = 12;
  pity.molten_core = 9;
  active.molten_core = 7;
  const legacyRaw = JSON.stringify({
    userId: 'legacy-user', nickname: 'legacy', currentLevel: 10, currentCrackCount: 3,
    catalystInventory: inventory, catalystPity: pity,
    discoveredCatalysts: ['molten_core'], activeCatalystCharges: active
  });
  storage.setItem(STORAGE_KEY, legacyRaw);
  storage.resetWriteTracking();
  const migrateRng = controlledRandom([0.4]);
  const migrated = new ServerSimulator(migrateRng.random);
  const firstProfile = migrated.getProfile();
  same(
    [firstProfile.schemaVersion, firstProfile.catalystInventory.molten_core, firstProfile.catalystPity.molten_core,
      firstProfile.activeCatalystCharges.molten_core, firstProfile.discoveredCatalysts, firstProfile.currentWeapon.progressCharges],
    [3, 12, 9, 7, ['molten_core'], { tempered: 0, awakened: 0 }]
  );
  same([migrateRng.calls, storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount], [1, legacyRaw, 2]);
  const firstSerialized = storage.getItem(STORAGE_KEY);
  storage.resetWriteTracking();
  const reloadRng = controlledRandom([], true);
  const migratedAgain = new ServerSimulator(reloadRng.random);
  same(
    [reloadRng.calls, migratedAgain.getProfile().currentWeapon.weaponId, storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    [0, firstProfile.currentWeapon.weaponId, legacyRaw, 1]
  );
  same(storage.getItem(STORAGE_KEY), firstSerialized);
}

// v2 -> v3는 기존 실패 보정을 현재 목표 칸으로 옮기고 신규 무기/기록 필드를 안전하게 채운다.
{
  storage.clear();
  const v2Raw = JSON.stringify({
    schemaVersion: 2,
    userId: 'v2-user',
    nickname: 'v2-smith',
    currentLevel: 4,
    maxLevelReached: 8,
    consecutiveFailCount: 7,
    currentWeapon: {
      weaponId: 'v2-weapon', ordinal: 3, progressCharges: { tempered: 2, awakened: 1 },
      bossEncounter: null, claimedRareBossStages: [], endShardFirstAttemptGranted: false
    }
  });
  storage.setItem(STORAGE_KEY, v2Raw);
  storage.setItem(V2_BACKUP_STORAGE_KEY, 'original-v1-backup');
  storage.resetWriteTracking();
  const simulator = new ServerSimulator(controlledRandom([], true).random);
  const profile = simulator.getProfile();
  same(
    [profile.schemaVersion, profile.controller, profile.currentWeapon.weaponId,
      profile.currentWeapon.enhanceAttempts, profile.currentWeapon.repairCount,
      profile.currentWeapon.adRestoreCount, profile.currentWeapon.failCountsByTargetLevel.length,
      profile.currentWeapon.failCountsByTargetLevel[5], profile.consecutiveFailCount, profile.bestRecords],
    [3, 'human', 'v2-weapon', 0, 0, 0, 21, 7, 7, { human: null, agent: null }]
  );
  same(
    [storage.getItem(V2_BACKUP_STORAGE_KEY), storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    ['original-v1-backup', v2Raw, 2]
  );

  profile.currentWeapon.failCountsByTargetLevel[5] = 99;
  same(simulator.getProfile().currentWeapon.failCountsByTargetLevel[5], 7, 'profile clones must be deep');
}

// 사람/agent v3 마이그레이션 백업은 서로 다른 키에 각자의 raw만 보존한다.
{
  storage.clear();
  const humanV2Raw = JSON.stringify({ schemaVersion: 2, userId: 'human-v2', currentLevel: 0 });
  const agentV2Raw = JSON.stringify({ schemaVersion: 2, userId: 'agent-v2', currentLevel: 0 });
  storage.setItem(STORAGE_KEY, humanV2Raw);
  storage.setItem(AGENT_STORAGE_KEY, agentV2Raw);
  storage.resetWriteTracking();
  const human = new ServerSimulator(controlledRandom([], true).random);
  const agent = new ServerSimulator(controlledRandom([], true).random, { controller: 'agent' });
  same(
    [human.getProfile().controller, agent.getProfile().controller,
      storage.getItem(V3_BACKUP_STORAGE_KEY), storage.getItem(AGENT_BACKUP_STORAGE_KEY),
      storage.getItem(V2_BACKUP_STORAGE_KEY), storage.writeCount],
    ['human', 'agent', humanV2Raw, agentV2Raw, null, 4]
  );
}

// 기본 human/agent 키와 프로필은 물리적으로 분리되며 nickname/controller 주입을 보존한다.
{
  storage.clear();
  const human = new ServerSimulator(controlledRandom().random, { nickname: 'human-smith' });
  const humanProfile = human.getProfile();
  humanProfile.gold = 1111;
  human.saveProfile(humanProfile);

  const agent = new ServerSimulator(controlledRandom().random, { controller: 'agent', nickname: 'agent-smith' });
  const agentProfile = agent.getProfile();
  agentProfile.gold = 2222;
  agent.saveProfile(agentProfile);

  const reloadedHuman = new ServerSimulator(controlledRandom([], true).random);
  const reloadedAgent = new ServerSimulator(controlledRandom([], true).random, { controller: 'agent' });
  same(
    [reloadedHuman.getProfile().controller, reloadedHuman.getProfile().nickname, reloadedHuman.getProfile().gold,
      reloadedAgent.getProfile().controller, reloadedAgent.getProfile().nickname, reloadedAgent.getProfile().gold],
    ['human', 'human-smith', 1111, 'agent', 'agent-smith', 2222]
  );
  truthy(storage.getItem(STORAGE_KEY) && storage.getItem(AGENT_STORAGE_KEY));
  same([storage.getItem(V3_BACKUP_STORAGE_KEY), storage.getItem(AGENT_BACKUP_STORAGE_KEY)], [null, null]);
}

// 매각은 골드만 지급하고 런 메타데이터를 유지하며 +1 추출 exploit을 허용하지 않는다.
{
  const { simulator } = freshSimulator();
  saveAtLevel(simulator, 1, profile => {
    profile.gold = 1000;
    profile.essences = 9;
    profile.upgrades.master_capital = 2;
    profile.claimedBossMilestonesThisRun = [5];
    profile.adRestoredCountThisRun = 1;
    profile.isPureRun = false;
    profile.runStartTime = 123;
  });
  const before = simulator.getProfile();
  const expectedGold = calculateSwordSellValue(1, before.currentSeriesId, 0) + 2000;
  same(simulator.sellCurrentSword(), expectedGold);
  const after = simulator.getProfile();
  same(
    [after.gold, after.essences, after.currentLevel, after.claimedBossMilestonesThisRun,
      after.adRestoredCountThisRun, after.isPureRun, after.runStartTime],
    [1000 + expectedGold, 9, 0, [5], 1, false, 123]
  );
  truthy(after.currentWeapon.weaponId !== before.currentWeapon.weaponId);
  const beforeRejectedExtraction = simulator.getProfile();
  rejects(() => simulator.extractCurrentSword(), /\+5 이상/);
  same(simulator.getProfile(), beforeRejectedExtraction);
}

// +0 검 매각은 반복 호출해도 메모리와 저장 프로필을 전혀 바꾸지 않는다.
{
  const { simulator } = freshSimulator();
  const before = simulator.getProfile();
  const serializedBefore = storage.getItem(STORAGE_KEY);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    rejects(() => simulator.sellCurrentSword(), /\+1 이상/);
  }
  same(simulator.getProfile(), before);
  same(storage.getItem(STORAGE_KEY), serializedBefore);
}

// 파괴된 검은 매각할 수 없고 거부 전후 상태가 동일하다.
{
  const { simulator } = freshSimulator();
  saveAtLevel(simulator, 10, profile => {
    profile.currentCrackCount = 3;
    profile.gold = 1234;
  });
  const before = simulator.getProfile();
  const serializedBefore = storage.getItem(STORAGE_KEY);
  rejects(() => simulator.sellCurrentSword(), /파괴된 검.*매각/);
  same(simulator.getProfile(), before);
  same(storage.getItem(STORAGE_KEY), serializedBefore);
}

// 자발 추출과 파괴 잔해는 같은 정수 공식의 100%/25%를 지급하고 새 런을 초기화한다.
{
  const { simulator } = freshSimulator();
  saveAtLevel(simulator, 5, profile => {
    profile.gold = 9999;
    profile.essences = 2;
    profile.upgrades.master_capital = 3;
    profile.claimedBossMilestonesThisRun = [5];
    profile.adRestoredCountThisRun = 1;
    profile.isPureRun = false;
    profile.runStartTime = 1;
  });
  const beforeWeaponId = simulator.getProfile().currentWeapon.weaponId;
  const extraction = calculateEssenceExtraction(5);
  same(simulator.extractCurrentSword(), extraction);
  const extracted = simulator.getProfile();
  same(
    [extracted.essences, extracted.gold, extracted.currentLevel, extracted.currentCrackCount,
      extracted.adRestoredCountThisRun, extracted.isPureRun, extracted.claimedBossMilestonesThisRun],
    [2 + extraction, 3500, 0, 0, 0, true, []]
  );
  truthy(extracted.currentWeapon.weaponId !== beforeWeaponId && extracted.runStartTime > 1);

  saveAtLevel(simulator, 10, profile => {
    profile.essences = 4;
    profile.upgrades.master_capital = 1;
    profile.currentCrackCount = 2;
  });
  const beforeInvalidFinish = simulator.getProfile();
  rejects(() => simulator.finishRunAndClaimEssences(), /파괴된 검만/);
  same(simulator.getProfile(), beforeInvalidFinish);
  const destroyed = simulator.getProfile();
  destroyed.currentCrackCount = 3;
  simulator.saveProfile(destroyed);
  const salvage = Math.floor(calculateEssenceExtraction(10) * 0.25);
  same(simulator.finishRunAndClaimEssences(), salvage);
  same([simulator.getProfile().essences, simulator.getProfile().gold], [4 + salvage, 1500]);
}

// 수리비는 현재 검 수리 횟수에 따라 누적되고 수리/광고 복구는 순수성을 해제한다.
{
  const { simulator } = freshSimulator();
  saveAtLevel(simulator, 4, profile => {
    profile.currentCrackCount = 2;
    profile.gold = 10_000;
    profile.totalEnhanceAttempts = 0;
    profile.upgrades.repair_tech = 1;
  });
  same(calculateRepairCost(simulator.getProfile()), 1150);
  truthy(simulator.repairCrack());
  const repaired = simulator.getProfile();
  same(
    [repaired.gold, repaired.currentCrackCount, repaired.currentWeapon.repairCount,
      repaired.isPureRun, calculateRepairCost(repaired)],
    [8850, 1, 1, false, 2300]
  );
  const destroyed = simulator.getProfile();
  destroyed.currentCrackCount = 3;
  destroyed.currentWeapon.failCountsByTargetLevel[3] = 4;
  destroyed.consecutiveFailCount = 9;
  simulator.saveProfile(destroyed);
  const beforeRejectedRepair = simulator.getProfile();
  const serializedBeforeRejectedRepair = storage.getItem(STORAGE_KEY);
  rejects(() => simulator.repairCrack(), /파괴된 검.*수리/);
  same(simulator.getProfile(), beforeRejectedRepair);
  same(storage.getItem(STORAGE_KEY), serializedBeforeRejectedRepair);
  truthy(simulator.adRestoreSword());
  same(
    [simulator.getProfile().currentWeapon.adRestoreCount, simulator.getProfile().adRestoredCountThisRun,
      simulator.getProfile().isPureRun, simulator.getProfile().consecutiveFailCount],
    [1, 1, false, 4]
  );
}

// 목표별 pity는 하락 후에도 높은 목표 값을 보존하고 각 목표 성공 때만 해당 칸을 지운다.
{
  const dropPreview = calculateEnhancePreview({
    currentSeriesId: 'kingdom', currentLevel: 9, consecutiveFailCount: 0,
    failCountsByTargetLevel: Array(21).fill(0), totalEnhanceAttempts: 20, upgrades: {}
  });
  const dropRoll = dropPreview.successRate + dropPreview.keepRate + dropPreview.crackRate + dropPreview.dropRate / 2;
  const { simulator } = freshSimulator([dropRoll / 100, 0, 0]);
  saveAtLevel(simulator, 9, profile => {
    profile.totalEnhanceAttempts = 20;
  });
  same(simulator.attemptEnhance().resultType, 'DROP');
  same(
    [simulator.getProfile().currentLevel, simulator.getProfile().currentWeapon.failCountsByTargetLevel[10],
      simulator.getProfile().consecutiveFailCount],
    [8, 1, 0]
  );
  same(simulator.attemptEnhance().newLevel, 9);
  same(
    [simulator.getProfile().currentWeapon.failCountsByTargetLevel[9],
      simulator.getProfile().currentWeapon.failCountsByTargetLevel[10], simulator.getProfile().consecutiveFailCount],
    [0, 1, 1]
  );
  same(calculateEnhancePreview(simulator.getProfile()).failBonus, 0.5);
  same(simulator.attemptEnhance().newLevel, 10);
  same([simulator.getProfile().currentWeapon.failCountsByTargetLevel[10], simulator.getProfile().consecutiveFailCount], [0, 0]);
}

// 기록은 달성 순간 스냅샷이고 후속 수리/매각에 불변이며 동률은 더 적은 무기 시도가 우선한다.
{
  const { simulator } = freshSimulator([0, 0]);
  saveAtLevel(simulator, 0, profile => {
    profile.totalEnhanceAttempts = 20;
    profile.currentWeapon.enhanceAttempts = 4;
  });
  simulator.attemptEnhance();
  const firstRecord = simulator.getProfile().bestRecords.human;
  truthy(firstRecord);
  same(
    [firstRecord.level, firstRecord.weaponAttempts, firstRecord.repairCount,
      firstRecord.adRestoreCount, firstRecord.controller, firstRecord.isPure],
    [1, 5, 0, 0, 'human', true]
  );

  const cracked = simulator.getProfile();
  cracked.currentCrackCount = 1;
  cracked.gold = 100_000;
  simulator.saveProfile(cracked);
  simulator.repairCrack();
  same(simulator.getProfile().bestRecords.human, firstRecord);
  simulator.sellCurrentSword();
  same(simulator.getProfile().bestRecords.human, firstRecord);

  const secondWeaponId = simulator.getProfile().currentWeapon.weaponId;
  simulator.attemptEnhance();
  const tieWinner = simulator.getProfile().bestRecords.human;
  truthy(tieWinner);
  same([tieWinner.weaponId, tieWinner.level, tieWinner.weaponAttempts], [secondWeaponId, 1, 1]);
  const externalClone = simulator.getProfile();
  (externalClone.bestRecords.human as { level: number }).level = 20;
  same(simulator.getProfile().bestRecords.human?.level, 1);
}

// 계열은 설계도 조건을 충족한 무시도 +0 새 검에서만 바뀌며 거부 시 상태가 불변이다.
{
  const { simulator } = freshSimulator([0]);
  const initial = simulator.getProfile();
  rejects(() => simulator.selectSwordSeries('guardian'), /설계도/);
  same(simulator.getProfile(), initial);
  const unlocked = simulator.getProfile();
  unlocked.upgrades.ancient_blueprint = 2;
  simulator.saveProfile(unlocked);
  truthy(simulator.selectSwordSeries('guardian'));
  same(
    [simulator.getProfile().currentSeriesId, simulator.getProfile().currentWeapon.weaponId],
    ['guardian', initial.currentWeapon.weaponId]
  );
  simulator.attemptEnhance();
  const attempted = simulator.getProfile();
  rejects(() => simulator.selectSwordSeries('flame'), /강화 시도/);
  same(simulator.getProfile(), attempted);
  rejects(() => simulator.selectSwordSeries('unknown' as 'kingdom'), /존재하지 않는/);
  same(simulator.getProfile(), attempted);
}

// 손상/legacy 로드 교체는 raw 백업 성공 뒤에만 수행하며 읽기/쓰기 실패는 fail-closed다.
{
  storage.clear();
  const originalRaw = '{"schemaVersion":2,"userId":"keep-me"}';
  storage.setItem(STORAGE_KEY, originalRaw);
  storage.resetWriteTracking();
  storage.failReads = true;
  rejects(() => new ServerSimulator(), /injected storage read failure/);
  storage.failReads = false;
  same([storage.writeCount, storage.getItem(STORAGE_KEY)], [0, originalRaw]);
}

{
  storage.clear();
  const malformedRaw = '{broken-json';
  storage.setItem(STORAGE_KEY, malformedRaw);
  storage.resetWriteTracking();
  new ServerSimulator();
  const replacement = JSON.parse(storage.getItem(STORAGE_KEY) as string) as { schemaVersion: number };
  same(
    [storage.getItem(V3_BACKUP_STORAGE_KEY), replacement.schemaVersion, storage.writeCount],
    [malformedRaw, 3, 2]
  );
}

{
  storage.clear();
  const nonObjectRaw = '17';
  storage.setItem(STORAGE_KEY, nonObjectRaw);
  storage.resetWriteTracking();
  new ServerSimulator();
  const replacement = JSON.parse(storage.getItem(STORAGE_KEY) as string) as { schemaVersion: number };
  same(
    [storage.getItem(V3_BACKUP_STORAGE_KEY), replacement.schemaVersion, storage.writeCount],
    [nonObjectRaw, 3, 2]
  );
}

{
  storage.clear();
  const malformedRaw = '{backup-must-succeed-first';
  storage.setItem(STORAGE_KEY, malformedRaw);
  storage.resetWriteTracking();
  storage.failWriteAt = 1;
  rejects(() => new ServerSimulator(), /injected storage failure/);
  storage.failWriteAt = null;
  same(
    [storage.getItem(STORAGE_KEY), storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    [malformedRaw, null, 1]
  );
}

{
  storage.clear();
  const malformedRaw = '{default-write-failure';
  storage.setItem(STORAGE_KEY, malformedRaw);
  storage.resetWriteTracking();
  storage.failWriteAt = 2;
  rejects(() => new ServerSimulator(), /injected storage failure/);
  storage.failWriteAt = null;
  same(
    [storage.getItem(STORAGE_KEY), storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    [malformedRaw, malformedRaw, 2]
  );
}

{
  storage.clear();
  const legacyRaw = JSON.stringify({ userId: 'migration-write-failure', currentLevel: 0 });
  storage.setItem(STORAGE_KEY, legacyRaw);
  storage.resetWriteTracking();
  storage.failWriteAt = 2;
  rejects(() => new ServerSimulator(), /injected storage failure/);
  storage.failWriteAt = null;
  same(
    [storage.getItem(STORAGE_KEY), storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    [legacyRaw, legacyRaw, 2]
  );
}

// 이미 존재하는 v3 백업은 손상 raw로 덮지 않고 main 교체도 중단한다.
{
  storage.clear();
  const malformedRaw = '{preserve-main-until-backup';
  const existingV3Backup = JSON.stringify({ schemaVersion: 2, userId: 'first-v3-backup' });
  storage.setItem(STORAGE_KEY, malformedRaw);
  storage.setItem(V2_BACKUP_STORAGE_KEY, 'original-v1-backup');
  storage.setItem(V3_BACKUP_STORAGE_KEY, existingV3Backup);
  storage.resetWriteTracking();
  rejects(() => new ServerSimulator(), /v3 백업.*이미 존재/);
  same(
    [storage.getItem(STORAGE_KEY), storage.getItem(V2_BACKUP_STORAGE_KEY),
      storage.getItem(V3_BACKUP_STORAGE_KEY), storage.writeCount],
    [malformedRaw, 'original-v1-backup', existingV3Backup, 0]
  );
}

// 30-35. +18/+19 rare는 무기+공개단계 최초 한 번이며 조각 threshold를 정확히 합성한다.
{
  const { simulator, rng } = freshSimulator([0.5, 0, 0.2]);
  const encounterId = setActiveBoss(simulator, 18, profile => {
    profile.transcendence.godblood.shards = 39;
  });
  const first = simulator.defeatBoss(encounterId);
  same(
    [first.transcendenceReward?.fullRelicDropped, first.transcendenceReward?.synthesizedRelics, simulator.getProfile().transcendence.godblood],
    [false, 1, { relics: 1, shards: 0 }]
  );
  rejects(() => simulator.defeatBoss(encounterId), /만료|활성 보스/);

  const repeatProfile = simulator.getProfile();
  repeatProfile.currentWeapon.progressCharges.awakened = 0;
  simulator.saveProfile(repeatProfile);
  const repeatEncounter = simulator.defeatNormalEnemy(0).activeEncounter;
  truthy(repeatEncounter);
  const repeat = simulator.defeatBoss(repeatEncounter.encounterId);
  same([repeat.transcendenceReward, simulator.getProfile().transcendence.godblood, rng.calls], [null, { relics: 1, shards: 0 }, 3]);

  const persisted = simulator.getProfile();
  persisted.currentWeapon.progressCharges.awakened = 0;
  persisted.currentWeapon.bossEncounter = {
    weaponId: persisted.currentWeapon.weaponId,
    bagSize: 20,
    cursor: 1,
    bossSlot: 1,
    cycle: 9,
    active: {
      encounterId: `${persisted.currentWeapon.weaponId}:reload-repeat`,
      weaponId: persisted.currentWeapon.weaponId,
      levelSnapshot: 18,
      bossId: 'boss_18',
      revealedAt: 2
    }
  };
  simulator.saveProfile(persisted);
  const reloadRng = controlledRandom([0.3]);
  const reloaded = new ServerSimulator(reloadRng.random);
  const reloadRepeat = reloaded.defeatBoss(`${persisted.currentWeapon.weaponId}:reload-repeat`);
  same([reloadRepeat.transcendenceReward, reloadRng.calls], [null, 1]);
}

{
  const { simulator } = freshSimulator([0.01, 0]);
  const encounterId = setActiveBoss(simulator, 18, profile => {
    profile.transcendence.godblood.shards = 10;
  });
  const reward = simulator.defeatBoss(encounterId).transcendenceReward;
  same(
    [reward?.fullRelicDropped, reward?.relicsGained, reward?.shardsGained, simulator.getProfile().transcendence.godblood],
    [true, 1, 0, { relics: 1, shards: 10 }]
  );
}

{
  const { simulator } = freshSimulator([0.5, 0]);
  const encounterId = setActiveBoss(simulator, 19, profile => {
    profile.transcendence.end.shards = 99;
  });
  const reward = simulator.defeatBoss(encounterId).transcendenceReward;
  same([reward?.synthesizedRelics, simulator.getProfile().transcendence.end], [1, { relics: 1, shards: 0 }]);
}

// 36-37. 첫 +20 시도 +1 및 성공 +2를 같은 커밋에서 합성한다.
{
  const { simulator, rng } = freshSimulator([0]);
  saveAtLevel(simulator, 19, profile => {
    profile.currentWeapon.progressCharges.awakened = 1;
    profile.transcendence.end.shards = 97;
  });
  const result = simulator.attemptEnhance();
  same(
    [result.newLevel, result.transcendenceRewards.map(reward => reward.source)],
    [20, ['ENHANCE_20_FIRST_ATTEMPT', 'ENHANCE_20_SUCCESS']]
  );
  same(
    [simulator.getProfile().transcendence.end, simulator.getProfile().currentWeapon.endShardFirstAttemptGranted, rng.calls],
    [{ relics: 1, shards: 0 }, true, 1]
  );
  const finalEncounter = simulator.getProfile().currentWeapon.bossEncounter;
  same(
    [finalEncounter?.bagSize, finalEncounter?.cursor, finalEncounter?.bossSlot,
      finalEncounter?.active?.levelSnapshot, finalEncounter?.active?.bossId],
    [1, 1, 1, 20, 'boss_20']
  );
  const reloadRng = controlledRandom([], true);
  const reloaded = new ServerSimulator(reloadRng.random);
  same([reloaded.getProfile().currentWeapon.bossEncounter, reloadRng.calls], [finalEncounter, 0]);
  const finalResult = reloaded.defeatBoss(finalEncounter?.active?.encounterId as string);
  same(
    [finalResult.levelSnapshot, finalResult.firstRewardGranted, finalResult.essencesGained,
      reloaded.getProfile().currentWeapon.bossEncounter],
    [20, true, 600, null]
  );
  rejects(() => reloaded.defeatBoss(finalEncounter?.active?.encounterId as string), /활성 보스/);
}

// 38-39. 저장 실패는 예외를 보존하고 메모리 profile을 진행시키지 않는다.
{
  const { simulator } = freshSimulator();
  const before = simulator.getProfile();
  storage.failWrites = true;
  rejects(() => simulator.defeatNormalEnemy(100), /injected storage failure/);
  same(simulator.getProfile(), before);
  storage.failWrites = false;
}

console.log(`Contract verification complete: ${assertionCount} assertions`);
