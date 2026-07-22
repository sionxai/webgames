import { BALANCE } from "../constants/balance";

export interface WaitdogRng {
  next(): number;
  range(min: number, max: number): number;
  integer(min: number, max: number): number;
  chance(probability: number): boolean;
}

export function mulberry32(seed: number): () => number {
  let state = Number.isFinite(seed)
    ? seed >>> BALANCE.NUMBER.ZERO
    : BALANCE.RNG.FALLBACK_SEED;

  return () => {
    state = (state + BALANCE.RNG.INCREMENT) >>> BALANCE.NUMBER.ZERO;
    let mixed = state;
    mixed = Math.imul(
      mixed ^ (mixed >>> BALANCE.RNG.MIX_SHIFT_A),
      mixed | BALANCE.RNG.MIX_MULTIPLIER_A,
    );
    mixed ^= mixed +
      Math.imul(
        mixed ^ (mixed >>> BALANCE.RNG.MIX_SHIFT_B),
        mixed | BALANCE.RNG.MIX_MULTIPLIER_B,
      );
    return ((mixed ^ (mixed >>> BALANCE.RNG.MIX_SHIFT_C)) >>>
      BALANCE.NUMBER.ZERO) /
      BALANCE.RNG.UINT32_RANGE;
  };
}

export function createRng(seed: number): WaitdogRng {
  const next = mulberry32(seed);

  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    integer(min, max) {
      return Math.floor(min + (max - min + BALANCE.NUMBER.ONE) * next());
    },
    chance(probability) {
      const safeProbability = Math.max(
        BALANCE.NUMBER.ZERO,
        Math.min(BALANCE.NUMBER.ONE, probability),
      );
      return next() < safeProbability;
    },
  };
}
