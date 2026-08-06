import { rewardCards } from '../src/bonpuri/content/cards';
import { MAX_ASCENSION } from '../src/bonpuri/content/ascension';
import { startMiniRun, playRunCard, endRunTurn, chooseReward, skipReward, type MiniRunState } from '../src/bonpuri/run/miniRun';
import type { Rng } from '../src/bonpuri/core/rng';
import type { BattleCard } from '../src/bonpuri/core/types';
import { miniRunEnemies } from '../src/bonpuri/content/enemies';

const MAX_BATTLE_TURNS = 50;
const MAX_ACTIONS_PER_BATTLE = 10_000;

const DECK_NAMES = ['기본덱', '무구악용', '회복지연', '세경연계', '문전좌정', '차사처형', '굿유틸', '최적화덱'] as const;
const PLAY_POLICIES = ['defensive', 'aggressive', 'random'] as const;
const REWARD_POLICIES = ['synergy', 'alwaysHeal'] as const;
const GRID_DAMAGE_MULTIPLIERS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6] as const;
const GRID_HP_MULTIPLIERS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2.0, 2.4] as const;

type DeckName = typeof DECK_NAMES[number];
type PlayPolicy = typeof PLAY_POLICIES[number];
type RewardPolicy = typeof REWARD_POLICIES[number];

type RunStatus = 'clear' | 'lost' | 'stalled';

type RunRecord = {
  status: RunStatus;
  finalHp: number;
  failureBattle: number | null;
  totalTurns: number;
  battles: number;
  artifactPlacements: number;
};

type DetailCollector = {
  cardUses: Map<string, number>;
  comboActivations: Map<string, number>;
};

type BondMeasurement = {
  histogram: number[];
  playedCards: number;
  battleMaxStacks: number[];
  totalBonus: number;
  damageBonus: number;
  blockBonus: number;
  damageBaseAmount: number;
};

type ComboMeasurement = {
  deckName: DeckName;
  playPolicy: PlayPolicy;
  rewardPolicy: RewardPolicy;
  seedCount: number;
  runs: RunRecord[];
  clearCount: number;
  stalledCount: number;
  lossByBattle: number[];
  totalTurns: number;
  totalBattles: number;
  artifactPlacements: number;
  detail?: DetailCollector;
  bond?: BondMeasurement;
};

type RunContext = {
  seed: number;
  playPolicy: PlayPolicy;
  detail?: DetailCollector;
  decisionCounter: number;
};

type Candidate = {
  index: number;
  card: BattleCard;
  after: MiniRunState;
  damage: number;
  resultingBlock: number;
  hasExecute: boolean;
  executeKills: boolean;
};

type BattleDriveResult = {
  state: MiniRunState;
  turns: number;
  stalled: boolean;
};

type CliOptions = {
  seeds: number;
  deckName?: DeckName;
  ascension: number;
  sweep?: { start: number; end: number };
  grid: boolean;
  bonds: boolean;
};

const SWEEP_DECK_NAMES: readonly DeckName[] = ['기본덱', '문전좌정', '차사처형'];
const GRID_DECK_NAMES: readonly DeckName[] = ['기본덱', '문전좌정', '차사처형', '최적화덱'];

type GridMultipliers = {
  enemyDamageMultiplier: number;
  enemyHpMultiplier: number;
};

const BOND_DECK_NAMES: readonly DeckName[] = ['차사처형', '문전좌정', '세경연계'];
const BOND_DIFFICULTIES: readonly GridMultipliers[] = [
  { enemyDamageMultiplier: 1.0, enemyHpMultiplier: 1.0 },
  { enemyDamageMultiplier: 1.3, enemyHpMultiplier: 1.3 },
  { enemyDamageMultiplier: 1.6, enemyHpMultiplier: 1.4 },
];

type GridRow = GridMultipliers & {
  measurements: ReadonlyMap<DeckName, ComboMeasurement>;
};

type BondRow = {
  deckName: DeckName;
  multipliers: GridMultipliers;
  measurement: ComboMeasurement;
};

