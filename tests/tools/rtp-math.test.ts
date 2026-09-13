import { describe, expect, it } from 'vitest';
import { evaluateLines, evaluateScatter } from '../../assets/scripts/core/evaluator';
import { symbolsAt } from '../../assets/scripts/core/slotEngine';
import type { SymbolId } from '../../assets/scripts/core/types';
import { analyzeStrips, freeSpinExpectations } from '../../tools/lib/rtp-math';
import { arrangeStrip } from '../../tools/lib/strip-builder';

/** 以核心 evaluator 暴力列舉所有停輪組合，計算一般遊戲的精確 RTP。 */
function bruteForceBaseRtp(strips: SymbolId[][]): number {
  const bet = 25;
  let total = 0;
  let combos = 0;
  const stops = [0, 0, 0, 0, 0];
  const walk = (reel: number) => {
    if (reel === 5) {
      const grid = stops.map((s, r) => symbolsAt(strips[r], s));
      total += evaluateLines(grid, bet / 25).reduce((s, w) => s + w.payout, 0) + (evaluateScatter(grid, bet)?.payout ?? 0);
      combos++;
      return;
    }
    for (let s = 0; s < strips[reel].length; s++) {
      stops[reel] = s;
      walk(reel + 1);
    }
  };
  walk(0);
  return total / combos / bet;
}

describe('rtp-math', () => {
  it('精確解析與暴力列舉（使用遊戲實際的 evaluator）一致', () => {
    const strips: SymbolId[][] = [
      ['J', 'Q', 'K', 'H1', 'J', 'A', 'H3'],
      ['WILD', 'J', 'Q', 'SCATTER', 'K', 'H2', 'A', 'J'],
      ['K', 'WILD', 'H1', 'J', 'SCATTER', 'Q', 'A'],
      ['J', 'H3', 'Q', 'WILD', 'K', 'SCATTER', 'A'],
      ['H1', 'Q', 'SCATTER', 'J', 'K', 'A', 'H2'],
    ];
    const exact = analyzeStrips(strips);
    expect(exact.baseRtp).toBeCloseTo(bruteForceBaseRtp(strips), 10);
  });

  it('無重觸發時，10 次免費旋轉的倍數總和為 1+2+3+4+5×6 = 40', () => {
    const e = freeSpinExpectations(10, []);
    expect(e.multiplierSum).toBeCloseTo(40, 10);
    expect(e.spins).toBeCloseTo(10, 10);
  });

  it('重觸發會增加期望旋轉次數', () => {
    const e = freeSpinExpectations(10, [{ spins: 10, prob: 0.01 }]);
    // 幾何級數：E[N] = 10 / (1 - 10 × 0.01)
    expect(e.spins).toBeCloseTo(10 / 0.9, 6);
  });
});

describe('arrangeStrip', () => {
  it('保持組成不變並避免相鄰重複', () => {
    const comp = { J: 9, Q: 8, K: 8, A: 7, H1: 6, H2: 5, H3: 4, WILD: 3, SCATTER: 2 };
    const strip = arrangeStrip(comp, 3);
    expect(strip).toHaveLength(52);
    for (const [symbol, n] of Object.entries(comp)) expect(strip.filter((s) => s === symbol)).toHaveLength(n);
    strip.forEach((s, i) => expect(s).not.toBe(strip[(i + 1) % strip.length]));
  });
});
