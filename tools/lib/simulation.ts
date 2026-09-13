/**
 * 蒙地卡羅模擬：直接驅動遊戲實際使用的 SlotEngine。
 */
import { createRandom } from '../../assets/scripts/core/rng';
import { SlotEngine } from '../../assets/scripts/core/slotEngine';
import type { ReelStrips } from '../../assets/scripts/core/types';

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
    /** 只統計命中率等輕量指標時可略過直方圖 */
    onProgress?: (done: number) => void;
}

export interface SimulationStats {
    spins: number;
    seed: number;
    bet: number;
    totalWagered: number;
    baseWin: number;
    freeWin: number;
    hits: number;
    triggers: number;
    retriggers: number;
    freeSpinsPlayed: number;
    histogram: number[];
    /** 單次付費 spin（含其觸發的整輪免費遊戲）的最大贏分 */
    maxWin: number;
    rtp: number;
    baseRtp: number;
    freeRtp: number;
    hitFrequency: number;
    /** 平均幾次 spin 觸發一次免費遊戲 */
    triggerInterval: number;
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

    let baseWin = 0;
    let freeWin = 0;
    let hits = 0;
    let triggers = 0;
    let retriggers = 0;
    let freeSpinsPlayed = 0;
    let maxWin = 0;
    let sumReturn = 0;
    let sumSquares = 0;
    const started = Date.now();

    for (let i = 0; i < spins; i++) {
        const result = engine.spin(bet);
        baseWin += result.totalWin;
        if (result.totalWin > 0) hits++;
        let spinWin = result.totalWin;

        if (engine.isInFreeSpin()) {
            triggers++;
            while (engine.isInFreeSpin()) {
                const free = engine.spinFree(bet);
                freeSpinsPlayed++;
                freeWin += free.totalWin;
                spinWin += free.totalWin;
                if (free.scatterWin) retriggers++;
            }
        }

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
        hits,
        triggers,
        retriggers,
        freeSpinsPlayed,
        histogram,
        maxWin,
        rtp: (baseWin + freeWin) / totalWagered,
        baseRtp: baseWin / totalWagered,
        freeRtp: freeWin / totalWagered,
        hitFrequency: hits / spins,
        triggerInterval: triggers > 0 ? spins / triggers : Infinity,
        stdDev,
        rtpCi95: (1.96 * stdDev) / Math.sqrt(spins),
        elapsedMs: Date.now() - started,
    };
}