function repeat(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

/**
 * The fixed five 사설 풀기 cards leave a non-multiple of nine in several presets.
 * Round the 5:4 split to the nearest integer and assign the remainder to 넋가림.
 */
function basicFill(total: number): string[] {
  const saseolCount = 5;
  const normalCount = total - saseolCount;
  const sinkalCount = Math.round(normalCount * 5 / 9);
  const neokgarimCount = normalCount - sinkalCount;
  return [
    ...repeat('sinkal', sinkalCount),
    ...repeat('neokgarim', neokgarimCount),
    ...repeat('saseol', saseolCount),
  ];
}

function makeDeck(specials: readonly string[], basicCount: number): string[] {
  return [...specials.flatMap((id) => repeat(id, 4)), ...basicFill(basicCount)];
}

const DECK_PRESETS: Record<DeckName, string[]> = {
  기본덱: basicFill(50),
  무구악용: makeDeck(['sanpan', 'yoryeong', 'sinmaengdu', 'myeongdu', 'mulsaek'], 30),
  회복지연: makeDeck(['jowangsin', 'simbangkwaeja', 'teojusin', 'samseunghalmang'], 34),
  세경연계: makeDeck(['jacheongbi', 'mundoryeong', 'jeongsunam'], 38),
  문전좌정: makeDeck(['munjeonsin', 'nokdisaengin', 'jowangsin', 'namseonbi', 'yeosanbuin'], 30),
  차사처형: makeDeck(['gangnimchasa', 'iljikchasa', 'woljikchasa', 'jeoseungsaja'], 34),
  굿유틸: makeDeck(['yeongdeunggut', 'siwangmaji', 'seongjupuri', 'chogamje'], 34),
  최적화덱: [
    ...repeat('jowangsin', 4),
    ...repeat('munjeonsin', 4),
    ...repeat('sanpan', 4),
    ...repeat('yoryeong', 4),
    ...repeat('sinmaengdu', 4),
    ...repeat('samseunghalmang', 4),
    ...repeat('nokdisaengin', 4),
    ...repeat('yeosanbuin', 4),
    ...repeat('gangnimchasa', 4),
    ...repeat('sinkal', 8),
    ...repeat('neokgarim', 4),
    ...repeat('saseol', 2),
  ],
};

const REWARD_IDS = new Set(rewardCards.map((card) => card.id));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function mixSeed(...values: number[]): number {
  let value = 0x9e3779b9;
  for (const input of values) {
    value ^= input >>> 0;
    value = Math.imul(value, 0x85ebca6b) >>> 0;
    value ^= value >>> 13;
  }
  return value >>> 0;
}

function probeRng(context: RunContext, cardIndex: number, purpose: number): Rng {
  return seeded(mixSeed(context.seed, context.decisionCounter, cardIndex, purpose));
}

function battleOf(state: MiniRunState) {
  assert(state.battle, 'run state must have a battle state');
  return state.battle;
}

function liveEnemy(state: MiniRunState) {
  return battleOf(state).enemies.find((enemy) => enemy.hp > 0);
}

function totalEnemyHp(state: MiniRunState): number {
  return state.battle?.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0) ?? 0;
}

function expectedEnemyDamage(state: MiniRunState): number {
  const enemy = liveEnemy(state);
  if (!enemy || enemy.intents.length === 0) return 0;
  const intent = enemy.intents[enemy.intentIndex % enemy.intents.length];
  return intent.kind === 'attack' ? intent.amount : 0;
}

function applyGridMultipliers(state: MiniRunState, multipliers: GridMultipliers): MiniRunState {
  if (!state.battle) return state;
  return {
    ...state,
    battle: {
      ...state.battle,
      enemies: state.battle.enemies.map((enemy) => ({
        ...enemy,
        hp: Math.floor(enemy.hp * multipliers.enemyHpMultiplier),
        maxHp: Math.floor(enemy.maxHp * multipliers.enemyHpMultiplier),
        intents: enemy.intents.map((intent) => intent.kind === 'attack'
          ? { ...intent, amount: Math.floor(intent.amount * multipliers.enemyDamageMultiplier) }
          : { ...intent }),
      })),
    },
  };
}

function playableIndexes(state: MiniRunState): number[] {
  const battle = battleOf(state);
  return battle.hand.flatMap((card, index) => {
    const actualCost = Math.max(0, card.cost - battle.costReduction);
    const playable = actualCost <= battle.energy && !(card.cardType === '굿' && battle.gutPlayedThisTurn);
    return playable ? [index] : [];
  });
}

function evaluateCandidates(
  state: MiniRunState,
  indexes: readonly number[],
  context: RunContext,
): Candidate[] {
  const beforeHp = totalEnemyHp(state);
  return indexes.map((index) => {
    const card = battleOf(state).hand[index];
    const after = playRunCard(state, index, probeRng(context, index, 1));
    const targetAfter = liveEnemy(after);
    const hasExecute = card.effects.some((effect) => effect.kind === 'execute');
    const executeKills = hasExecute && (!targetAfter || targetAfter.hp <= 0);
    return {
      index,
      card,
      after,
      damage: beforeHp - totalEnemyHp(after),
      resultingBlock: after.battle?.player.block ?? 0,
      hasExecute,
      executeKills,
    };
  });
}

function hasEffectKind(card: BattleCard, kinds: readonly string[]): boolean {
  return card.effects.some((effect) => kinds.includes(effect.kind));
}

function candidateIndexesForPolicy(
  state: MiniRunState,
  indexes: readonly number[],
  policy: PlayPolicy,
): number[] {
  const cards = battleOf(state).hand;
  const immediateDamage = indexes.filter((index) =>
    hasEffectKind(cards[index], ['damage', 'execute', 'blockToDamage']),
  );
  if (policy === 'aggressive') return immediateDamage.length > 0 ? immediateDamage : [...indexes];

  const defensiveEffects = indexes.filter((index) =>
    hasEffectKind(cards[index], ['block', 'damage', 'execute', 'blockToDamage', 'heal', 'cancelIntent', 'cleanse']),
  );
  return defensiveEffects.length > 0 ? defensiveEffects : [...indexes];
}

function chooseMaxDamage(candidates: readonly Candidate[]): Candidate {
  assert(candidates.length > 0, 'candidate list must not be empty');
  return candidates.reduce((best, candidate) => candidate.damage > best.damage ? candidate : best);
}

