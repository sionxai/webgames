import { createStartingDeck } from './cards';
import { emptyStatuses } from './enemies';
import { shuffle, type Rng } from './rng';
import type { BattleCard, BattleState, Combatant, Effect, Enemy, StatusKey, Statuses } from './types';

const STARTING_HP = 70;
const TURN_ENERGY = 3;
const HAND_SIZE = 5;
const FIRST_HAND_SIZE = 7;
export const BOND_STACK_CAP = 3;
const decreasingStatuses: StatusKey[] = ['액', '넋나감', '부정'];

function nonnegative(value: number): number {
  return Math.max(0, Math.floor(value));
}

function cloneStatuses(statuses: Statuses): Statuses {
  return { ...statuses };
}

function cloneCombatant<T extends Combatant>(combatant: T): T {
  return { ...combatant, statuses: cloneStatuses(combatant.statuses) };
}

export function cloneBattleState(state: BattleState): BattleState {
  return {
    ...state,
    player: cloneCombatant(state.player),
    enemies: state.enemies.map((enemy) => ({
      ...cloneCombatant(enemy),
      intents: enemy.intents.map((intent) => ({ ...intent })),
    })),
    hand: state.hand.map(cloneCard),
    drawPile: state.drawPile.map(cloneCard),
    discardPile: state.discardPile.map(cloneCard),
    exhaustPile: state.exhaustPile.map(cloneCard),
    equipped: state.equipped.map(cloneCard),
    installed: state.installed ? cloneCard(state.installed) : null,
    playedMyths: { ...state.playedMyths },
  };
}

function cloneCard(card: BattleCard): BattleCard {
  return {
    ...card,
    effects: card.effects.map((effect) => ({ ...effect })),
    passive: card.passive?.kind === 'turnStart'
      ? { ...card.passive, effects: card.passive.effects.map((effect) => ({ ...effect })) }
      : card.passive ? { ...card.passive } : undefined,
  };
}

function settleCorruption<T extends Combatant>(combatant: T): T {
  const corruption = nonnegative(combatant.statuses.부정);
  return { ...combatant, hp: nonnegative(combatant.hp - corruption) };
}

function decreaseStatuses<T extends Combatant>(combatant: T): T {
  const statuses = cloneStatuses(combatant.statuses);
  for (const key of decreasingStatuses) statuses[key] = nonnegative(statuses[key] - 1);
  return { ...combatant, statuses };
}

function applyStatus<T extends Combatant>(combatant: T, status: StatusKey, amount: number): T {
  return {
    ...combatant,
    statuses: {
      ...combatant.statuses,
      [status]: nonnegative(combatant.statuses[status] + amount),
    },
  };
}

export function applyDamage<T extends Combatant>(
  attacker: Combatant,
  target: T,
  base: number,
  passives: readonly BattleCard[] = [],
): T {
  const flat = passives.reduce((sum, card) => sum + (card.passive?.kind === 'flatDamageBonus' ? card.passive.amount : 0), 0);
  let damage = Math.floor(base) + nonnegative(attacker.statuses.정성) + flat;
  if (attacker.statuses.넋나감 > 0) damage = Math.floor(damage * 0.75);
  if (target.statuses.액 > 0) damage = Math.floor(damage * 1.5);
  for (const card of passives) {
    const passive = card.passive;
    if (passive?.kind === 'statusDamageBonus' && target.statuses[passive.status] > 0) {
      damage = Math.floor(damage * (1 + passive.percent / 100));
    }
  }
  damage = nonnegative(damage);
  const absorbed = Math.min(nonnegative(target.block), damage);
  damage -= absorbed;
  return { ...target, block: nonnegative(target.block - absorbed), hp: nonnegative(target.hp - damage) };
}

/** 현재 상태에서 공격이 명에 입힐 실제 피해를 상태 변경 없이 계산한다. */
export function previewHpDamage(attacker: Combatant, target: Combatant, base: number): number {
  const after = applyDamage(attacker, target, base);
  return nonnegative(target.hp - after.hp);
}

function determineOutcome(state: BattleState): BattleState {
  if (state.player.hp <= 0) return { ...state, phase: 'lost' };
  if (state.enemies.every((enemy) => enemy.hp <= 0)) return { ...state, phase: 'won' };
  return state;
}

