/**
 * Reel strip 設計規則檢查，供 tune-strips 與單元測試共用。
 */
import { HIGH_SYMBOLS, REEL_COUNT } from '../../assets/scripts/core/config';
import type { ReelStrips, SymbolId } from '../../assets/scripts/core/types';

export const STRIP_RULES = {
    minLength: 50,
    maxLength: 60,
    maxScattersPerStrip: 2,
    minScatterSpacing: 8,
    scatterForbiddenReels: [0],
    wildReels: [1, 2, 3],
    /** BONUS 最多連續 2 格：停輪時不會出現整欄 BONUS */
    maxBonusRun: 2,
    /** 兩組 BONUS 之間至少相隔 2 格：一個視窗只會碰到一組，BONUS 數量分佈的精確解析依賴此規則 */
    minBonusGap: 2,
} as const;

export function highDensity(strip: readonly SymbolId[]): number {
    return strip.filter((s) => (HIGH_SYMBOLS as readonly SymbolId[]).includes(s)).length / strip.length;
}

/** 循環 strip 上每一段連續 BONUS 的起點與長度 */
export function bonusRuns(strip: readonly SymbolId[]): { start: number; length: number }[] {
    const n = strip.length;
    const anchor = strip.findIndex((s) => s !== 'BONUS');
    if (anchor < 0) return n > 0 ? [{ start: 0, length: n }] : [];
    const runs: { start: number; length: number }[] = [];
    for (let d = 1; d <= n; d++) {
        const i = (anchor + d) % n;
        if (strip[i] !== 'BONUS') continue;
        if (strip[(i - 1 + n) % n] === 'BONUS') runs[runs.length - 1].length++;
        else runs.push({ start: i, length: 1 });
    }
    return runs;
}

/** 回傳所有違規描述；空陣列代表通過。 */
export function validateStrips(strips: ReelStrips): string[] {
    const errors: string[] = [];
    if (strips.length !== REEL_COUNT) errors.push(`expected ${REEL_COUNT} strips, got ${strips.length}`);

    strips.forEach((strip, reel) => {
        const tag = `reel ${reel}`;
        if (strip.length < STRIP_RULES.minLength || strip.length > STRIP_RULES.maxLength) {
            errors.push(`${tag}: length ${strip.length} outside ${STRIP_RULES.minLength}~${STRIP_RULES.maxLength}`);
        }

        const scatterIdx = strip.flatMap((s, i) => (s === 'SCATTER' ? [i] : []));
        if (scatterIdx.length > STRIP_RULES.maxScattersPerStrip) errors.push(`${tag}: ${scatterIdx.length} scatters`);
        if (scatterIdx.length > 0 && (STRIP_RULES.scatterForbiddenReels as readonly number[]).includes(reel)) {
            errors.push(`${tag}: scatter not allowed`);
        }
        for (let i = 0; i < scatterIdx.length; i++) {
            if (scatterIdx.length < 2) break;
            const a = scatterIdx[i];
            const b = scatterIdx[(i + 1) % scatterIdx.length];
            const gap = (b - a + strip.length) % strip.length;
            if (gap < STRIP_RULES.minScatterSpacing) errors.push(`${tag}: scatters at ${a} and ${b} are ${gap} apart`);
        }

        if (strip.includes('WILD') && !(STRIP_RULES.wildReels as readonly number[]).includes(reel)) {
            errors.push(`${tag}: wild not allowed`);
        }

        const runs = bonusRuns(strip);
        runs.forEach((run, i) => {
            if (run.length > STRIP_RULES.maxBonusRun) errors.push(`${tag}: ${run.length} BONUS in a row at ${run.start}`);
            if (runs.length < 2) return;
            const next = runs[(i + 1) % runs.length];
            const gap = (next.start - (run.start + run.length) + strip.length) % strip.length;
            if (gap < STRIP_RULES.minBonusGap) errors.push(`${tag}: BONUS groups at ${run.start} and ${next.start} are ${gap} apart`);
        });
    });

    if (strips.length === REEL_COUNT && highDensity(strips[REEL_COUNT - 1]) > highDensity(strips[0])) {
        errors.push('high symbol density on the rightmost reel exceeds the leftmost reel');
    }
    return errors;
}
