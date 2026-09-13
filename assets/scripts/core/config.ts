import type { PayingSymbolId, SymbolId } from './types';

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;
export const LINE_COUNT = 25;
export const MIN_MATCH = 3;

export const ALL_SYMBOLS: readonly SymbolId[] = ['J', 'Q', 'K', 'A', 'H1', 'H2', 'H3', 'WILD', 'SCATTER'];
export const LOW_SYMBOLS: readonly PayingSymbolId[] = ['J', 'Q', 'K', 'A'];
export const HIGH_SYMBOLS: readonly PayingSymbolId[] = ['H1', 'H2', 'H3'];
export const PAYING_SYMBOLS: readonly PayingSymbolId[] = [...LOW_SYMBOLS, ...HIGH_SYMBOLS];

export const FREE_SPIN_START_MULTIPLIER = 1;
export const FREE_SPIN_MAX_MULTIPLIER = 5;

/**
 * 金額一律以「分」為單位的整數保存，避免浮點誤差。
 * 總注必須是線數的整數倍，確保線注也是整數。
 */
export const BET_LEVELS: readonly number[] = [25, 50, 100, 250, 500, 1000, 2500];
export const DEFAULT_BET_INDEX = 2;
export const INITIAL_BALANCE = 100_000;

export const AUTOPLAY_COUNTS: readonly number[] = [10, 25, 50];

export const TARGET_RTP = 0.96;
export const RTP_TOLERANCE = 0.005;
export const TARGET_HIT_FREQUENCY: readonly [number, number] = [0.17, 0.23];

/** 分級演出門檻（總贏分 / 總注） */
export const WIN_TIERS = { big: 10, mega: 25, epic: 50 } as const;