function chooseDefensiveCandidate(
  state: MiniRunState,
  candidates: readonly Candidate[],
): Candidate {
  const battle = battleOf(state);
  const expectedDamage = expectedEnemyDamage(state);
  if (expectedDamage <= battle.player.block) return chooseMaxDamage(candidates);

  const adequate = candidates.filter((candidate) => {
    if (candidate.after.phase === 'won' || candidate.after.phase === 'reward') return true;
    return candidate.resultingBlock >= expectedDamage;
  });
  if (adequate.length > 0) return chooseMaxDamage(adequate);

  // If one card cannot cover the intent, stack the largest block first and
  // re-evaluate on the next action. Damage breaks equal-block ties.
  return candidates.reduce((best, candidate) => {
    if (candidate.resultingBlock !== best.resultingBlock) {
      return candidate.resultingBlock > best.resultingBlock ? candidate : best;
    }
    return candidate.damage > best.damage ? candidate : best;
  });
}

function chooseCard(
  state: MiniRunState,
  context: RunContext,
  rng: Rng,
): number | undefined {
  context.decisionCounter += 1;
  const battle = battleOf(state);
  const indexes = playableIndexes(state);
  if (indexes.length === 0) return undefined;

  const zeroCost = indexes.filter((index) => battle.hand[index].cost === 0);
  if (zeroCost.length > 0) {
    return context.playPolicy === 'random'
      ? zeroCost[Math.floor(rng() * zeroCost.length)]
      : zeroCost[0];
  }

  // Forced immediate installation is shared by all policies. Multiple eligible
  // cards use hand order as the deterministic tie-break.
  const equipment = indexes.find((index) => {
    const type = battle.hand[index].cardType;
    return type === '무구' || type === '좌정';
  });
  if (equipment !== undefined) return equipment;

  if (context.playPolicy === 'random') {
    return indexes[Math.floor(rng() * indexes.length)];
  }

  const expectedDamage = expectedEnemyDamage(state);
  const candidates = evaluateCandidates(
    state,
    candidateIndexesForPolicy(state, indexes, context.playPolicy),
    context,
  );

  if (context.playPolicy === 'defensive') {
    const executable = candidates.filter((candidate) => candidate.hasExecute && candidate.executeKills);
    if (executable.length > 0) return chooseMaxDamage(executable).index;
    return chooseDefensiveCandidate(state, candidates).index;
  }
  return chooseMaxDamage(candidates).index;
}

function chooseSynergyReward(state: MiniRunState): number {
  const groups = new Set(state.deck.map((card) => card.bondGroup).filter((group): group is string => Boolean(group)));
  const index = state.rewards.findIndex((card) => card.bondGroup && groups.has(card.bondGroup));
  return index >= 0 ? index : 0;
}

function recordBondPlay(measurement: BondMeasurement, card: BattleCard, stacks: number): void {
  const bond = card.bond;
  assert(bond, `bond measurement requires a bond card: ${card.name}`);
  const bucket = Math.min(stacks, 6);
  measurement.histogram[bucket] += 1;
  measurement.playedCards += 1;

  const bonus = bond.perStack * stacks;
  measurement.totalBonus += bonus;
  if (bond.applyTo === 'damage') {
    measurement.damageBonus += bonus;
    for (const effect of card.effects) {
      if (effect.kind === 'damage' || effect.kind === 'execute') {
        measurement.damageBaseAmount += effect.amount;
        break;
      }
    }
  } else {
    measurement.blockBonus += bonus;
  }
}

function driveBattle(
  initial: MiniRunState,
  context: RunContext,
  rng: Rng,
  measurement: ComboMeasurement,
): BattleDriveResult {
  let state = initial;
  let actionCount = 0;
  let maximumBondStack = 0;
  const finish = (result: BattleDriveResult): BattleDriveResult => {
    measurement.bond?.battleMaxStacks.push(maximumBondStack);
    return result;
  };

  while (state.phase === 'battle') {
    const battle = battleOf(state);
    if (battle.turn > MAX_BATTLE_TURNS) {
      return finish({ state, turns: battle.turn, stalled: true });
    }
    if (actionCount >= MAX_ACTIONS_PER_BATTLE) {
      throw new Error(`battle exceeded ${MAX_ACTIONS_PER_BATTLE} actions at turn ${battle.turn}`);
    }

    const index = chooseCard(state, context, rng);
    if (index === undefined) {
      state = endRunTurn(state, rng);
      actionCount += 1;
      continue;
    }

    const card = battle.hand[index];
    const priorBondStacks = card.bondGroup ? battle.playedMyths[card.bondGroup] ?? 0 : 0;
    const next = playRunCard(state, index, rng);
    const played = next.phase !== 'battle' || !next.battle?.hand.some((candidate) => candidate.id === card.id);
    if (!played) {
      // A policy candidate must be playable. Fail closed to avoid hiding a
      // selection bug behind an infinite loop.
      state = endRunTurn(state, rng);
      actionCount += 1;
      continue;
    }
    if (measurement.bond && card.bond) {
      recordBondPlay(measurement.bond, card, priorBondStacks);
      maximumBondStack = Math.max(maximumBondStack, priorBondStacks);
    }
    if (context.detail) {
      context.detail.cardUses.set(card.name, (context.detail.cardUses.get(card.name) ?? 0) + 1);
      if (card.bondGroup && priorBondStacks > 0) {
        context.detail.comboActivations.set(
          card.bondGroup,
          (context.detail.comboActivations.get(card.bondGroup) ?? 0) + 1,
        );
      }
    }
    state = next;
    actionCount += 1;
  }

  const turns = state.battle?.turn ?? 0;
  return finish({ state, turns, stalled: false });
}