export function drawCards(state: BattleState, amount: number, rng: Rng): BattleState {
  let next = cloneBattleState(state);
  const count = nonnegative(amount);
  for (let drawn = 0; drawn < count; drawn += 1) {
    if (next.drawPile.length === 0) {
      if (next.discardPile.length === 0) break;
      const result = shuffle(next.discardPile, rng);
      next = { ...next, drawPile: result.items, discardPile: [], rngCalls: next.rngCalls + result.rngCalls };
    }
    const [card, ...drawPile] = next.drawPile;
    next = { ...next, hand: [...next.hand, card], drawPile };
  }
  return next;
}

export function startPlayerTurn(state: BattleState, rng: Rng): BattleState {
  let next = cloneBattleState(state);
  const inspiration = nonnegative(next.player.statuses.신명);
  const passives = [...(next.installed ? [next.installed] : []), ...next.equipped];
  const turnEnergy = TURN_ENERGY + inspiration + passives.reduce((sum, card) =>
    sum + (card.passive?.kind === 'energyBonus' ? card.passive.amount : 0), 0);
  next = {
    ...next,
    turn: next.turn + 1,
    energy: turnEnergy,
    maxEnergy: turnEnergy,
    phase: 'playerTurn',
    gutPlayedThisTurn: false,
    costReduction: 0,
    player: {
      ...next.player,
      block: 0,
      statuses: { ...next.player.statuses, 신명: 0 },
    },
  };
  for (const card of passives) {
    if (card.passive?.kind === 'turnStart') {
      for (const effect of card.passive.effects) {
        next = applyEffect(next, effect, undefined, rng);
        if (next.phase === 'won' || next.phase === 'lost') return next;
      }
    }
  }
  const baseHandSize = next.turn === 1 ? FIRST_HAND_SIZE : HAND_SIZE;
  const handSize = baseHandSize + passives.reduce((sum, card) =>
    sum + (card.passive?.kind === 'drawBonus' ? card.passive.amount : 0), 0);
  return drawCards(next, Math.max(0, handSize - next.hand.length), rng);
}

export function startBattle(
  enemies: readonly Enemy[],
  rng: Rng,
  deck: readonly BattleCard[] = createStartingDeck(),
  playerHp = STARTING_HP,
): BattleState {
  const shuffled = shuffle(deck.map(cloneCard), rng);
  const initial: BattleState = {
    player: {
      id: 'player',
      name: '심방',
      hp: Math.min(STARTING_HP, nonnegative(playerHp)),
      maxHp: STARTING_HP,
      block: 0,
      statuses: emptyStatuses(),
    },
    enemies: enemies.map((enemy) => ({
      ...cloneCombatant(enemy),
      intents: enemy.intents.map((intent) => ({ ...intent })),
    })),
    energy: 0,
    maxEnergy: 0,
    hand: [],
    drawPile: shuffled.items,
    discardPile: [],
    exhaustPile: [],
    phase: 'playerTurn',
    turn: 0,
    rngCalls: shuffled.rngCalls,
    playedMyths: {},
    equipped: [],
    installed: null,
    gutPlayedThisTurn: false,
    duplicateNext: false,
    costReduction: 0,
  };
  return startPlayerTurn(initial, rng);
}

