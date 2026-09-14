/**
 * Reel strip 的精確 RTP 解析（非抽樣）。
 *
 * 關鍵觀察：每條 payline 在每一欄只取一格，而每一格的符號邊際分佈就是該 strip 的組成比例，
 * 且各欄停輪彼此獨立。因此單線期望賠付只取決於「各欄符號組成」，與排列順序無關，
 * 可以直接列舉 10^5 種符號組合精確計算。
 *
 * SCATTER 在 strip 上間隔至少 3 格（實際規則為 8 格），同一欄視窗最多一個，
 * 每欄出現機率 = 數量 × 3 / 長度，跨欄做卷積即可得到全盤面數量分佈。
 *
 * BONUS 以 2 格一組排列，組與組之間至少相隔 2 格，一個視窗只會碰到一組：
 * 每組讓 4 個停輪位置分別看到 1、2、2、1 個 BONUS，落單的 1 格則讓 3 個位置各看到 1 個。
 * 由此得到每欄視窗的 BONUS 數量分佈，跨欄卷積即為全盤面數量分佈。
 *
 * Hold & Spin 以「已鎖定格數 × 剩餘重轉次數」為狀態做動態規劃，求出結束時的格數分佈。
 * 每顆 BONUS 的獎項彼此獨立、且與格數無關，因此期望贏分 = 期望格數 × 單顆期望值 + 填滿機率 × GRAND。
 *
 * 各項回報只需要各自的邊際分佈：總 RTP = 線贏分 + SCATTER + 免費遊戲 + Hold & Spin，依期望值線性相加。
 */
import {
    CELL_COUNT,
    FREE_SPIN_MAX_MULTIPLIER,
    FREE_SPIN_START_MULTIPLIER,
    HOLD_SPIN_RESPINS,
    HOLD_SPIN_TRIGGER,
    PAYING_SYMBOLS,
    REEL_COUNT,
    ROW_COUNT,
} from '../../assets/scripts/core/config';
import {
    BONUS_PRIZE_TOTAL_WEIGHT,
    BONUS_PRIZES,
    bonusMultiple,
    freeSpinsForScatter,
    JACKPOT_MULTIPLIERS,
    linePayMultiplier,
    RESPIN_BONUS_CHANCE,
    scatterPayMultiplier,
} from '../../assets/scripts/core/paytable';
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
    /** 單次 spin 線贏分 + SCATTER 的期望回報（總注倍數），同時也是免費遊戲 x1 時的期望回報 */
    baseRtp: number;
    /** scatterCountProb[k] = 全盤面恰好 k 個 SCATTER 的機率 */
    scatterCountProb: number[];
    triggerProb: number;
    /** 每次觸發的期望免費旋轉次數（含重觸發） */
    expectedFreeSpins: number;
    /** 每次觸發的期望倍數總和；乘上 baseRtp 即為每次觸發的期望線贏分 + SCATTER */
    expectedMultiplierSum: number;
    /** 免費遊戲中的線贏分與 SCATTER（不含期間觸發的 Hold & Spin） */
    freeRtp: number;
    /** bonusCountProb[c] = 全盤面恰好 c 個 BONUS 的機率 */
    bonusCountProb: number[];
    /** 單次 spin（一般或免費）觸發 Hold & Spin 的機率 */
    holdSpinTriggerProb: number;
    /** 每次觸發結束時的期望 BONUS 數量 */
    expectedFinalBonus: number;
    /** 每次觸發填滿 15 格（獲得 GRAND）的機率 */
    grandProb: number;
    /** 每次觸發的期望贏分（總注倍數） */
    holdSpinPrize: number;
    /** 所有 Hold & Spin 贏分（含免費遊戲中觸發者） */
    holdSpinRtp: number;
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

/** 依 strip-builder 的 BONUS 排列規則，由組成推得單欄視窗的 BONUS 數量分佈 [P(0), P(1), P(2), P(3)] */
export function bonusWindowModel(comp: Composition): number[] {
    const len = stripLength(comp);
    const n = comp.BONUS ?? 0;
    const pairs = Math.floor(n / 2);
    const singles = n % 2;
    const one = (2 * pairs + 3 * singles) / len;
    const two = (2 * pairs) / len;
    if (one + two > 1) throw new Error('too many BONUS symbols for the window model');
    return [1 - one - two, one, two, 0];
}

/** 直接列舉 strip 的每個停輪位置，得到單欄視窗的 BONUS 數量分佈 */
export function bonusWindowProbs(strip: readonly SymbolId[]): number[] {
    const counts = new Array<number>(ROW_COUNT + 1).fill(0);
    for (let stop = 0; stop < strip.length; stop++) {
        let bonus = 0;
        for (let row = 0; row < ROW_COUNT; row++) if (strip[(stop + row) % strip.length] === 'BONUS') bonus++;
        counts[bonus]++;
    }
    return counts.map((n) => n / strip.length);
}