function simulateRun(
  deckName: DeckName,
  playPolicy: PlayPolicy,
  rewardPolicy: RewardPolicy,
  seed: number,
  measurement: ComboMeasurement,
  ascension: number,
  gridMultipliers?: GridMultipliers,
): RunRecord {
  const rng = seeded(seed);
  const detail = measurement.detail;
  const context: RunContext = { seed, playPolicy, detail, decisionCounter: 0 };
  let state = startMiniRun(rng, DECK_PRESETS[deckName], ascension);
  if (gridMultipliers) state = applyGridMultipliers(state, gridMultipliers);
  let totalTurns = 0;
  let battles = 0;
  let artifactPlacements = 0;

  while (state.phase !== 'won' && state.phase !== 'lost') {
    if (state.phase === 'battle') {
      const result = driveBattle(state, context, rng, measurement);
      state = result.state;
      battles += 1;
      totalTurns += result.turns;
      artifactPlacements += state.battle?.equipped.length ?? 0;
      if (result.stalled) {
        return { status: 'stalled', finalHp: state.playerHp, failureBattle: state.battleNumber, totalTurns, battles, artifactPlacements };
      }
      continue;
    }

    if (state.phase === 'reward') {
      const nextState = rewardPolicy === 'alwaysHeal'
        ? skipReward(state, rng)
        : chooseReward(state, chooseSynergyReward(state), rng);
      state = gridMultipliers ? applyGridMultipliers(nextState, gridMultipliers) : nextState;
    }
  }

  const status: RunStatus = state.phase === 'won' ? 'clear' : 'lost';
  const failureBattle = status === 'lost' ? state.battleNumber : null;
  return { status, finalHp: state.playerHp, failureBattle, totalTurns, battles, artifactPlacements };
}

function simulateCombo(
  deckName: DeckName,
  playPolicy: PlayPolicy,
  rewardPolicy: RewardPolicy,
  seeds: readonly number[],
  collectDetails: boolean,
  ascension = 0,
  gridMultipliers?: GridMultipliers,
  collectBonds = false,
): ComboMeasurement {
  const detail = collectDetails ? { cardUses: new Map<string, number>(), comboActivations: new Map<string, number>() } : undefined;
  const measurement: ComboMeasurement = {
    deckName,
    playPolicy,
    rewardPolicy,
    seedCount: seeds.length,
    runs: [],
    clearCount: 0,
    stalledCount: 0,
    lossByBattle: [0, 0, 0, 0, 0],
    totalTurns: 0,
    totalBattles: 0,
    artifactPlacements: 0,
    detail,
    ...(collectBonds ? {
      bond: {
        histogram: Array.from({ length: 7 }, () => 0),
        playedCards: 0,
        battleMaxStacks: [],
        totalBonus: 0,
        damageBonus: 0,
        blockBonus: 0,
        damageBaseAmount: 0,
      },
    } : {}),
  };

  for (const seed of seeds) {
    const run = simulateRun(deckName, playPolicy, rewardPolicy, seed, measurement, ascension, gridMultipliers);
    measurement.runs.push(run);
    measurement.clearCount += run.status === 'clear' ? 1 : 0;
    measurement.stalledCount += run.status === 'stalled' ? 1 : 0;
    if (run.failureBattle !== null) measurement.lossByBattle[run.failureBattle - 1] += 1;
    measurement.totalTurns += run.totalTurns;
    measurement.totalBattles += run.battles;
    measurement.artifactPlacements += run.artifactPlacements;
  }
  return measurement;
}

function median(values: readonly number[]): string {
  if (values.length === 0) return '-';
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const result = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return result.toFixed(1);
}

function percent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function comboKey(deckName: DeckName, playPolicy: PlayPolicy, rewardPolicy: RewardPolicy): string {
  return `${deckName}/${playPolicy}/${rewardPolicy}`;
}

function formatLossPoint(measurement: ComboMeasurement): string {
  return measurement.lossByBattle.map((count, index) => `${index + 1}:${percent(count, measurement.seedCount)}`).join(' ');
}

function formatMeasurement(measurement: ComboMeasurement): string {
  const clearHp = measurement.runs.filter((run) => run.status === 'clear').map((run) => run.finalHp);
  const averageTurns = measurement.totalBattles === 0 ? 0 : measurement.totalTurns / measurement.totalBattles;
  return [
    measurement.deckName,
    measurement.playPolicy,
    measurement.rewardPolicy,
    percent(measurement.clearCount, measurement.seedCount),
    median(clearHp),
    formatLossPoint(measurement),
    averageTurns.toFixed(2),
    percent(measurement.stalledCount, measurement.seedCount),
  ].join(' | ');
}

function validatePresets(): void {
  for (const deckName of DECK_NAMES) {
    const deck = DECK_PRESETS[deckName];
    assert(deck.length === 50, `${deckName} must contain exactly 50 cards, got ${deck.length}`);
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      if (REWARD_IDS.has(id)) assert(count <= 4, `${deckName} has ${count} copies of reward card ${id}`);
    }
  }
}

function validateDeterminism(): void {
  const seeds = [137];
  const first = simulateCombo('기본덱', 'defensive', 'synergy', seeds, true);
  const second = simulateCombo('기본덱', 'defensive', 'synergy', seeds, true);
  assert(JSON.stringify(first) === JSON.stringify(second), 'same seed and combination produced different results');
}

