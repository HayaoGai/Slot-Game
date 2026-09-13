import { MIN_MATCH } from './config';
import type { PayingSymbolId } from './types';

/** 線注倍數：[3 連, 4 連, 5 連]。線注 = 總注 / 25。 */
export const PAYTABLE: Readonly<Record<PayingSymbolId, readonly [number, number, number]>> = {
    J: [2, 5, 15],
    Q: [2, 5, 15],
    K: [3, 8, 25],
    A: [3, 8, 25],
    H1: [5, 20, 60],
    H2: [8, 30, 100],
    H3: [12, 50, 250],
};

/** SCATTER 依「總注」倍數賠付 */
export const SCATTER_PAYTABLE: Readonly<Record<number, number>> = { 3: 2, 4: 10, 5: 50 };

/** SCATTER 數量對應的免費旋轉次數 */
export const FREE_SPIN_AWARDS: Readonly<Record<number, number>> = { 3: 10, 4: 15, 5: 20 };

export function linePayMultiplier(symbol: PayingSymbolId, count: number): number {
    if (count < MIN_MATCH) return 0;
    return PAYTABLE[symbol][Math.min(count, 5) - MIN_MATCH];
}

export function scatterPayMultiplier(count: number): number {
    return count < 3 ? 0 : SCATTER_PAYTABLE[Math.min(count, 5)];
}

export function freeSpinsForScatter(count: number): number {
    return count < 3 ? 0 : FREE_SPIN_AWARDS[Math.min(count, 5)];
}
