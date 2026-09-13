import { describe, expect, it } from 'vitest';
import { FREE_SPIN_MAX_MULTIPLIER } from '../../assets/scripts/core/config';
import { createRandom } from '../../assets/scripts/core/rng';
import { REEL_STRIPS } from '../../assets/scripts/core/reelStrips';
import { SlotEngine } from '../../assets/scripts/core/slotEngine';
import type { SymbolId } from '../../assets/scripts/core/types';
import { scriptedRandom } from './helpers';

const BET = 100;

/**
 * 測試用 strip：第 0~2 欄 index 0 為 SCATTER。
 * 停輪 index 1 → 視窗 [J, Q, K]，不含 SCATTER；index 0 → 含 SCATTER。
 */
const SCATTER_STRIP: SymbolId[] = ['SCATTER', 'J', 'Q', 'K', 'A', 'H1', 'H2'];
const PLAIN_STRIP: SymbolId[] = ['J', 'Q', 'K', 'A', 'H1', 'H2', 'H3'];
const TEST_STRIPS = [SCATTER_STRIP, SCATTER_STRIP, SCATTER_STRIP, PLAIN_STRIP, PLAIN_STRIP];
const TRIGGER = [0, 0, 0, 1, 2]; // 三個 SCATTER
const NO_TRIGGER = [1, 1, 1, 1, 2];

describe('SlotEngine.spin', () => {
  it('固定 seed 下結果可重現', () => {
    const a = new SlotEngine(createRandom(2024));
    const b = new SlotEngine(createRandom(2024));
    for (let i = 0; i < 200; i++) {
      const ra = a.isInFreeSpin() ? a.spinFree(BET) : a.spin(BET);
      const rb = b.isInFreeSpin() ? b.spinFree(BET) : b.spin(BET);
      expect(ra).toEqual(rb);
    }
  });

  it('盤面與 stopIndices 對應 reel strip 的連續三格', () => {
    const engine = new SlotEngine(createRandom(99));
    for (let i = 0; i < 100; i++) {
      const result = engine.isInFreeSpin() ? engine.spinFree(BET) : engine.spin(BET);
      result.grid.forEach((column, reel) => {
        const strip = REEL_STRIPS[reel];
        const stop = result.stopIndices[reel];
        expect(column).toEqual([0, 1, 2].map((row) => strip[(stop + row) % strip.length]));
      });
    }
  });

  it('總贏分等於各線與 scatter 贏分加總（一般遊戲倍數為 1）', () => {
    const engine = new SlotEngine(createRandom(7));
    for (let i = 0; i < 500; i++) {
      if (engine.isInFreeSpin()) {
        engine.spinFree(BET);
        continue;
      }
      const r = engine.spin(BET);
      const sum = r.lineWins.reduce((s, w) => s + w.payout, 0) + (r.scatterWin?.payout ?? 0);
      expect(r.multiplier).toBe(1);
      expect(r.totalWin).toBe(sum);
    }
  });

  it('下注額必須可被 25 條線整除', () => {
    const engine = new SlotEngine(createRandom(1));
    expect(() => engine.spin(30)).toThrow();
  });
});

describe('免費遊戲', () => {
  it('3 個 SCATTER 觸發 10 次免費旋轉', () => {
    const engine = new SlotEngine(scriptedRandom(TRIGGER), TEST_STRIPS);
    const result = engine.spin(BET);
    expect(result.scatterWin?.freeSpinsAwarded).toBe(10);
    expect(engine.isInFreeSpin()).toBe(true);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 10, multiplier: 1, totalWin: 0 });
  });

  it('免費遊戲期間不可呼叫 spin()，非免費遊戲期間不可呼叫 spinFree()', () => {
    const idle = new SlotEngine(scriptedRandom([]), TEST_STRIPS);
    expect(() => idle.spinFree(BET)).toThrow();
    const engine = new SlotEngine(scriptedRandom(TRIGGER), TEST_STRIPS);
    engine.spin(BET);
    expect(() => engine.spin(BET)).toThrow();
  });

  it('免費遊戲下注額固定為觸發時的下注額', () => {
    const engine = new SlotEngine(scriptedRandom([...TRIGGER, ...NO_TRIGGER]), TEST_STRIPS);
    engine.spin(BET);
    expect(() => engine.spinFree(BET * 2)).toThrow();
  });

  it('倍數每次旋轉後 +1，上限 x5，並套用於贏分', () => {
    const stops = [...TRIGGER];
    for (let i = 0; i < 10; i++) stops.push(...NO_TRIGGER);
    const engine = new SlotEngine(scriptedRandom(stops), TEST_STRIPS);
    engine.spin(BET);

    const multipliers: number[] = [];
    let accumulated = 0;
    while (engine.isInFreeSpin()) {
      const r = engine.spinFree(BET);
      multipliers.push(r.multiplier);
      const base = r.lineWins.reduce((s, w) => s + w.payout, 0) + (r.scatterWin?.payout ?? 0);
      expect(r.totalWin).toBe(base * r.multiplier);
      accumulated += r.totalWin;
    }
    expect(multipliers).toEqual([1, 2, 3, 4, 5, 5, 5, 5, 5, 5]);
    expect(Math.max(...multipliers)).toBe(FREE_SPIN_MAX_MULTIPLIER);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 0, totalWin: accumulated });
  });

  it('重觸發追加次數且倍數不重置', () => {
    // 第 3 次免費旋轉再出現 3 個 SCATTER → 追加 10 次
    const stops = [...TRIGGER, ...NO_TRIGGER, ...NO_TRIGGER, ...TRIGGER];
    for (let i = 0; i < 17; i++) stops.push(...NO_TRIGGER);
    const engine = new SlotEngine(scriptedRandom(stops), TEST_STRIPS);
    engine.spin(BET);

    engine.spinFree(BET);
    engine.spinFree(BET);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 8, multiplier: 3 });

    const retrigger = engine.spinFree(BET);
    expect(retrigger.multiplier).toBe(3);
    expect(retrigger.scatterWin?.freeSpinsAwarded).toBe(10);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 17, multiplier: 4 });

    let spins = 0;
    while (engine.isInFreeSpin()) {
      engine.spinFree(BET);
      spins++;
    }
    expect(spins).toBe(17);
  });

  it('新一輪免費遊戲重置倍數與累積贏分', () => {
    const stops = [...TRIGGER];
    for (let i = 0; i < 10; i++) stops.push(...NO_TRIGGER);
    stops.push(...TRIGGER);
    const engine = new SlotEngine(scriptedRandom(stops), TEST_STRIPS);
    engine.spin(BET);
    while (engine.isInFreeSpin()) engine.spinFree(BET);
    engine.spin(BET);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 10, multiplier: 1, totalWin: 0 });
  });
});