function validateNoMathRandom(): void {
  const math = globalThis.Math as { random: () => number };
  const randomKey = 'random';
  const original = math[randomKey];
  try {
    math[randomKey] = () => { throw new Error('default random API was called'); };
    simulateCombo('기본덱', 'defensive', 'synergy', [271], false);
  } finally {
    math[randomKey] = original;
  }
}

function validateOptimizationDeck(): void {
  const deck = DECK_PRESETS['최적화덱'];
  assert(deck.length === 50, `최적화덱 must contain exactly 50 cards, got ${deck.length}`);
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (REWARD_IDS.has(id)) assert(count <= 4, `최적화덱 has ${count} copies of reward card ${id}`);
  }
}

function validateGridBaseline(): void {
  const seeds = [137, 271];
  const baseline = simulateCombo('기본덱', 'defensive', 'alwaysHeal', seeds, false);
  const grid = simulateCombo('기본덱', 'defensive', 'alwaysHeal', seeds, false, 0, {
    enemyDamageMultiplier: 1.0,
    enemyHpMultiplier: 1.0,
  });
  assert(JSON.stringify(baseline) === JSON.stringify(grid), 'grid 1.0/1.0 differs from the no-grid baseline');
}

function validateGridEnemySourceImmutable(): void {
  const before = JSON.stringify(miniRunEnemies);
  simulateCombo('기본덱', 'defensive', 'alwaysHeal', [271], false, 0, {
    enemyDamageMultiplier: 1.6,
    enemyHpMultiplier: 1.4,
  });
  assert(JSON.stringify(miniRunEnemies) === before, 'grid execution mutated content/enemies.ts source data');
}

function runGridSelfChecks(): void {
  validateOptimizationDeck();
  console.log('그리드 자가검증 1/3 PASS: 최적화덱 50장, 보상 카드 최대 4장');
  validateGridBaseline();
  console.log('그리드 자가검증 2/3 PASS: 1.0/1.0 셀이 --grid 없는 기준선과 동일');
  validateGridEnemySourceImmutable();
  console.log('그리드 자가검증 3/3 PASS: 그리드 실행 후 content/enemies.ts 원본 불변');
}

function runSelfChecks(): void {
  validatePresets();
  console.log('자가검증 1/3 PASS: 모든 덱 프리셋 50장, 보상 카드 최대 4장');
  validateDeterminism();
  console.log('자가검증 2/3 PASS: 동일 시드·조합 결과 동일');
  validateNoMathRandom();
  console.log('자가검증 3/3 PASS: 엔진 호출 중 기본 난수 API 미사용');
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed > 0, `${label} must be a positive integer`);
  return parsed;
}

function parseAscension(value: string, label: string): number {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_ASCENSION,
    `${label} must be an integer between 0 and ${MAX_ASCENSION}`);
  return parsed;
}

function parseSweep(value: string): { start: number; end: number } {
  const match = /^(\d+)-(\d+)$/.exec(value);
  assert(match !== null, '--sweep must use START-END format');
  const start = parseAscension(match[1], '--sweep start');
  const end = parseAscension(match[2], '--sweep end');
  assert(start <= end, '--sweep start must not exceed end');
  return { start, end };
}

function parseOptions(argv: readonly string[]): CliOptions {
  let seeds = 500;
  let deckName: DeckName | undefined;
  let ascension = 0;
  let sweep: { start: number; end: number } | undefined;
  let grid = false;
  let bonds = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--seeds') {
      seeds = parsePositiveInteger(argv[index + 1] ?? '', '--seeds');
      index += 1;
    } else if (argument.startsWith('--seeds=')) {
      seeds = parsePositiveInteger(argument.slice('--seeds='.length), '--seeds');
    } else if (argument === '--deck') {
      const candidate = argv[index + 1] as DeckName | undefined;
      assert(candidate && DECK_NAMES.includes(candidate), `unknown deck: ${candidate ?? ''}`);
      deckName = candidate;
      index += 1;
    } else if (argument.startsWith('--deck=')) {
      const candidate = argument.slice('--deck='.length) as DeckName;
      assert(DECK_NAMES.includes(candidate), `unknown deck: ${candidate}`);
      deckName = candidate;
    } else if (argument === '--ascension') {
      ascension = parseAscension(argv[index + 1] ?? '', '--ascension');
      index += 1;
    } else if (argument.startsWith('--ascension=')) {
      ascension = parseAscension(argument.slice('--ascension='.length), '--ascension');
    } else if (argument === '--sweep') {
      sweep = parseSweep(argv[index + 1] ?? '');
      index += 1;
    } else if (argument.startsWith('--sweep=')) {
      sweep = parseSweep(argument.slice('--sweep='.length));
    } else if (argument === '--grid') {
      grid = true;
    } else if (argument === '--bonds') {
      bonds = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  assert(!(grid && sweep), '--grid cannot be combined with --sweep');
  assert(!(bonds && (grid || sweep)), '--bonds cannot be combined with --grid or --sweep');
  return { seeds, deckName, ascension, sweep, grid, bonds };
}

function clearRate(measurement: ComboMeasurement): number {
  return measurement.clearCount / measurement.seedCount;
}

function medianClearHp(measurement: ComboMeasurement): string {
  return median(measurement.runs.filter((run) => run.status === 'clear').map((run) => run.finalHp));
}

