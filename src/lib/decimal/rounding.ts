import Decimal from 'decimal.js';

export const ROUND_MODES = {
  ROUND_UP: Decimal.ROUND_UP,
  ROUND_DOWN: Decimal.ROUND_DOWN,
  ROUND_CEIL: Decimal.ROUND_CEIL,
  ROUND_FLOOR: Decimal.ROUND_FLOOR,
  ROUND_HALF_UP: Decimal.ROUND_HALF_UP,
  ROUND_HALF_DOWN: Decimal.ROUND_HALF_DOWN,
  ROUND_HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  ROUND_HALF_CEIL: Decimal.ROUND_HALF_CEIL,
  ROUND_HALF_FLOOR: Decimal.ROUND_HALF_FLOOR,
} as const;

export type RoundMode = typeof ROUND_MODES[keyof typeof ROUND_MODES];
