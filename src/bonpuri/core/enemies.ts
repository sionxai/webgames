import type { Enemy, Statuses } from './types';

export function emptyStatuses(): Statuses {
  return { 액: 0, 넋나감: 0, 부정: 0, 정성: 0, 신명: 0 };
}

export function createTestEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'test-enemy',
    name: '시험 도깨비',
    hp: 30,
    maxHp: 30,
    block: 0,
    statuses: emptyStatuses(),
    intents: [{ kind: 'attack', amount: 6 }],
    intentIndex: 0,
    ...overrides,
  };
}