function printAscensionSweep(seeds: readonly number[], range: { start: number; end: number }): void {
  console.log(`\n## §5.2 승천 스윕 (seeds=${seeds.length}, range=${range.start}-${range.end})`);
  console.log('| 승천 | 덱 | 카드선택 | 정화 | 정화 잔여명 | 보스 패배율 |');
  console.log('| ---: | --- | ---: | ---: | ---: | ---: |');

  const rows = new Map<string, ComboMeasurement>();
  for (let ascension = range.start; ascension <= range.end; ascension += 1) {
    for (const deckName of SWEEP_DECK_NAMES) {
      const cardSelection = simulateCombo(deckName, 'defensive', 'synergy', seeds, false, ascension);
      const purify = simulateCombo(deckName, 'defensive', 'alwaysHeal', seeds, false, ascension);
      rows.set(`${ascension}/${deckName}`, purify);
      console.log(`| ${ascension} | ${deckName} | ${percent(cardSelection.clearCount, cardSelection.seedCount)} | ${percent(purify.clearCount, purify.seedCount)} | ${medianClearHp(purify)} | ${percent(purify.lossByBattle[4], purify.seedCount)} |`);
    }
  }

  const target = (deckName: DeckName): string => {
    for (let ascension = range.start; ascension <= range.end; ascension += 1) {
      const measurement = rows.get(`${ascension}/${deckName}`);
      if (measurement && clearRate(measurement) >= 0.70 && clearRate(measurement) <= 0.80) return String(ascension);
    }
    return '없음(범위 밖)';
  };
  console.log(`목표(정화 기준 클리어율 70~80%)에 해당하는 승천: 기본덱 ${target('기본덱')} / 문전좌정 ${target('문전좌정')} / 차사처형 ${target('차사처형')}`);
}

function formatMultiplier(value: number): string {
  return value.toFixed(1);
}

function printDifficultyGrid(seeds: readonly number[]): void {
  const rows: GridRow[] = [];
  for (const enemyDamageMultiplier of GRID_DAMAGE_MULTIPLIERS) {
    for (const enemyHpMultiplier of GRID_HP_MULTIPLIERS) {
      const measurements = new Map<DeckName, ComboMeasurement>();
      for (const deckName of GRID_DECK_NAMES) {
        measurements.set(deckName, simulateCombo(
          deckName,
          'defensive',
          'alwaysHeal',
          seeds,
          false,
          0,
          { enemyDamageMultiplier, enemyHpMultiplier },
        ));
      }
      rows.push({ enemyDamageMultiplier, enemyHpMultiplier, measurements });
    }
  }

  console.log(`\n## 난이도 그리드 (seeds=${seeds.length}, defensive + 정화)`);
  console.log('| 피해배율 | 명배율 | 기본덱 | 문전좌정 | 차사처형 | 최적화덱 |');
  console.log('| ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    const values = GRID_DECK_NAMES.map((deckName) => {
      const measurement = row.measurements.get(deckName);
      assert(measurement, `missing grid measurement for ${deckName}`);
      return percent(measurement.clearCount, measurement.seedCount);
    });
    console.log(`| ${formatMultiplier(row.enemyDamageMultiplier)} | ${formatMultiplier(row.enemyHpMultiplier)} | ${values.join(' | ')} |`);
  }

  const targetSummary = (deckName: DeckName, lowerBound: number, upperBound: number): string => {
    const matches = rows.filter((row) => {
      const measurement = row.measurements.get(deckName);
      assert(measurement, `missing grid measurement for ${deckName}`);
      const rate = clearRate(measurement);
      return rate >= lowerBound && rate <= upperBound;
    });
    if (matches.length > 0) {
      return matches
        .map((row) => `(${formatMultiplier(row.enemyDamageMultiplier)}, ${formatMultiplier(row.enemyHpMultiplier)})`)
        .join(', ');
    }

    const closest = rows.reduce((best, row) => {
      const measurement = row.measurements.get(deckName);
      assert(measurement, `missing grid measurement for ${deckName}`);
      const rate = clearRate(measurement);
      const distance = rate < lowerBound ? lowerBound - rate : rate > upperBound ? rate - upperBound : 0;
      if (!best || distance < best.distance) return { row, measurement, distance };
      return best;
    }, undefined as { row: GridRow; measurement: ComboMeasurement; distance: number } | undefined);
    assert(closest, `no grid measurements for ${deckName}`);
    return `없음(범위 밖); 가장 가까운 조합: (${formatMultiplier(closest.row.enemyDamageMultiplier)}, ${formatMultiplier(closest.row.enemyHpMultiplier)})=${percent(closest.measurement.clearCount, closest.measurement.seedCount)}`;
  };

  console.log(`기본덱 70~80% 구간: ${targetSummary('기본덱', 0.70, 0.80)}`);
  console.log(`최적화덱 20~30% 구간: ${targetSummary('최적화덱', 0.20, 0.30)}`);
}

function bondMeasurementOf(measurement: ComboMeasurement): BondMeasurement {
  assert(measurement.bond, `missing bond measurement for ${measurement.deckName}`);
  return measurement.bond;
}

function bondDifficultyLabel(multipliers: GridMultipliers): string {
  return `${formatMultiplier(multipliers.enemyDamageMultiplier)}/${formatMultiplier(multipliers.enemyHpMultiplier)}`;
}

function bondPercentValue(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(1));
}

function formatBondPercent(value: number, total: number): string {
  return `${bondPercentValue(value, total).toFixed(1)}%`;
}

