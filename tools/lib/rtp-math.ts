/**
 * Reel strip 的精確 RTP 解析（非抽樣）。
 *
 * 關鍵觀察：每條 payline 在每一欄只取一格，而每一格的符號邊際分佈就是該 strip 的組成比例，
 * 且各欄停輪彼此獨立。因此單線期望賠付只取決於「各欄符號組成」，與排列順序無關，
 * 可以直接列舉 9^5 種符號組合精確計算。
 *
 * SCATTER 在 strip 上間隔至少 3 格（實際規則為 8 格），同一欄視窗最多一個，
 * 每欄出現機率 = 數量 × 3 / 長度，跨欄做卷積即可得到全盤面數量分佈。
 */
import { FREE_SPIN_MAX_MULTIPLIER, FREE_SPIN_START_MULTIPLIER, PAYING_SYMBOLS, REEL_COUNT, ROW_COUNT } from '../../assets/scripts/core/config';
import { freeSpinsForScatter, linePayMultiplier, scatterPayMultiplier } from '../../assets/scripts/core/paytable';
import type { PayingSymbolId, ReelStrips, SymbolId } from '../../assets/scripts/core/types';

export type Composition = Partial<Record<SymbolId, number>>;

export function compositionOf(strip: readonly SymbolId[]): Composition {
    const comp: Composition = {};
    for (const s of strip) comp[s] = (comp[s] ?? 0) + 1;
    return comp;
}

export function stripLength(comp: Composition): number {
    return Object.values(comp).reduce((sum, n) => sum + (n ?? 0), 0);
}

export interface Analysis {
    lineRtp: number;
    lineRtpBySymbol: Record<PayingSymbolId, number>;
    scatterRtp: number;
    /** 一般遊戲單次 spin 的期望回報（總注倍數），同時也是免費遊戲 x1 時的期望回報 */
    baseRtp: number;
    /** scatterCountProb[k] = 全盤面恰好 k 個 SCATTER 的機率 */
    scatterCountProb: number[];
    triggerProb: number;
    /** 每次觸發的期望免費旋轉次數（含重觸發） */
    expectedFreeSpins: number;
    /** 每次觸發的期望倍數總和；乘上 baseRtp 即為每次觸發的期望贏分 */
    expectedMultiplierSum: number;
    freeRtp: number;
    totalRtp: number;
}

function bestLinePay(cells: readonly SymbolId[]): [PayingSymbolId | null, number] {
    let bestSymbol: PayingSymbolId | null = null;
    let bestPay = 0;
    for (const symbol of PAYING_SYMBOLS) {
        let count = 0;
        while (count < cells.length && (cells[count] === symbol || cells[count] === 'WILD')) count++;
        const pay = linePayMultiplier(symbol, count);
        if (pay > bestPay) {
            bestPay = pay;
            bestSymbol = symbol;
        }
    }
    return [bestSymbol, bestPay];
}

export interface Retrigger {
    spins: number;
    prob: number;
}

/**
 * 從 initialSpins 次免費旋轉開始，計算「倍數總和」與「旋轉次數」的期望值。
 * 第 i 次旋轉（1-based）的倍數 = min(起始倍數 + i - 1, 上限)。
 * 旋轉是否發生只取決於先前的結果，與該次贏分獨立，故 E[Σ m_i·W_i] = E[W]·Σ m_i·P(N ≥ i)。
 */
