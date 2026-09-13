export interface IRandom {
    /** [0, 1) */
    next(): number;
    /** [0, maxExclusive) 的整數 */
    nextInt(maxExclusive: number): number;
}

/**
 * mulberry32：32-bit 狀態、速度快、分佈良好，足以支撐百萬次等級的模擬。
 * 可設定 seed，讓單元測試與模擬結果可重現。
 */
export function createRandom(seed: number): IRandom {
    let state = seed >>> 0;

    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const nextInt = (maxExclusive: number): number => {
        if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
            throw new RangeError(`nextInt() requires a positive integer, got ${maxExclusive}`);
        }
        return Math.floor(next() * maxExclusive);
    };

    return { next, nextInt };
}
