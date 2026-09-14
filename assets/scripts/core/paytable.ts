import { MIN_MATCH } from './config';
import type { BonusPrize, JackpotId, PayingSymbolId } from './types';

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

/** Jackpot 固定為總注倍數；GRAND 只能由 Hold & Spin 填滿 15 格獲得 */
export const JACKPOT_MULTIPLIERS: Readonly<Record<JackpotId, number>> = { MINI: 20, MINOR: 50, MAJOR: 200, GRAND: 1000 };

export interface WeightedPrize {
    prize: BonusPrize;
    weight: number;
}

/** 每顆 BONUS 的獎項權重（一般遊戲、免費遊戲與重轉共用同一張表） */
export const BONUS_PRIZES: readonly WeightedPrize[] = [
    { prize: { kind: 'cash', multiple: 1 }, weight: 420 },
    { prize: { kind: 'cash', multiple: 2 }, weight: 260 },
    { prize: { kind: 'cash', multiple: 3 }, weight: 150 },
    { prize: { kind: 'cash', multiple: 5 }, weight: 90 },
    { prize: { kind: 'cash', multiple: 10 }, weight: 50 },
    { prize: { kind: 'jackpot', jackpot: 'MINI' }, weight: 20 },
    { prize: { kind: 'jackpot', jackpot: 'MINOR' }, weight: 7 },
    { prize: { kind: 'jackpot', jackpot: 'MAJOR' }, weight: 3 },
];

export const BONUS_PRIZE_TOTAL_WEIGHT = BONUS_PRIZES.reduce((sum, p) => sum + p.weight, 0);

/** Hold & Spin 重轉時，每個未鎖定格各自落下新 BONUS 的機率 */
export const RESPIN_BONUS_CHANCE = 0.05;

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

export function bonusMultiple(prize: BonusPrize): number {
    return prize.kind === 'cash' ? prize.multiple : JACKPOT_MULTIPLIERS[prize.jackpot];
}

/** roll 為 [0, BONUS_PRIZE_TOTAL_WEIGHT) 的整數 */
export function drawBonusPrize(roll: number): BonusPrize {
    let left = roll;
    for (const entry of BONUS_PRIZES) {
        if (left < entry.weight) return entry.prize;
        left -= entry.weight;
    }
    throw new RangeError(`Bonus prize roll out of range: ${roll}`);
}