function collectBondRows(seeds: readonly number[]): BondRow[] {
  const rows: BondRow[] = [];
  for (const deckName of BOND_DECK_NAMES) {
    for (const multipliers of BOND_DIFFICULTIES) {
      rows.push({
        deckName,
        multipliers,
        measurement: simulateCombo(
          deckName,
          'defensive',
          'alwaysHeal',
          seeds,
          false,
          0,
          multipliers,
          true,
        ),
      });
    }
  }
  return rows;
}

function validateBondDeterminism(): void {
  const multipliers = BOND_DIFFICULTIES[0];
  const first = simulateCombo('차사처형', 'defensive', 'alwaysHeal', [137], false, 0, multipliers, true);
  const second = simulateCombo('차사처형', 'defensive', 'alwaysHeal', [137], false, 0, multipliers, true);
  assert(JSON.stringify(first) === JSON.stringify(second), 'same seed produced different bond measurements');
}

function validateBondHistogramRows(rows: readonly BondRow[]): void {
  for (const row of rows) {
    const bond = bondMeasurementOf(row.measurement);
    assert(bond.histogram.length === 7,
      `${row.deckName} ${bondDifficultyLabel(row.multipliers)} must have seven histogram buckets`);
    assert(bond.playedCards > 0,
      `${row.deckName} ${bondDifficultyLabel(row.multipliers)} played no bond cards`);
    assert(bond.histogram.reduce((sum, count) => sum + count, 0) === bond.playedCards,
      `${row.deckName} ${bondDifficultyLabel(row.multipliers)} histogram count mismatch`);
    assert(bond.battleMaxStacks.length === row.measurement.totalBattles,
      `${row.deckName} ${bondDifficultyLabel(row.multipliers)} battle maximum count mismatch`);
    const displayedTotal = bond.histogram.reduce(
      (sum, count) => sum + bondPercentValue(count, bond.playedCards),
      0,
    );
    assert(Math.abs(displayedTotal - 100) <= 0.5 + 1e-9,
      `${row.deckName} ${bondDifficultyLabel(row.multipliers)} rounded histogram totals ${displayedTotal.toFixed(1)}%`);
  }
}

function runBondSelfChecks(
  rows: readonly BondRow[],
  rewardCardsBefore: string,
  miniRunEnemiesBefore: string,
): void {
  validateBondDeterminism();
  console.log('연계 자가검증 1/3 PASS: 동일 시드 2회 실행 결과 동일');
  validateBondHistogramRows(rows);
  console.log('연계 자가검증 2/3 PASS: 모든 히스토그램 행의 반올림 비율 합 100% (±0.5%p)');
  assert(JSON.stringify(rewardCards) === rewardCardsBefore,
    'bond execution mutated content/cards.ts source data');
  assert(JSON.stringify(miniRunEnemies) === miniRunEnemiesBefore,
    'bond execution mutated content/enemies.ts source data');
  console.log('연계 자가검증 3/3 PASS: rewardCards·miniRunEnemies 직렬화 원본 불변');
}

function findBondRow(
  rows: readonly BondRow[],
  deckName: DeckName,
  multipliers: GridMultipliers,
): BondRow {
  const row = rows.find((candidate) => candidate.deckName === deckName &&
    candidate.multipliers.enemyDamageMultiplier === multipliers.enemyDamageMultiplier &&
    candidate.multipliers.enemyHpMultiplier === multipliers.enemyHpMultiplier);
  assert(row, `missing bond row for ${deckName} ${bondDifficultyLabel(multipliers)}`);
  return row;
}

function printBondAnalysis(seeds: readonly number[]): void {
  const rewardCardsBefore = JSON.stringify(rewardCards);
  const miniRunEnemiesBefore = JSON.stringify(miniRunEnemies);
  const rows = collectBondRows(seeds);
  runBondSelfChecks(rows, rewardCardsBefore, miniRunEnemiesBefore);

  console.log(`\n## §4.1 연계 스택 히스토그램 (seeds=${seeds.length}, defensive + 정화)`);
  console.log('| 덱 | 난이도 | 0스택 | 1 | 2 | 3 | 4 | 5 | 6+ | 낸 bond 카드 수 |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    const bond = bondMeasurementOf(row.measurement);
    const buckets = bond.histogram.map((count) => formatBondPercent(count, bond.playedCards));
    console.log(`| ${row.deckName} | ${bondDifficultyLabel(row.multipliers)} | ${buckets.join(' | ')} | ${bond.playedCards} |`);
  }

  console.log('\n## §4.2 스택 요약과 보너스 기여');
  console.log('| 덱 | 난이도 | 전투당 최대 스택(중앙값) | 평균 전투 턴 | bond 보너스 총량(런 평균) | 총 피해 중 보너스 비중 |');
  console.log('| --- | --- | ---: | ---: | --- | ---: |');
  for (const row of rows) {
    const measurement = row.measurement;
    const bond = bondMeasurementOf(measurement);
    const averageTurns = measurement.totalBattles === 0 ? 0 : measurement.totalTurns / measurement.totalBattles;
    const averageTotalBonus = bond.totalBonus / measurement.seedCount;
    const averageDamageBonus = bond.damageBonus / measurement.seedCount;
    const averageBlockBonus = bond.blockBonus / measurement.seedCount;
    const damageDenominator = bond.damageBaseAmount + bond.damageBonus;
    console.log(`| ${row.deckName} | ${bondDifficultyLabel(row.multipliers)} | ${median(bond.battleMaxStacks)} | ${averageTurns.toFixed(2)} | ${averageTotalBonus.toFixed(2)} (피해 ${averageDamageBonus.toFixed(2)} / 방어 ${averageBlockBonus.toFixed(2)}) | ${formatBondPercent(bond.damageBonus, damageDenominator)} |`);
  }
  console.log('※ 총 피해 중 보너스 비중은 damage bond 카드의 첫 damage/execute 원본 amount 합 + damage 보너스로 근사하며, 무연계 카드 피해는 제외한다.');

  const baseline = BOND_DIFFICULTIES[0];
  const hardest = BOND_DIFFICULTIES[BOND_DIFFICULTIES.length - 1];
  const stackFourRatio = (deckName: DeckName): string => {
    const bond = bondMeasurementOf(findBondRow(rows, deckName, baseline).measurement);
    const count = bond.histogram.slice(4).reduce((sum, value) => sum + value, 0);
    return formatBondPercent(count, bond.playedCards);
  };
  const maximumChange = (deckName: DeckName): string => {
    const initial = bondMeasurementOf(findBondRow(rows, deckName, baseline).measurement);
    const final = bondMeasurementOf(findBondRow(rows, deckName, hardest).measurement);
    return `${median(initial.battleMaxStacks)}→${median(final.battleMaxStacks)}`;
  };

  console.log('\n## §4.3 판정 보조');
  console.log(`스택 4 이상에서 낸 bond 카드 비율: 차사처형 ${stackFourRatio('차사처형')} / 문전좌정 ${stackFourRatio('문전좌정')} / 세경연계 ${stackFourRatio('세경연계')}   (1.0/1.0 기준)`);
  console.log(`난이도 상승 시 최대 스택 변화: 차사처형 ${maximumChange('차사처형')}, 문전좌정 ${maximumChange('문전좌정')}, 세경연계 ${maximumChange('세경연계')}   (1.0/1.0 → 1.6/1.4)`);
}