export function freeSpinExpectations(initialSpins: number, retriggers: readonly Retrigger[]): { multiplierSum: number; spins: number } {
    // 每次旋轉期望追加的次數 ≥ 1 時，免費遊戲期望長度發散
    if (retriggers.reduce((s, r) => s + r.prob * r.spins, 0) >= 1) return { multiplierSum: Infinity, spins: Infinity };

    const pNone = 1 - retriggers.reduce((s, r) => s + r.prob, 0);
    let dist = new Map<number, number>([[initialSpins, 1]]);
    let multiplierSum = 0;
    let spins = 0;

    for (let i = 1; i < 100_000; i++) {
        let alive = 0;
        for (const p of dist.values()) alive += p;
        if (alive < 1e-13) break;

        spins += alive;
        multiplierSum += Math.min(FREE_SPIN_START_MULTIPLIER + i - 1, FREE_SPIN_MAX_MULTIPLIER) * alive;

        const next = new Map<number, number>();
        const add = (remaining: number, p: number) => {
            if (remaining > 0 && p > 1e-18) next.set(remaining, (next.get(remaining) ?? 0) + p);
        };
        for (const [remaining, p] of dist) {
            add(remaining - 1, p * pNone);
            for (const r of retriggers) add(remaining - 1 + r.spins, p * r.prob);
        }
        dist = next;
    }
    return { multiplierSum, spins };
}

export function analyzeCompositions(comps: readonly Composition[]): Analysis {
    if (comps.length !== REEL_COUNT) throw new Error(`expected ${REEL_COUNT} compositions`);
    const reelProbs = comps.map((comp) => {
        const len = stripLength(comp);
        return (Object.entries(comp) as [SymbolId, number][]).filter(([, n]) => n > 0).map(([s, n]) => [s, n / len] as const);
    });

    // ── 單線期望賠付（線注倍數）
    const lineRtpBySymbol = Object.fromEntries(PAYING_SYMBOLS.map((s) => [s, 0])) as Record<PayingSymbolId, number>;
    let lineRtp = 0;
    const cells: SymbolId[] = new Array(REEL_COUNT);
    const walk = (reel: number, p: number): void => {
        if (reel === REEL_COUNT) {
            const [symbol, pay] = bestLinePay(cells);
            if (symbol) {
                lineRtp += p * pay;
                lineRtpBySymbol[symbol] += p * pay;
            }
            return;
        }
        for (const [symbol, q] of reelProbs[reel]) {
            cells[reel] = symbol;
            walk(reel + 1, p * q);
        }
    };
    walk(0, 1);
    // 25 條線 × 線注(總注/25) → 以總注計的線贏分期望值恰好等於單線的線注倍數期望值

    // ── SCATTER 數量分佈
    let scatterCountProb = [1];
    for (const comp of comps) {
        const len = stripLength(comp);
        const n = comp.SCATTER ?? 0;
        if (n * ROW_COUNT > len) throw new Error('too many scatters for the exact scatter model');
        const q = (n * ROW_COUNT) / len;
        const next = new Array(scatterCountProb.length + 1).fill(0);
        scatterCountProb.forEach((p, k) => {
            next[k] += p * (1 - q);
            next[k + 1] += p * q;
        });
        scatterCountProb = next;
    }
    const scatterRtp = scatterCountProb.reduce((s, p, k) => s + p * scatterPayMultiplier(k), 0);
    const baseRtp = lineRtp + scatterRtp;

    // ── 免費遊戲
    const retriggers: Retrigger[] = scatterCountProb
        .map((prob, k) => ({ spins: freeSpinsForScatter(k), prob }))
        .filter((r) => r.spins > 0);
    const triggerProb = retriggers.reduce((s, r) => s + r.prob, 0);

    let freeRtp = 0;
    let weightedSpins = 0;
    let weightedMultiplier = 0;
    for (const trigger of retriggers) {
        const e = freeSpinExpectations(trigger.spins, retriggers);
        freeRtp += trigger.prob * baseRtp * e.multiplierSum;
        weightedSpins += trigger.prob * e.spins;
        weightedMultiplier += trigger.prob * e.multiplierSum;
    }

    return {
        lineRtp,
        lineRtpBySymbol,
        scatterRtp,
        baseRtp,
        scatterCountProb,
        triggerProb,
        expectedFreeSpins: triggerProb > 0 ? weightedSpins / triggerProb : 0,
        expectedMultiplierSum: triggerProb > 0 ? weightedMultiplier / triggerProb : 0,
        freeRtp,
        totalRtp: baseRtp + freeRtp,
    };
}

export function analyzeStrips(strips: ReelStrips): Analysis {
    return analyzeCompositions(strips.map(compositionOf));
}
