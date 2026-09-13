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
});