function printAdditionalAggregates(
  measurements: readonly ComboMeasurement[],
  byKey: ReadonlyMap<string, ComboMeasurement>,
): void {
  console.log('\n## §7.2 추가 집계');
  const baseline = byKey.get(comboKey('기본덱', 'defensive', 'synergy'));
  if (!baseline?.detail) {
    console.log('기본덱/defensive/synergy: 미실행');
  } else {
    const combos = [...baseline.detail.comboActivations.entries()]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([group, count]) => `${group}=${count}`);
    console.log(`연계 발동 횟수 (스택 1 이상 카드): ${combos.length > 0 ? combos.join(', ') : '없음'}`);
    const topCards = [...baseline.detail.cardUses.entries()]
      .sort(([leftName, leftCount], [rightName, rightCount]) => {
        if (leftCount !== rightCount) return rightCount - leftCount;
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      })
      .slice(0, 15)
      .map(([name, count]) => `${name}=${count}`);
    console.log(`카드별 사용 횟수 상위 15: ${topCards.length > 0 ? topCards.join(', ') : '없음'}`);
  }

  const artifactMeasurements = measurements.filter((measurement) => measurement.deckName === '무구악용');
  if (artifactMeasurements.length === 0) {
    console.log('무구악용 무구 평균 장착 수: 미실행');
  } else {
    const artifactRows = artifactMeasurements.map((measurement) => {
      const average = measurement.artifactPlacements / measurement.seedCount;
      return `${measurement.playPolicy}/${measurement.rewardPolicy}=${average.toFixed(2)}`;
    });
    console.log(`무구악용 무구 평균 장착 수 (런 전체 실제 장착 횟수): ${artifactRows.join(', ')}`);
  }
}

function main(argv: readonly string[]): void {
  const options = parseOptions(argv);
  runSelfChecks();

  const seeds = Array.from({ length: options.seeds }, (_, index) => index + 1);
  if (options.bonds) {
    printBondAnalysis(seeds);
    return;
  }
  if (options.grid) {
    runGridSelfChecks();
    printDifficultyGrid(seeds);
    return;
  }
  if (options.sweep) {
    printAscensionSweep(seeds, options.sweep);
    return;
  }
  const deckNames = options.deckName ? [options.deckName] : [...DECK_NAMES];
  const measurements: ComboMeasurement[] = [];
  const byKey = new Map<string, ComboMeasurement>();
  const baselineKey = comboKey('기본덱', 'defensive', 'synergy');

  for (const deckName of deckNames) {
    for (const playPolicy of PLAY_POLICIES) {
      for (const rewardPolicy of REWARD_POLICIES) {
        const key = comboKey(deckName, playPolicy, rewardPolicy);
        const measurement = simulateCombo(deckName, playPolicy, rewardPolicy, seeds, key === baselineKey, options.ascension);
        measurements.push(measurement);
        byKey.set(key, measurement);
      }
    }
  }

  const ascensionLabel = options.ascension === 0 ? '' : `, ascension=${options.ascension}`;
  console.log(`\n## §7.1 조합별 요약 (seeds=${options.seeds}${ascensionLabel})`);
  console.log('| 덱 | 사용정책 | 보상정책 | 클리어율 | 잔여 명 중앙값 | 패배 지점(1~5) | 평균 턴 | stalled |');
  console.log('| --- | --- | --- | ---: | ---: | --- | ---: | ---: |');
  for (const measurement of measurements) console.log(`| ${formatMeasurement(measurement)} |`);
  printAdditionalAggregates(measurements, byKey);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
