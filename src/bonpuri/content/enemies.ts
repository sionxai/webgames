import { emptyStatuses } from '../core/enemies';
import type { Enemy, Intent } from '../core/types';

const enemy = (id: string, name: string, hp: number, intents: Intent[]): Enemy => ({
  id, name, hp, maxHp: hp, block: 0, statuses: emptyStatuses(), intents, intentIndex: 0,
});

export const miniRunEnemies: Enemy[] = [
  enemy('japgwi', '잡귀', 22, [{ kind: 'attack', amount: 7 }, { kind: 'block', amount: 5 }]),
  enemy('mulgwisin', '물귀신', 28, [{ kind: 'attack', amount: 5 }, { kind: 'applyStatus', status: '넋나감', amount: 1 }, { kind: 'attack', amount: 9 }]),
  enemy('yeonggamsin', '제주 영감신', 34, [{ kind: 'attack', amount: 11 }, { kind: 'applyStatus', status: '부정', amount: 2 }]),
  enemy('gulbaem', '굴뱀', 45, [{ kind: 'attack', amount: 6 }, { kind: 'applyStatus', status: '액', amount: 2 }, { kind: 'attack', amount: 14 }]),
  enemy('gusamseunghalmang', '제주 구삼승할망', 70, [{ kind: 'applyStatus', status: '부정', amount: 3 }, { kind: 'attack', amount: 12 }, { kind: 'block', amount: 10 }, { kind: 'attack', amount: 18 }]),
];