function applyEffect(state: BattleState, effect: Effect, targetEnemyId: string | undefined, rng: Rng): BattleState {
  if (effect.kind === 'block') {
    return { ...state, player: { ...state.player, block: nonnegative(state.player.block + effect.amount) } };
  }
  if (effect.kind === 'draw') return drawCards(state, effect.amount, rng);
  if (effect.kind === 'gainEnergy') return { ...state, energy: nonnegative(state.energy + effect.amount) };
  if (effect.kind === 'heal') {
    return { ...state, player: { ...state.player, hp: Math.min(state.player.maxHp, nonnegative(state.player.hp + effect.amount)) } };
  }
  if (effect.kind === 'damage') {
    const enemies = state.enemies.map((enemy) => {
      const selected = effect.target === 'allEnemies' || enemy.id === targetEnemyId;
      return selected && enemy.hp > 0 ? { ...enemy, ...applyDamage(state.player, enemy, effect.amount, [...state.equipped, ...(state.installed ? [state.installed] : [])]) } : enemy;
    });
    return determineOutcome({ ...state, enemies });
  }
  if (effect.kind === 'execute') {
    const enemies = state.enemies.map((enemy) => {
      if (enemy.id !== targetEnemyId || enemy.hp <= 0) return enemy;
      if (enemy.hp <= effect.thresholdHp) return { ...enemy, hp: 0 };
      return { ...enemy, ...applyDamage(state.player, enemy, effect.amount, [...state.equipped, ...(state.installed ? [state.installed] : [])]) };
    });
    return determineOutcome({ ...state, enemies });
  }
  if (effect.kind === 'applyStatus' && effect.target === 'self') {
    return { ...state, player: applyStatus(state.player, effect.status, effect.amount) };
  }
  if (effect.kind === 'applyStatus') {
    const enemies = state.enemies.map((enemy) => {
    const selected = effect.target === 'allEnemies' || enemy.id === targetEnemyId;
    return selected && enemy.hp > 0 ? { ...enemy, ...applyStatus(enemy, effect.status, effect.amount) } : enemy;
    });
    return { ...state, enemies };
  }
  if (effect.kind === 'tutor') {
    const index = state.drawPile.findIndex((card) =>
      (!effect.cardType || card.cardType === effect.cardType) &&
      (!effect.bondGroup || card.bondGroup === effect.bondGroup));
    if (index < 0) return state;
    return { ...state, hand: [...state.hand, state.drawPile[index]], drawPile: state.drawPile.filter((_, i) => i !== index) };
  }
  if (effect.kind === 'recover') {
    const count = Math.min(nonnegative(effect.amount), state.discardPile.length);
    return { ...state, hand: [...state.hand, ...state.discardPile.slice(-count).reverse()], discardPile: state.discardPile.slice(0, -count) };
  }
  if (effect.kind === 'costReduction') return { ...state, costReduction: nonnegative(state.costReduction + effect.amount) };
  if (effect.kind === 'cleanse') {
    const statuses = { ...state.player.statuses };
    effect.statuses.forEach((status) => { statuses[status] = 0; });
    return { ...state, player: { ...state.player, statuses } };
  }
  if (effect.kind === 'transferStatus') {
    const amount = state.player.statuses[effect.status];
    return {
      ...state,
      player: { ...state.player, statuses: { ...state.player.statuses, [effect.status]: 0 } },
      enemies: state.enemies.map((enemy) => enemy.id === targetEnemyId && enemy.hp > 0 ? applyStatus(enemy, effect.status, amount) : enemy),
    };
  }
  if (effect.kind === 'blockToDamage') {
    const amount = Math.floor(state.player.block * effect.percent / 100);
    return applyEffect(state, { kind: 'damage', amount, target: 'enemy' }, targetEnemyId, rng);
  }
  if (effect.kind === 'cancelIntent') {
    return { ...state, enemies: state.enemies.map((enemy) => enemy.id === targetEnemyId && enemy.hp > 0
      ? { ...enemy, intentIndex: enemy.intentIndex + 1 } : enemy) };
  }
  return { ...state, duplicateNext: true };
}

/** 단일 대상('enemy') 효과를 가진 카드인지. allEnemies·self는 대상 지정이 필요 없다. */
function needsSingleTarget(card: BattleCard): boolean {
  return card.effects.some(
    (effect) =>
      ((effect.kind === 'damage' || effect.kind === 'execute' || effect.kind === 'applyStatus' ||
        effect.kind === 'transferStatus' || effect.kind === 'blockToDamage' || effect.kind === 'cancelIntent') && effect.target === 'enemy'),
  );
}

