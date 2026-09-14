import { describe, expect, it } from 'vitest';
import { CELL_COUNT } from '../../assets/scripts/core/config';
import { evaluateLines, evaluateScatter } from '../../assets/scripts/core/evaluator';
import { bonusMultiple, JACKPOT_MULTIPLIERS } from '../../assets/scripts/core/paytable';
import { createRandom } from '../../assets/scripts/core/rng';
import { SlotEngine, symbolsAt } from '../../assets/scripts/core/slotEngine';
import type { SymbolId } from '../../assets/scripts/core/types';
import {
  analyzeStrips,
  bonusPrizeExpectation,
  bonusWindowModel,
  bonusWindowProbs,
  compositionOf,
  freeSpinExpectations,
  holdSpinOutcome,
} from '../../tools/lib/rtp-math';
import { arrangeStrip } from '../../tools/lib/strip-builder';

/** 以核心 evaluator 暴力列舉所有停輪組合，計算一般遊戲的精確 RTP 與 BONUS 數量分佈。 */
function bruteForce(strips: SymbolId[][]): { baseRtp: number; bonusCountProb: number[] } {
  const bet = 25;
  let total = 0;
  let combos = 0;
  const bonusCounts = new Array<number>(CELL_COUNT + 1).fill(0);
  const stops = [0, 0, 0, 0, 0];
  const walk = (reel: number) => {
    if (reel === 5) {
      const grid = stops.map((s, r) => symbolsAt(strips[r], s));
      total += evaluateLines(grid, bet / 25).reduce((s, w) => s + w.payout, 0) + (evaluateScatter(grid, bet)?.payout ?? 0);
      bonusCounts[grid.flat().filter((s) => s === 'BONUS').length]++;
      combos++;
      return;
    }
    for (let s = 0; s < strips[reel].length; s++) {
      stops[reel] = s;
      walk(reel + 1);
    }
  };
  walk(0);
  return { baseRtp: total / combos / bet, bonusCountProb: bonusCounts.map((n) => n / combos) };
}

/**
 * 以「每個未鎖定格各自落下與否」逐格列舉，與動態規劃的「落下格數服從二項分佈」是不同的推導，
 * 用來交叉驗證 holdSpinOutcome。
 */
function bruteForceHoldSpin(start: number, landChance: number, cells: number, respins: number): number[] {
  const dist = new Array<number>(cells + 1).fill(0);
  const walk = (locked: number, left: number, p: number) => {
    if (locked === cells || left === 0) {
      dist[locked] += p;
      return;
    }
    const open = cells - locked;
    for (let mask = 0; mask < 1 << open; mask++) {
      let landed = 0;
      let q = p;
      for (let i = 0; i < open; i++) {
        const hit = (mask >> i) & 1;
        landed += hit;
        q *= hit ? landChance : 1 - landChance;
      }
      walk(locked + landed, landed > 0 ? respins : left - 1, q);
    }
  };
  walk(start, respins, 1);
  return dist;
}

describe('rtp-math', () => {
  it('精確解析與暴力列舉（使用遊戲實際的 evaluator）一致', () => {
    const strips: SymbolId[][] = [
      ['J', 'BONUS', 'BONUS', 'Q', 'K', 'H1', 'J', 'A', 'H3'],
      ['WILD', 'J', 'Q', 'SCATTER', 'K', 'BONUS', 'H2', 'A', 'J'],
      ['K', 'WILD', 'H1', 'BONUS', 'BONUS', 'J', 'SCATTER', 'Q', 'A'],
      ['J', 'H3', 'Q', 'WILD', 'K', 'SCATTER', 'A', 'BONUS'],
      ['H1', 'Q', 'SCATTER', 'J', 'BONUS', 'BONUS', 'K', 'A', 'H2'],
    ];
    const exact = analyzeStrips(strips);
    const brute = bruteForce(strips);
    expect(exact.baseRtp).toBeCloseTo(brute.baseRtp, 10);
    exact.bonusCountProb.forEach((p, c) => expect(p).toBeCloseTo(brute.bonusCountProb[c] ?? 0, 10));
  });

  it('BONUS 視窗分佈：由組成推得的模型與依排列規則產生的實際 strip 一致', () => {
    for (const bonus of [4, 5, 6, 7]) {
      const comp = { J: 8, Q: 8, K: 7, A: 7, H1: 6, H2: 6, H3: 6, WILD: 2, SCATTER: 2, BONUS: bonus };
      const strip = arrangeStrip(comp, bonus, { H1: 2, H2: 2, H3: 2, BONUS: 2 });
      expect(compositionOf(strip)).toEqual(comp);
      bonusWindowModel(comp).forEach((p, k) => expect(p).toBeCloseTo(bonusWindowProbs(strip)[k], 12));
    }
  });

  it('Hold & Spin 動態規劃與逐格列舉一致', () => {
    for (const [start, landChance] of [[1, 0.3], [2, 0.55], [3, 0.1]] as const) {
      const dp = holdSpinOutcome(start, landChance, 5, 3);
      const brute = bruteForceHoldSpin(start, landChance, 5, 3);
      dp.finalCountProb.forEach((p, k) => expect(p).toBeCloseTo(brute[k], 12));
      expect(dp.fullProb).toBeCloseTo(brute[5], 12);
    }
  });

  it('Hold & Spin 期望值與引擎實際重轉的模擬結果一致', () => {
    // 前三欄每個視窗都恰好有 2 個 BONUS、後兩欄沒有：每一轉都以 6 個 BONUS 觸發
    const pair: SymbolId[] = ['BONUS', 'BONUS', 'J'];
    const plain: SymbolId[] = ['J', 'Q', 'K'];
    const engine = new SlotEngine(createRandom(31), [pair, pair, pair, plain, plain]);
    const bet = 100;
    const rounds = 40_000;
    let finalCount = 0;
    let collected = 0;
    for (let i = 0; i < rounds; i++) {
      engine.spin(bet);
      let respin = engine.respin();
      while (!respin.finished) respin = engine.respin();
      finalCount += respin.locked.length;
      collected += respin.collected;
    }

    const exact = holdSpinOutcome(6);
    expect(finalCount / rounds).toBeCloseTo(exact.expectedFinal, 1);
    const expectedCollected = exact.expectedFinal * bonusPrizeExpectation() * bet;
    expect(Math.abs(collected / rounds / expectedCollected - 1)).toBeLessThan(0.03);
  });

  it('單顆 BONUS 期望值為權重加權平均', () => {
    expect(bonusPrizeExpectation()).toBeGreaterThan(1);
    expect(bonusMultiple({ kind: 'jackpot', jackpot: 'MAJOR' })).toBe(JACKPOT_MULTIPLIERS.MAJOR);
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
