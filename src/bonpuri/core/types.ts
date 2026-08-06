export type StatusKey = '액' | '넋나감' | '부정' | '정성' | '신명';
export type Statuses = Record<StatusKey, number>;

export type Combatant = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Statuses;
};

export type EffectTarget = 'self' | 'enemy' | 'allEnemies';
export type CardType = '신' | '무구' | '굿' | '좌정';

export type Effect =
  | { kind: 'damage'; amount: number; target: 'enemy' | 'allEnemies' }
  | { kind: 'execute'; thresholdHp: number; amount: number; target: 'enemy' }
  | { kind: 'block'; amount: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'gainEnergy'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'applyStatus'; status: StatusKey; amount: number; target: EffectTarget }
  | { kind: 'tutor'; cardType?: CardType; bondGroup?: string }
  | { kind: 'recover'; amount: number }
  | { kind: 'costReduction'; amount: number }
  | { kind: 'transferStatus'; status: StatusKey; target: 'enemy' }
  | { kind: 'cleanse'; statuses: StatusKey[] }
  | { kind: 'blockToDamage'; percent: number; target: 'enemy' }
  | { kind: 'cancelIntent'; target: 'enemy' }
  | { kind: 'duplicate' };

export type Passive =
  | { kind: 'turnStart'; effects: Effect[] }
  | { kind: 'drawBonus'; amount: number }
  | { kind: 'energyBonus'; amount: number }
  | { kind: 'flatDamageBonus'; amount: number }
  | { kind: 'statusDamageBonus'; status: StatusKey; percent: number };

export type BattleCard = {
  id: string;
  name: string;
  cost: number;
  effects: Effect[];
  exhaust: boolean;
  cardType?: CardType;
  passive?: Passive;
  bondGroup?: string;
  bond?: { perStack: number; applyTo: 'damage' | 'block' };
};

export type Intent =
  | { kind: 'attack'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'applyStatus'; status: StatusKey; amount: number };

export type Enemy = Combatant & {
  intents: Intent[];
  intentIndex: number;
};

export type Phase = 'playerTurn' | 'enemyTurn' | 'won' | 'lost';

export type BattleState = {
  player: Combatant;
  enemies: Enemy[];
  energy: number;
  maxEnergy: number;      // 이번 플레이어 턴 시작 시 장단 최대치
  hand: BattleCard[];
  drawPile: BattleCard[];
  discardPile: BattleCard[];
  exhaustPile: BattleCard[];
  phase: Phase;
  turn: number;
  rngCalls: number;
  playedMyths: Record<string, number>;
  equipped: BattleCard[];
  installed: BattleCard | null;
  gutPlayedThisTurn: boolean;
  duplicateNext: boolean;
  costReduction: number;
};
