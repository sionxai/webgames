import type { BattleCard, CardType, Passive } from '../core/types';

const card = (
  id: string, name: string, cardType: CardType, cost: number,
  effects: BattleCard['effects'] = [], bondGroup?: string, bond?: BattleCard['bond'], passive?: Passive,
): BattleCard => ({ id, name, cardType, cost, effects, exhaust: false, bondGroup, bond, passive });
const d = (amount: number, target: 'enemy' | 'allEnemies' = 'enemy') => ({ kind: 'damage' as const, amount, target });
const b = (amount: number) => ({ kind: 'block' as const, amount });
const s = (status: '액' | '넋나감' | '부정' | '정성' | '신명', amount: number, target: 'self' | 'enemy' | 'allEnemies') =>
  ({ kind: 'applyStatus' as const, status, amount, target });
const bond = (applyTo: 'damage' | 'block', perStack: number) => ({ applyTo, perStack });
const passive = (value: Passive) => value;

export const rewardCards: BattleCard[] = [
  card('jacheongbi', '자청비', '신', 2, [d(14)], '세경본풀이', bond('damage', 3)),
  card('mundoryeong', '문도령', '신', 1, [b(6), s('정성', 1, 'self')], '세경본풀이', bond('block', 2)),
  card('jeongsunam', '정수남', '신', 1, [d(7)], '세경본풀이', bond('damage', 3)),
  card('gangnimchasa', '강림차사', '신', 3, [{ kind: 'execute', thresholdHp: 16, amount: 21, target: 'enemy' }], '저승차사', bond('damage', 5)),
  card('iljikchasa', '일직차사', '신', 1, [d(7)], '저승차사', bond('damage', 2)),
  card('woljikchasa', '월직차사', '신', 1, [d(4), s('액', 1, 'enemy')], '저승차사', bond('damage', 2)),
  card('jeoseungsaja', '저승사자', '신', 2, [{ kind: 'execute', thresholdHp: 10, amount: 12, target: 'enemy' }], '저승차사', bond('damage', 3)),
  card('cheonjiwang', '천지왕', '신', 3, [d(18, 'allEnemies'), s('신명', 1, 'self')], '천지왕본풀이', bond('damage', 2)),
  card('daebyeolwang', '대별왕', '신', 3, [d(21, 'allEnemies')], '천지왕본풀이', bond('damage', 3)),
  card('sobyeolwang', '소별왕', '신', 2, [d(8), s('신명', 1, 'self')], '천지왕본풀이', bond('damage', 3)),
  card('samseunghalmang', '제주 삼승할망', '신', 2, [{ kind: 'heal', amount: 12 }, b(8)], '삼승할망본풀이', bond('block', 3)),
  card('gusamseunghalmang', '제주 구삼승할망', '신', 1, [s('부정', 4, 'enemy'), s('부정', 1, 'self')], '삼승할망본풀이'),
  card('chilseongsin', '제주 칠성신', '신', 2, [{ kind: 'gainEnergy', amount: 1 }, { kind: 'draw', amount: 1 }], '칠성본풀이'),
  card('anchilseong', '안칠성', '신', 1, [b(7)], '칠성본풀이', bond('block', 3)),
  card('batchilseong', '밧칠성', '신', 1, [d(7)], '칠성본풀이', bond('damage', 3)),
  card('nokdisaengin', '녹디생인', '신', 1, [b(8)], '문전본풀이', bond('block', 3)),
  card('namseonbi', '남선비', '신', 1, [d(4), b(4)], '문전본풀이', bond('damage', 2)),
  card('yeosanbuin', '여산부인', '신', 2, [{ kind: 'heal', amount: 8 }, b(6)], '문전본풀이', bond('block', 2)),
  card('noiljeodaegwi', '노일저대귀일의 딸', '신', 2, [s('부정', 3, 'enemy'), s('액', 1, 'enemy')], '문전본풀이'),
  card('seolmundaehalmang', '설문대할망', '신', 3, [d(21, 'allEnemies')]),
  card('yoryeong', '요령', '무구', 1, [], undefined, undefined, passive({ kind: 'drawBonus', amount: 1 })),
  card('sanpan', '산판', '무구', 2, [], undefined, undefined, passive({ kind: 'energyBonus', amount: 1 })),
  card('myeongdu', '명두', '무구', 1, [], undefined, undefined, passive({ kind: 'statusDamageBonus', status: '액', percent: 30 })),
  card('mulsaek', '물색', '무구', 1, [], undefined, undefined, passive({ kind: 'turnStart', effects: [b(4)] })),
  card('simbangkwaeja', '심방쾌자', '무구', 2, [], undefined, undefined, passive({ kind: 'turnStart', effects: [{ kind: 'heal', amount: 2 }] })),
  card('bonmaengdu', '본맹두', '무구', 1, [], '초공본풀이', undefined, passive({ kind: 'turnStart', effects: [{ kind: 'draw', amount: 1 }] })),
  card('sinmaengdu', '신맹두', '무구', 2, [], '초공본풀이', undefined, passive({ kind: 'flatDamageBonus', amount: 3 })),
  card('sammaengdu', '삼맹두', '무구', 2, [], '초공본풀이', undefined, passive({ kind: 'turnStart', effects: [b(5)] })),
  card('chogamje', '초감제', '굿', 1, [{ kind: 'tutor', cardType: '신' }]),
  card('siwangmaji', '시왕맞이', '굿', 3, [{ kind: 'cancelIntent', target: 'enemy' }, s('액', 3, 'enemy')]),
  card('gwiyangpuri', '귀양풀이', '굿', 1, [{ kind: 'transferStatus', status: '부정', target: 'enemy' }]),
  card('buldomaji', '불도맞이', '굿', 2, [{ kind: 'cleanse', statuses: ['액', '넋나감', '부정'] }, { kind: 'heal', amount: 8 }]),
  card('yeongdeunggut', '영등굿', '굿', 1, [{ kind: 'draw', amount: 3 }, { kind: 'costReduction', amount: 1 }]),
  card('yowangmaji', '요왕맞이', '굿', 2, [{ kind: 'recover', amount: 2 }]),
  card('samgongmaji', '삼공맞이', '굿', 2, [{ kind: 'duplicate' }]),
  card('seongjupuri', '성주풀이', '굿', 2, [{ kind: 'blockToDamage', percent: 150, target: 'enemy' }]),
  card('munjeonsin', '제주 문전신', '좌정', 2, [], '문전본풀이', undefined, passive({ kind: 'turnStart', effects: [b(6)] })),
  card('jowangsin', '제주 조왕신', '좌정', 2, [], '문전본풀이', undefined, passive({ kind: 'turnStart', effects: [{ kind: 'heal', amount: 3 }] })),
  card('cheukgansin', '제주 측간신', '좌정', 2, [], '문전본풀이', undefined, passive({ kind: 'turnStart', effects: [s('부정', 2, 'allEnemies')] })),
  card('jumokjisin', '제주 주목지신', '좌정', 1, [], '문전본풀이', undefined, passive({ kind: 'turnStart', effects: [b(3)] })),
  card('seongjusin', '성주신', '좌정', 3, [], undefined, undefined, passive({ kind: 'turnStart', effects: [b(4), { kind: 'draw', amount: 1 }] })),
  card('teojusin', '터주신', '좌정', 2, [], undefined, undefined, passive({ kind: 'turnStart', effects: [s('정성', 1, 'self')] })),
];

export function cloneRewardCard(template: BattleCard, serial: number): BattleCard {
  return {
    ...template, id: `${template.id}#${serial}`,
    effects: template.effects.map((effect) => ({ ...effect })),
    passive: template.passive?.kind === 'turnStart'
      ? { ...template.passive, effects: template.passive.effects.map((effect) => ({ ...effect })) }
      : template.passive ? { ...template.passive } : undefined,
  };
}
