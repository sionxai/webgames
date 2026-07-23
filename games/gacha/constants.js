// Re-export commonly used constants from combat-core
export {
  TIERS,
  TIER_INDEX,
  PART_DEFS,
  PART_KEYS,
  PART_ICONS,
  DEFAULT_DROP_RATES,
  DEFAULT_GOLD_SCALING,
  DEFAULT_POTION_SETTINGS,
  DEFAULT_HYPER_POTION_SETTINGS,
  DEFAULT_SHOP_PRICES,
  DEFAULT_MONSTER_SCALING,
  DEFAULT_DIFFICULTY_ADJUSTMENTS
} from './combat-core.js';

// Additional TIER_RANK not in combat-core
export const TIER_RANK = Object.fromEntries(
  ['SSS+', 'SS+', 'S+', 'S', 'A', 'B', 'C', 'D'].map((tier, index) => [tier, 8 - index])
);

export const MAX_LEVEL = 999;

// Shorthand exports for backward compatibility
export const DEFAULT_POTION_P = 0.04;
export const DEFAULT_HYPER_P = 0.01;
export const DEFAULT_PROTECT_P = 0.02;
export const DEFAULT_ENHANCE_P = 0.75;
export const DEFAULT_BATTLERES_P = 0.01;

// UI-specific constants
export const RARE_ANIMATION_DURATION_MS = 3600;
export const RARE_ANIMATION_FADE_MS = 220;

export const DIAMOND_SHOP_PACKS = Object.freeze([
  { id: 'diamondPack10', label: '초소형 충전팩', bonus: '입문 패키지', diamonds: 10, points: 100_000, gold: 100_000 },
  { id: 'diamondPack100', label: '소형 충전팩', bonus: '기본 제공', diamonds: 100, points: 1_000_000, gold: 1_000_000 },
  { id: 'diamondPack250', label: '가성비 충전팩', bonus: '+10% 보너스', diamonds: 250, points: 2_800_000, gold: 2_800_000 },
  { id: 'diamondPack500', label: '고급 충전팩', bonus: '+20% 보너스', diamonds: 500, points: 6_000_000, gold: 6_000_000 },
  { id: 'diamondPack1000', label: '에픽 충전팩', bonus: '+35% 보너스', diamonds: 1_000, points: 13_500_000, gold: 13_500_000 },
  { id: 'diamondPack2000', label: '전설 충전팩', bonus: '+50% 보너스', diamonds: 2_000, points: 30_000_000, gold: 30_000_000 }
]);

export const DIAMOND_PACK_LOOKUP = Object.freeze(
  Object.fromEntries(DIAMOND_SHOP_PACKS.map((pack) => [pack.id, pack]))
);

export const ENHANCE_TICKET_COST = Object.freeze([
  0, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 20, 20, 29, 60, 118
]);

export const ENHANCE_PROTECT_COST = Object.freeze([
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 4, 4
]);

export const ENHANCE_EXPECTED_GOLD = Object.freeze([
  0,
  2828,
  2887,
  2947,
  3043,
  3111,
  3500,
  5143,
  6000,
  8800,
  9778,
  14857,
  17333,
  24000,
  34000,
  50667,
  400000,
  500000,
  906667,
  2800000,
  10240000
]);

export const DEFAULT_FLAGS = Object.freeze({
  animationsEnabled: true,
  bannersEnabled: false,
  rewardsPreset: 'default'
});

// Animation GIF URLs
export const GEAR_SSPLUS_GIF = './assets/motion/gear-ssplus.gif';
export const GEAR_SSSPLUS_GIF = './assets/motion/gear-sssplus.gif';
export const LEGACY_GEAR_RARE_GIF = './assets/motion/gear-rare.gif';
export const CHARACTER_SSPLUS_GIF = GEAR_SSPLUS_GIF;
export const CHARACTER_SSSPLUS_GIF = GEAR_SSSPLUS_GIF;
export const LEGACY_CHARACTER_RARE_GIF = LEGACY_GEAR_RARE_GIF;

