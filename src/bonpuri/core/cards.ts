import type { BattleCard } from './types';

function card(id: string, name: string, cost: number, effects: BattleCard['effects'], exhaust = false): BattleCard {
  return { id, name, cost, effects, exhaust };
}

export function createStartingDeck(): BattleCard[] {
  return [
    ...Array.from({ length: 25 }, (_, index) =>
      card(`sinkal#${index}`, '신칼', 1, [{ kind: 'damage', amount: 6, target: 'enemy' }]),
    ),
    ...Array.from({ length: 20 }, (_, index) =>
      card(`neokgarim#${index}`, '넋가림', 1, [{ kind: 'block', amount: 5 }]),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      card(`saseol#${index}`, '사설 풀기', 0, [{ kind: 'draw', amount: 2 }], true),
    ),
  ];
}

export const STARTING_DECK = createStartingDeck();
