/**
 * 蒙地卡羅模擬：直接驅動遊戲實際使用的 SlotEngine。
 */
import { createRandom } from '../../assets/scripts/core/rng';
import { SlotEngine } from '../../assets/scripts/core/slotEngine';
import type { BonusJackpotId, ReelStrips } from '../../assets/scripts/core/types';

export const HISTOGRAM_BUCKETS = [
    { label: '0x', test: (m: number) => m === 0 },
    { label: '0 – 1x', test: (m: number) => m > 0 && m < 1 },
    { label: '1 – 5x', test: (m: number) => m >= 1 && m < 5 },
    { label: '5 – 20x', test: (m: number) => m >= 5 && m < 20 },
    { label: '20 – 50x', test: (m: number) => m >= 20 && m < 50 },
    { label: '50x+', test: (m: number) => m >= 50 },
] as const;

export interface SimulationOptions {
    spins: number;
    seed: number;
    bet: number;
    strips?: ReelStrips;
    onProgress?: (done: number) => void;
}

export interface SimulationStats {
    spins: number;
    seed: number;
    bet: number;
    totalWagered: number;
    /** 一般遊戲的線贏分與 SCATTER */
    baseWin: number;
    /** 免費遊戲的線贏分與 SCATTER（已含倍數） */
    freeWin: number;
    /** 所有 Hold & Spin 贏分（含免費遊戲中觸發者） */
    holdWin: number;
    /** 付費 spin 的總回報（含其觸發的所有功能）> 0 的次數 */
    hits: number;
    triggers: number;
    retriggers: number;
    freeSpinsPlayed: number;
    /** 一般遊戲觸發 Hold & Spin 的次數 */
    holdSpinTriggers: number;
    /** 免費遊戲中觸發 Hold & Spin 的次數 */
    holdSpinTriggersInFree: number;
    respinsPlayed: number;
    /** 所有 Hold & Spin 結束時鎖定的 BONUS 數量加總 */
    holdSpinBonusTotal: number;
    grands: number;
    jackpots: Record<BonusJackpotId, number>;
    histogram: number[];
    /** 單次付費 spin（含其觸發的所有功能）的最大贏分 */
    maxWin: number;
    rtp: number;
    baseRtp: number;
    freeRtp: number;
    holdSpinRtp: number;
    hitFrequency: number;
    /** 平均幾次 spin 觸發一次免費遊戲 */
    triggerInterval: number;
    /** 平均幾次一般遊戲 spin 觸發一次 Hold & Spin */
    holdSpinInterval: number;
    /** 單次付費 spin 回報（總注倍數）的標準差 */
    stdDev: number;
    /** RTP 95% 信賴區間半寬 */
    rtpCi95: number;
    elapsedMs: number;
}

export function runSimulation(options: SimulationOptions): SimulationStats {
    const { spins, seed, bet } = options;
    const engine = options.strips ? new SlotEngine(createRandom(seed), options.strips) : new SlotEngine(createRandom(seed));
    const histogram = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0);
    const jackpots: Record<BonusJackpotId, number> = { MINI: 0, MINOR: 0, MAJOR: 0 };

    let baseWin = 0;
    let freeWin = 0;
    let holdWin = 0;
    let hits = 0;
    let triggers = 0;
    let retriggers = 0;
    let freeSpinsPlayed = 0;
    let holdSpinTriggers = 0;
    let holdSpinTriggersInFree = 0;
    let respinsPlayed = 0;
    let holdSpinBonusTotal = 0;
    let grands = 0;
    let maxWin = 0;
    let sumReturn = 0;
    let sumSquares = 0;
    const started = Date.now();

    /** 播完整個 Hold & Spin，回傳總贏分 */
    const playHoldSpin = (): number => {
        for (;;) {
            const respin = engine.respin();
            respinsPlayed++;
            if (!respin.finished) continue;
            holdWin += respin.totalWin;
            holdSpinBonusTotal += respin.locked.length;
            if (respin.grand) grands++;
            for (const cell of respin.locked) if (cell.prize.kind === 'jackpot') jackpots[cell.prize.jackpot]++;
            return respin.totalWin;
        }
    };

    for (let i = 0; i < spins; i++) {
        const result = engine.spin(bet);
        baseWin += result.totalWin;
        let spinWin = result.totalWin;

        // 同一轉同時觸發時，先進行 Hold & Spin 再進入免費遊戲（與遊戲流程相同）
        if (result.holdSpinTriggered) {
            holdSpinTriggers++;
            spinWin += playHoldSpin();
        }
        if (engine.isInFreeSpin()) {
            triggers++;
            while (engine.isInFreeSpin()) {
                const free = engine.spinFree(bet);
                freeSpinsPlayed++;
                freeWin += free.totalWin;
                spinWin += free.totalWin;
                if (free.scatterWin) retriggers++;
                if (free.holdSpinTriggered) {
                    holdSpinTriggersInFree++;
                    spinWin += playHoldSpin();
                }
            }
        }

        if (spinWin > 0) hits++;
        const multiple = spinWin / bet;
        sumReturn += multiple;
        sumSquares += multiple * multiple;
        if (spinWin > maxWin) maxWin = spinWin;
        const bucket = HISTOGRAM_BUCKETS.findIndex((b) => b.test(multiple));
        histogram[bucket]++;

        if (options.onProgress && (i + 1) % 100_000 === 0) options.onProgress(i + 1);
    }

    const totalWagered = spins * bet;
    const mean = sumReturn / spins;
    const stdDev = Math.sqrt(Math.max(0, sumSquares / spins - mean * mean));
    return {
        spins,
        seed,
        bet,
        totalWagered,
        baseWin,
        freeWin,
        holdWin,
        hits,
        triggers,
        retriggers,
        freeSpinsPlayed,
        holdSpinTriggers,
        holdSpinTriggersInFree,
        respinsPlayed,
        holdSpinBonusTotal,
        grands,
        jackpots,
        histogram,
        maxWin,
        rtp: (baseWin + freeWin + holdWin) / totalWagered,
        baseRtp: baseWin / totalWagered,
        freeRtp: freeWin / totalWagered,
        holdSpinRtp: holdWin / totalWagered,
        hitFrequency: hits / spins,
        triggerInterval: triggers > 0 ? spins / triggers : Infinity,
        holdSpinInterval: holdSpinTriggers > 0 ? spins / holdSpinTriggers : Infinity,
        stdDev,
        rtpCi95: (1.96 * stdDev) / Math.sqrt(spins),
        elapsedMs: Date.now() - started,
    };
}
