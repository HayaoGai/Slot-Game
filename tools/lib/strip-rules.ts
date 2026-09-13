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
} as const;

export function highDensity(strip: readonly SymbolId[]): number {
    return strip.filter((s) => (HIGH_SYMBOLS as readonly SymbolId[]).includes(s)).length / strip.length;
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
    });

    if (strips.length === REEL_COUNT && highDensity(strips[REEL_COUNT - 1]) > highDensity(strips[0])) {
        errors.push('high symbol density on the rightmost reel exceeds the leftmost reel');
    }
    return errors;
}