function binomial(n: number, k: number): number {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
}

export interface HoldSpinOutcome {
    /** finalCountProb[k] = 結束時恰好鎖定 k 格的機率 */
    finalCountProb: number[];
    expectedFinal: number;
    fullProb: number;
}

/** 從 start 格已鎖定、剩餘 respins 次開始，求 Hold & Spin 結束時的鎖定格數分佈。 */
export function holdSpinOutcome(start: number, landChance = RESPIN_BONUS_CHANCE, cells = CELL_COUNT, respins = HOLD_SPIN_RESPINS): HoldSpinOutcome {
    const memo = new Map<number, number[]>();
    const solve = (locked: number, left: number): number[] => {
        if (locked >= cells || left === 0) {
            const done = new Array<number>(cells + 1).fill(0);
            done[Math.min(locked, cells)] = 1;
            return done;
        }
        const key = locked * (respins + 1) + left;
        const cached = memo.get(key);
        if (cached) return cached;

        const open = cells - locked;
        const out = new Array<number>(cells + 1).fill(0);
        for (let landed = 0; landed <= open; landed++) {
            const p = binomial(open, landed) * landChance ** landed * (1 - landChance) ** (open - landed);
            // 沒有新 BONUS：次數減一；有新 BONUS：鎖定並重設次數
            const next = landed === 0 ? solve(locked, left - 1) : solve(locked + landed, respins);
            for (let k = 0; k <= cells; k++) out[k] += p * next[k];
        }
        memo.set(key, out);
        return out;
    };

    const finalCountProb = solve(start, respins);
    return {
        finalCountProb,
        expectedFinal: finalCountProb.reduce((s, p, k) => s + p * k, 0),
        fullProb: finalCountProb[cells],
    };
}

/** 單顆 BONUS 的期望獎項（總注倍數） */
export function bonusPrizeExpectation(): number {
    return BONUS_PRIZES.reduce((s, entry) => s + entry.weight * bonusMultiple(entry.prize), 0) / BONUS_PRIZE_TOTAL_WEIGHT;
}

/**
 * @param bonusWindows 每欄視窗的 BONUS 數量分佈；省略時依 strip-builder 的排列規則由組成推得
 */
export function analyzeCompositions(comps: readonly Composition[], bonusWindows: readonly (readonly number[])[] = comps.map(bonusWindowModel)): Analysis {
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

    // ── 免費遊戲（線贏分與 SCATTER）
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

    // ── BONUS 數量分佈與 Hold & Spin
    let bonusCountProb = [1];
    for (const windows of bonusWindows) {
        const next = new Array<number>(bonusCountProb.length + windows.length - 1).fill(0);
        bonusCountProb.forEach((p, k) => windows.forEach((q, j) => (next[k + j] += p * q)));
        bonusCountProb = next;
    }
    const prizeEv = bonusPrizeExpectation();
    let holdSpinTriggerProb = 0;
    let holdSpinPerSpin = 0;
    let finalSum = 0;
    let grandSum = 0;
    bonusCountProb.forEach((p, count) => {
        if (count < HOLD_SPIN_TRIGGER || p <= 0) return;
        const outcome = holdSpinOutcome(count);
        holdSpinTriggerProb += p;
        holdSpinPerSpin += p * (outcome.expectedFinal * prizeEv + outcome.fullProb * JACKPOT_MULTIPLIERS.GRAND);
        finalSum += p * outcome.expectedFinal;
        grandSum += p * outcome.fullProb;
    });
    // 每次付費 spin 平均帶來 weightedSpins 次免費旋轉，每一轉都能觸發 Hold & Spin
    const holdSpinRtp = holdSpinPerSpin * (1 + weightedSpins);

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
        bonusCountProb,
        holdSpinTriggerProb,
        expectedFinalBonus: holdSpinTriggerProb > 0 ? finalSum / holdSpinTriggerProb : 0,
        grandProb: holdSpinTriggerProb > 0 ? grandSum / holdSpinTriggerProb : 0,
        holdSpinPrize: holdSpinTriggerProb > 0 ? holdSpinPerSpin / holdSpinTriggerProb : 0,
        holdSpinRtp,
        totalRtp: baseRtp + freeRtp + holdSpinRtp,
    };
}

/** 以實際 strip 分析：BONUS 視窗分佈直接列舉停輪位置，不依賴排列規則 */
export function analyzeStrips(strips: ReelStrips): Analysis {
    return analyzeCompositions(strips.map(compositionOf), strips.map(bonusWindowProbs));
}
