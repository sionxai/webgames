import { endTurn, playCard, startBattle } from '../core/battle';
import { createStartingDeck } from '../core/cards';
import type { Rng } from '../core/rng';
import type { BattleCard, BattleState, Enemy } from '../core/types';
import { cloneRewardCard, rewardCards } from '../content/cards';
import { miniRunEnemies } from '../content/enemies';
import { getAscensionModifier } from '../content/ascension';

export type RunPhase = 'battle' | 'reward' | 'won' | 'lost';

export type RemovalSummary = {
  id: string;
  name: string;
  count: number;
};

export type RewardPreview = {
  deckSize: number;
  cardRemovals: RemovalSummary[];
  cleanseRemovals: RemovalSummary[];
};

export type RewardOffer = BattleCard & { rewardPreview?: RewardPreview };

export type MiniRunState = {
  phase: RunPhase;
  battleNumber: number;
  ascension: number;
  playerHp: number;
  deck: BattleCard[];
  battle: BattleState | null;
  rewards: RewardOffer[];
  nextSerial: number;
  acquiredCardIds: string[];
};

function cloneDeck(deck: readonly BattleCard[]): BattleCard[] {
  return deck.map((card) => ({ ...card, effects: card.effects.map((effect) => ({ ...effect })) }));
}

function cloneEnemy(enemy: Enemy): Enemy {
  return {
    ...enemy,
    statuses: { ...enemy.statuses },
    intents: enemy.intents.map((intent) => ({ ...intent })),
  };
}

function ascendedEnemies(ascension: number): Enemy[] {
  const modifier = getAscensionModifier(ascension);
  return miniRunEnemies.map((source) => {
    const enemy = cloneEnemy(source);
    return {
      ...enemy,
      hp: Math.floor(enemy.hp * modifier.enemyHpMultiplier),
      maxHp: Math.floor(enemy.maxHp * modifier.enemyHpMultiplier),
      intents: enemy.intents.map((intent) => intent.kind === 'attack'
        ? { ...intent, amount: Math.floor(intent.amount * modifier.enemyDamageMultiplier) }
        : { ...intent }),
    } as Enemy;
  });
}

const BASIC_CARD_IDS = ['sinkal', 'neokgarim', 'saseol'] as const;

function baseCardId(id: string): string {
  return id.split('#')[0];
}

function selectRemovalCards(
  deck: readonly BattleCard[],
  amount: number,
  allowNonBasicFallback: boolean,
): BattleCard[] {
  const groups = new Map<string, BattleCard[]>();
  for (const card of deck) {
    const id = baseCardId(card.id);
    const group = groups.get(id) ?? [];
    group.push(card);
    groups.set(id, group);
  }
  for (const group of groups.values()) group.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

  const selected: BattleCard[] = [];
  const takeFrom = (id: string): void => {
    if (selected.length >= Math.min(amount, deck.length)) return;
    const group = groups.get(id);
    const card = group?.shift();
    if (card) selected.push(card);
  };

  // The first three slots approximate the 5:4 basic-deck ratio: 신칼 2, 넋가림 1.
  for (const id of ['sinkal', 'sinkal', 'neokgarim']) takeFrom(id);
  // Shortages are filled from the remaining basic cards in a fixed order.
  for (const id of BASIC_CARD_IDS) {
    while (selected.length < Math.min(amount, deck.length) && (groups.get(id)?.length ?? 0) > 0) takeFrom(id);
  }

  if (allowNonBasicFallback) {
    const nonBasic = [...groups.entries()]
      .filter(([id, cards]) => !BASIC_CARD_IDS.includes(id as typeof BASIC_CARD_IDS[number]) && cards.length > 0)
      .sort(([leftId, leftCards], [rightId, rightCards]) =>
        rightCards.length - leftCards.length || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0));
    for (const [id] of nonBasic) {
      while (selected.length < Math.min(amount, deck.length) && (groups.get(id)?.length ?? 0) > 0) takeFrom(id);
    }
  }
  return selected;
}

function summarizeRemovals(cards: readonly BattleCard[]): RemovalSummary[] {
  const summaries = new Map<string, RemovalSummary>();
  for (const card of cards) {
    const id = baseCardId(card.id);
    const current = summaries.get(id);
    if (current) current.count += 1;
    else summaries.set(id, { id, name: card.name, count: 1 });
  }
  return [...summaries.values()];
}

export function getRewardPreview(deck: readonly BattleCard[]): RewardPreview {
  return {
    deckSize: deck.length,
    cardRemovals: summarizeRemovals(selectRemovalCards(deck, 3, true)),
    cleanseRemovals: summarizeRemovals(selectRemovalCards(deck, 1, false)),
  };
}

function removeCards(deck: readonly BattleCard[], cards: readonly BattleCard[]): BattleCard[] {
  const removedIds = new Set(cards.map((card) => card.id));
  return deck.filter((card) => !removedIds.has(card.id));
}