export const DEFAULT_RARE_ANIMATIONS = {
  gear: [
    {
      tier: 'SS+',
      src: GEAR_SSPLUS_GIF,
      label: 'SS+ 장비 획득!',
      duration: RARE_ANIMATION_DURATION_MS
    },
    {
      tier: 'SSS+',
      src: GEAR_SSSPLUS_GIF,
      label: 'SSS+ 장비 획득!',
      duration: RARE_ANIMATION_DURATION_MS
    }
  ],
  character: [
    {
      tier: 'SS+',
      src: CHARACTER_SSPLUS_GIF,
      label: 'SS+ 캐릭터 획득!',
      duration: RARE_ANIMATION_DURATION_MS
    },
    {
      tier: 'SSS+',
      src: CHARACTER_SSSPLUS_GIF,
      label: 'SSS+ 캐릭터 획득!',
      duration: RARE_ANIMATION_DURATION_MS
    }
  ]
};

export const CHARACTER_IMAGE_PLACEHOLDER = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2210%22%20ry%3D%2210%22%20fill%3D%22%23d0d0d0%22/%3E%3Cpath%20d%3D%22M32%2018a10%2010%200%201%201%200%2020a10%2010%200%200%201%200-20zm0%2024c10.5%200%2019%206.3%2019%2014v4H13v-4c0-7.7%208.5-14%2019-14z%22%20fill%3D%22%23808080%22/%3E%3C/svg%3E';

export const GLOBAL_CONFIG_PATH = 'config/global';

export const ALL_USERS_OPTION = '__ALL_USERS__';

export const defaultWeights = { "SSS+": 5, "SS+": 15, "S+": 35, "S": 80, "A": 120, "B": 200, "C": 300, "D": 245 };

export const cfgVersion = 'v1';

export const CLASS_LABELS = {
  warrior: '전사',
  mage: '마법사',
  archer: '궁수',
  rogue: '도적',
  goddess: '여신'
};

// 쿠폰 시스템 관련 상수들
export const COUPON_TYPES = {
  GEAR: 'gear',
  CHARACTER: 'character',
  PET: 'pet'
};

export const GEAR_COUPON_DEFS = [
  { key: 'head', name: 'SSS+ 투구 쿠폰', icon: '🪖🎟️' },
  { key: 'body', name: 'SSS+ 갑옷 쿠폰', icon: '🛡️🎟️' },
  { key: 'main', name: 'SSS+ 주무기 쿠폰', icon: '⚔️🎟️' },
  { key: 'off', name: 'SSS+ 보조무기 쿠폰', icon: '🗡️🎟️' },
  { key: 'boots', name: 'SSS+ 신발 쿠폰', icon: '🥾🎟️' }
];

export const CHARACTER_COUPON_DEFS = [
  { key: 'warrior', name: 'SSS+ 전사 쿠폰', icon: '⚔️🎟️' },
  { key: 'mage', name: 'SSS+ 마법사 쿠폰', icon: '🔮🎟️' },
  { key: 'archer', name: 'SSS+ 궁수 쿠폰', icon: '🏹🎟️' },
  { key: 'rogue', name: 'SSS+ 도적 쿠폰', icon: '🗡️🎟️' },
  { key: 'goddess', name: 'SSS+ 여신 쿠폰', icon: '✨🎟️' }
];

export const PET_COUPON_DEFS = [
  { key: 'pet_ant', name: '사막 개미 수호병 쿠폰', icon: '🐜🎟️' },
  { key: 'pet_deer', name: '신속 사슴 쿠폰', icon: '🦌🎟️' },
  { key: 'pet_goat', name: '암석 산양 쿠폰', icon: '🐐🎟️' },
  { key: 'pet_tiger', name: '백호 쿠폰', icon: '🐅🎟️' },
  { key: 'pet_horang', name: '호랭찡 쿠폰', icon: '🐯🎟️' }
];