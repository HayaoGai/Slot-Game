import { describe, expect, it } from 'vitest';
import { ALL_SYMBOLS } from '../../assets/scripts/core/config';
import { REEL_STRIPS } from '../../assets/scripts/core/reelStrips';
import type { SymbolId } from '../../assets/scripts/core/types';
import { validateStrips } from '../../tools/lib/strip-rules';

describe('REEL_STRIPS', () => {
  it('符合 strip 設計規則', () => {
    expect(validateStrips(REEL_STRIPS)).toEqual([]);
  });

  it('只包含合法符號', () => {
    for (const strip of REEL_STRIPS) for (const s of strip) expect(ALL_SYMBOLS).toContain(s);
  });

  it('規則檢查能抓出違規', () => {
    const bad: SymbolId[][] = REEL_STRIPS.map((s) => [...s]);
    bad[0][0] = 'SCATTER';
    bad[4][1] = 'WILD';
    bad[2][0] = 'SCATTER';
    bad[2][2] = 'SCATTER';
    const errors = validateStrips(bad);
    expect(errors.some((e) => e.includes('reel 0: scatter not allowed'))).toBe(true);
    expect(errors.some((e) => e.includes('reel 4: wild not allowed'))).toBe(true);
    expect(errors.some((e) => e.startsWith('reel 2:'))).toBe(true);
  });

  it('規則檢查能抓出 BONUS 連續 3 格與兩組間隔不足', () => {
    const bad: SymbolId[][] = REEL_STRIPS.map((s) => s.filter((symbol) => symbol !== 'BONUS'));
    bad[1].splice(10, 0, 'BONUS', 'BONUS', 'BONUS');
    bad[3].splice(10, 0, 'BONUS', 'BONUS', 'J', 'BONUS');
    const errors = validateStrips(bad);
    expect(errors.some((e) => e.startsWith('reel 1:') && e.includes('3 BONUS in a row'))).toBe(true);
    expect(errors.some((e) => e.startsWith('reel 3:') && e.includes('1 apart'))).toBe(true);
  });

  it('BONUS 組跨越 strip 首尾時仍視為同一組', () => {
    const strips: SymbolId[][] = REEL_STRIPS.map((s) => s.filter((symbol) => symbol !== 'BONUS'));
    strips[0] = ['BONUS', ...strips[0].slice(1, -1), 'BONUS'];
    expect(validateStrips(strips).filter((e) => e.includes('BONUS'))).toEqual([]);
  });
});