export function offerRewards(deck: readonly BattleCard[], rng: Rng): RewardOffer[] {
  const pool = [...rewardCards];
  const offered: BattleCard[] = [];
  const ownedIds = new Set(deck.map((card) => card.id.split('#')[0]));
  const groups = new Set(deck.map((card) => card.bondGroup).filter((group): group is string => Boolean(group)));
  const bonded = pool.filter((card) => card.bondGroup && groups.has(card.bondGroup) && !ownedIds.has(card.id));
  if (bonded.length > 0) {
    const selected = bonded[Math.floor(rng() * bonded.length)];
    offered.push(selected);
    pool.splice(pool.indexOf(selected), 1);
  }
  while (offered.length < 3) {
    const index = Math.floor(rng() * pool.length);
    offered.push(pool.splice(index, 1)[0]);
  }
  const rewardPreview = getRewardPreview(deck);
  return offered.map((card) => ({ ...card, rewardPreview }));
}

function beginBattle(state: MiniRunState, rng: Rng, openingDiscard: readonly BattleCard[] = []): MiniRunState {
  const discardedIds = new Set(openingDiscard.map((card) => card.id));
  const openingDeck = state.deck.filter((card) => !discardedIds.has(card.id));
  const modifier = getAscensionModifier(state.ascension);
  const enemy = ascendedEnemies(state.ascension)[state.battleNumber - 1];
  const baseBattle = startBattle([enemy], rng, openingDeck, state.playerHp);
  const openingAffliction = state.battleNumber === miniRunEnemies.length ? modifier.bossOpeningAffliction : 0;
  const battle = openingAffliction > 0
    ? {
      ...baseBattle,
      player: {
        ...baseBattle.player,
        statuses: { ...baseBattle.player.statuses, 액: baseBattle.player.statuses.액 + openingAffliction },
      },
    }
    : baseBattle;
  return {
    ...state,
    phase: 'battle',
    rewards: [],
    battle: { ...battle, discardPile: cloneDeck(openingDiscard) },
  };
}

function deckFromIds(ids: readonly string[]): BattleCard[] {
  const basics = createStartingDeck();
  const serials: Record<string, number> = {};
  return ids.map((id) => {
    const template = basics.find((card) => card.id.split('#')[0] === id) ??
      rewardCards.find((card) => card.id === id);
    if (!template) throw new Error(`Unknown deck card: ${id}`);
    const serial = serials[id] ?? 0;
    serials[id] = serial + 1;
    return cloneRewardCard(template, serial);
  });
}

export function startMiniRun(rng: Rng, startingDeck?: readonly string[], ascension = 0): MiniRunState {
  const modifier = getAscensionModifier(ascension);
  return beginBattle({
    phase: 'battle',
    battleNumber: 1,
    ascension,
    playerHp: modifier.startingHp,
    deck: startingDeck ? deckFromIds(startingDeck) : createStartingDeck(),
    battle: null,
    rewards: [],
    nextSerial: 0,
    acquiredCardIds: [],
  }, rng);
}

function resolveBattle(state: MiniRunState, battle: BattleState, rng: Rng): MiniRunState {
  if (battle.phase === 'lost') return { ...state, phase: 'lost', playerHp: 0, battle, rewards: [] };
  if (battle.phase !== 'won') return { ...state, battle, playerHp: battle.player.hp };
  if (state.battleNumber === miniRunEnemies.length) {
    return { ...state, phase: 'won', playerHp: battle.player.hp, battle, rewards: [] };
  }
  return { ...state, phase: 'reward', playerHp: battle.player.hp, battle, rewards: offerRewards(state.deck, rng) };
}

export function playRunCard(state: MiniRunState, handIndex: number, rng: Rng): MiniRunState {
  if (state.phase !== 'battle' || !state.battle) return state;
  const enemyId = state.battle.enemies.find((enemy) => enemy.hp > 0)?.id;
  return resolveBattle(state, playCard(state.battle, handIndex, enemyId, rng), rng);
}

export function endRunTurn(state: MiniRunState, rng: Rng): MiniRunState {
  if (state.phase !== 'battle' || !state.battle) return state;
  return resolveBattle(state, endTurn(state.battle, rng), rng);
}

export function chooseReward(state: MiniRunState, rewardIndex: number, rng: Rng): MiniRunState {
  if (state.phase !== 'reward' || !state.rewards[rewardIndex]) return state;
  const selectedReward = state.rewards[rewardIndex];
  const removed = selectRemovalCards(state.deck, 3, true);
  const usedIds = new Set(state.deck.map((card) => card.id));
  const gained: BattleCard[] = [];
  let nextSerial = state.nextSerial;
  while (gained.length < 3) {
    const { rewardPreview: _rewardPreview, ...rewardTemplate } = selectedReward;
    const candidate = cloneRewardCard(rewardTemplate, nextSerial);
    nextSerial += 1;
    if (!usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      gained.push(candidate);
    }
  }
  return beginBattle({
    ...state,
    battleNumber: state.battleNumber + 1,
    deck: [...removeCards(cloneDeck(state.deck), removed), ...gained],
    nextSerial,
    acquiredCardIds: [...state.acquiredCardIds, selectedReward.id],
  }, rng, gained);
}

export function skipReward(state: MiniRunState, rng: Rng): MiniRunState {
  if (state.phase !== 'reward') return state;
  const removed = selectRemovalCards(state.deck, 1, false);
  const modifier = getAscensionModifier(state.ascension);
  const maxHp = state.battle?.player.maxHp ?? 70;
  return beginBattle({
    ...state,
    battleNumber: state.battleNumber + 1,
    playerHp: Math.min(maxHp, state.playerHp + modifier.purifyHeal),
    deck: removeCards(cloneDeck(state.deck), removed),
  }, rng);
}