export function playCard(state: BattleState, handIndex: number, targetEnemyId: string | undefined, rng: Rng): BattleState {
  const card = state.hand[handIndex];
  const actualCost = card ? Math.max(0, card.cost - state.costReduction) : 0;
  if (state.phase !== 'playerTurn' || !card || actualCost > state.energy ||
      (card.cardType === '굿' && state.gutPlayedThisTurn)) return cloneBattleState(state);
  // 유효한 대상이 없으면 장단만 소모되고 효과가 사라지는 것을 막는다 — 장단 부족과 동일하게 완전 거부(fail-closed).
  if (needsSingleTarget(card) && !state.enemies.some((enemy) => enemy.id === targetEnemyId && enemy.hp > 0)) {
    return cloneBattleState(state);
  }
  let next = cloneBattleState(state);
  const played = next.hand[handIndex];
  const duplicate = next.duplicateNext && played.effects.every((effect) => effect.kind !== 'duplicate');
  next = { ...next, energy: nonnegative(next.energy - actualCost), hand: next.hand.filter((_, index) => index !== handIndex),
    gutPlayedThisTurn: next.gutPlayedThisTurn || played.cardType === '굿', duplicateNext: duplicate ? false : next.duplicateNext };
  const stacks = played.bondGroup ? next.playedMyths[played.bondGroup] ?? 0 : 0;
  const bonus = played.bond ? played.bond.perStack * Math.min(stacks, BOND_STACK_CAP) : 0;
  let bonusApplied = false;
  const effects = duplicate ? [...played.effects, ...played.effects] : played.effects;
  for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
    if (duplicate && effectIndex === played.effects.length) bonusApplied = false;
    const originalEffect = effects[effectIndex];
    const matchesBond = played.bond?.applyTo === 'block'
      ? originalEffect.kind === 'block'
      : played.bond?.applyTo === 'damage' && (originalEffect.kind === 'damage' || originalEffect.kind === 'execute');
    let effect = originalEffect;
    if (matchesBond && !bonusApplied &&
        (originalEffect.kind === 'block' || originalEffect.kind === 'damage' || originalEffect.kind === 'execute')) {
      effect = { ...originalEffect, amount: originalEffect.amount + bonus };
    }
    if (matchesBond && !bonusApplied) bonusApplied = true;
    next = applyEffect(next, effect, targetEnemyId, rng);
    if (next.phase === 'won' || next.phase === 'lost') break;
  }
  if (played.bondGroup) {
    next = { ...next, playedMyths: { ...next.playedMyths, [played.bondGroup]: stacks + 1 } };
  }
  if (played.cardType === '무구') next = { ...next, equipped: [...next.equipped, played] };
  else if (played.cardType === '좌정') next = {
    ...next,
    installed: played,
    exhaustPile: next.installed ? [...next.exhaustPile, next.installed] : next.exhaustPile,
  };
  else if (played.exhaust) next = { ...next, exhaustPile: [...next.exhaustPile, played] };
  else next = { ...next, discardPile: [...next.discardPile, played] };
  return next;
}

export function runEnemyTurn(state: BattleState): BattleState {
  let next = cloneBattleState(state);
  for (let index = 0; index < next.enemies.length; index += 1) {
    let enemy = next.enemies[index];
    if (enemy.hp <= 0) continue;
    enemy = { ...enemy, block: 0 };
    next.enemies[index] = enemy;
    const intent = enemy.intents.length > 0
      ? enemy.intents[enemy.intentIndex % enemy.intents.length]
      : undefined;
    if (intent) {
      if (intent.kind === 'attack') {
        next = determineOutcome({ ...next, player: applyDamage(enemy, next.player, intent.amount) });
        if (next.phase === 'won' || next.phase === 'lost') return next;
      }
      else if (intent.kind === 'block') enemy = { ...enemy, block: nonnegative(enemy.block + intent.amount) };
      else next = { ...next, player: applyStatus(next.player, intent.status, intent.amount) };
      enemy = { ...enemy, intentIndex: enemy.intentIndex + 1 };
    }
    enemy = settleCorruption(enemy);
    next.enemies[index] = enemy;
    next = determineOutcome(next);
    if (next.phase === 'won' || next.phase === 'lost') return next;
    enemy = decreaseStatuses(enemy);
    next.enemies[index] = enemy;
  }
  return next;
}

export function endTurn(state: BattleState, rng: Rng): BattleState {
  if (state.phase !== 'playerTurn') return cloneBattleState(state);
  let next = cloneBattleState(state);
  next = {
    ...next,
    discardPile: [...next.discardPile, ...next.hand],
    hand: [],
    player: settleCorruption(next.player),
  };
  next = determineOutcome(next);
  if (next.phase === 'won' || next.phase === 'lost') return next;
  next = { ...next, player: decreaseStatuses(next.player), phase: 'enemyTurn' };
  next = runEnemyTurn(next);
  if (next.phase === 'won' || next.phase === 'lost') return next;
  return startPlayerTurn(next, rng);
}
