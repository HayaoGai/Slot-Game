import { describe, expect, it } from 'vitest';
import { CELL_COUNT, FREE_SPIN_MAX_MULTIPLIER, HOLD_SPIN_RESPINS } from '../../assets/scripts/core/config';
import { BONUS_PRIZES, JACKPOT_MULTIPLIERS, RESPIN_BONUS_CHANCE } from '../../assets/scripts/core/paytable';
import { createRandom } from '../../assets/scripts/core/rng';
import { REEL_STRIPS } from '../../assets/scripts/core/reelStrips';
import { SlotEngine } from '../../assets/scripts/core/slotEngine';
import type { BonusPrize, SymbolId } from '../../assets/scripts/core/types';
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

/** 依序播放任一種旋轉，供長時間的固定 seed 測試使用 */
function playNext(engine: SlotEngine) {
  if (engine.isInHoldSpin()) return engine.respin();
  return engine.isInFreeSpin() ? engine.spinFree(BET) : engine.spin(BET);
}

describe('SlotEngine.spin', () => {
  it('固定 seed 下結果可重現', () => {
    const a = new SlotEngine(createRandom(2024));
    const b = new SlotEngine(createRandom(2024));
    for (let i = 0; i < 2000; i++) expect(playNext(a)).toEqual(playNext(b));
  });

  it('盤面與 stopIndices 對應 reel strip 的連續三格', () => {
    const engine = new SlotEngine(createRandom(99));
    for (let i = 0; i < 300; i++) {
      if (engine.isInHoldSpin()) {
        engine.respin();
        continue;
      }
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
    for (let i = 0; i < 1000; i++) {
      if (engine.isInHoldSpin() || engine.isInFreeSpin()) {
        playNext(engine);
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

// ─── Hold & Spin ────────────────────────────────────────────────────────

/**
 * BONUS_STRIP：停輪 0 → [BONUS, BONUS, J]、停輪 1 → [BONUS, J, Q]、停輪 2 → 不含 BONUS。
 * COMBO_STRIP：停輪 0 → [SCATTER, BONUS, BONUS]、停輪 3 → 不含 SCATTER 與 BONUS。
 */
const BONUS_STRIP: SymbolId[] = ['BONUS', 'BONUS', 'J', 'Q', 'K', 'A', 'H1'];
const COMBO_STRIP: SymbolId[] = ['SCATTER', 'BONUS', 'BONUS', 'J', 'Q', 'K', 'A'];
const BONUS_STRIPS = [BONUS_STRIP, BONUS_STRIP, BONUS_STRIP, BONUS_STRIP, BONUS_STRIP];
const COMBO_STRIPS = [COMBO_STRIP, COMBO_STRIP, COMBO_STRIP, COMBO_STRIP, COMBO_STRIP];
/** 第 0~2 欄上兩列各一個 BONUS，共 6 個 */
const HOLD_TRIGGER = [0, 0, 0, 2, 2];
/** 其餘 9 個未鎖定格 */
const OPEN_CELLS = CELL_COUNT - 6;

/** scriptedRandom 的 next() = 值 / 1e6 */
const LAND = 0;
const MISS = Math.ceil(RESPIN_BONUS_CHANCE * 1_000_000);

/** 抽中指定獎項的 nextInt 值 */
function rollFor(prize: BonusPrize): number {
  let cumulative = 0;
  for (const entry of BONUS_PRIZES) {
    if (JSON.stringify(entry.prize) === JSON.stringify(prize)) return cumulative;
    cumulative += entry.weight;
  }
  throw new Error(`prize not in table: ${JSON.stringify(prize)}`);
}

const ONE_X = rollFor({ kind: 'cash', multiple: 1 });
const FIVE_X = rollFor({ kind: 'cash', multiple: 5 });
const MINI = rollFor({ kind: 'jackpot', jackpot: 'MINI' });
const repeat = (value: number, times: number) => new Array<number>(times).fill(value);

describe('Hold & Spin', () => {
  it('6 個 BONUS 觸發，並依欄、列順序為每個 BONUS 抽獎項', () => {
    const rolls = [ONE_X, ONE_X, FIVE_X, ONE_X, MINI, ONE_X];
    const engine = new SlotEngine(scriptedRandom([...HOLD_TRIGGER, ...rolls]), BONUS_STRIPS);
    const result = engine.spin(BET);

    expect(result.holdSpinTriggered).toBe(true);
    expect(result.bonusCells.map((c) => c.position)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]);
    expect(result.bonusCells.map((c) => c.payout)).toEqual([BET, BET, 5 * BET, BET, JACKPOT_MULTIPLIERS.MINI * BET, BET]);
    expect(engine.getHoldSpinState()).toMatchObject({ respinsLeft: HOLD_SPIN_RESPINS, respinsPlayed: 0, bet: BET, duringFreeSpin: false });
    expect(engine.getHoldSpinState()?.locked).toHaveLength(6);
  });

  it('5 個 BONUS 不觸發，但仍帶有獎項供顯示', () => {
    const engine = new SlotEngine(scriptedRandom([0, 0, 1, 2, 2, ...repeat(ONE_X, 5)]), BONUS_STRIPS);
    const result = engine.spin(BET);
    expect(result.holdSpinTriggered).toBe(false);
    expect(result.bonusCells).toHaveLength(5);
    expect(engine.isInHoldSpin()).toBe(false);
  });

  it('Hold & Spin 期間不可 spin / spinFree；未觸發時不可 respin', () => {
    expect(() => new SlotEngine(scriptedRandom([]), BONUS_STRIPS).respin()).toThrow();
    const engine = new SlotEngine(scriptedRandom([...HOLD_TRIGGER, ...repeat(ONE_X, 6)]), BONUS_STRIPS);
    engine.spin(BET);
    expect(() => engine.spin(BET)).toThrow();
    expect(() => engine.spinFree(BET)).toThrow();
  });

  it('有新 BONUS 落下時次數重設為 3，否則減一；次數用完即結束並結算', () => {
    const script = [
      ...HOLD_TRIGGER,
      ...repeat(ONE_X, 6),
      ...repeat(MISS, OPEN_CELLS), // 第 1 轉：沒有落下
      LAND, FIVE_X, ...repeat(MISS, OPEN_CELLS - 1), // 第 2 轉：第一個未鎖定格 [0, 2] 落下 5x
      ...repeat(MISS, OPEN_CELLS - 1), // 第 3 ~ 5 轉：沒有落下
      ...repeat(MISS, OPEN_CELLS - 1),
      ...repeat(MISS, OPEN_CELLS - 1),
    ];
    const engine = new SlotEngine(scriptedRandom(script), BONUS_STRIPS);
    engine.spin(BET);

    expect(engine.respin()).toMatchObject({ landed: [], respinsLeft: 2, finished: false, totalWin: 0 });

    const reset = engine.respin();
    expect(reset.landed).toEqual([{ position: [0, 2], prize: { kind: 'cash', multiple: 5 }, payout: 5 * BET }]);
    expect(reset).toMatchObject({ respinsLeft: HOLD_SPIN_RESPINS, finished: false, collected: 11 * BET });
    expect(reset.locked).toHaveLength(7);

    expect(engine.respin()).toMatchObject({ respinsLeft: 2, finished: false });
    expect(engine.respin()).toMatchObject({ respinsLeft: 1, finished: false });
    const last = engine.respin();
    expect(last).toMatchObject({ respinsLeft: 0, finished: true, grand: false, collected: 11 * BET, totalWin: 11 * BET });
    expect(engine.isInHoldSpin()).toBe(false);
    expect(engine.getHoldSpinState()).toBeNull();
  });

  it('填滿 15 格時立即結束並另得 GRAND', () => {
    const script = [...HOLD_TRIGGER, ...repeat(ONE_X, 6)];
    for (let i = 0; i < OPEN_CELLS; i++) script.push(LAND, ONE_X);
    const engine = new SlotEngine(scriptedRandom(script), BONUS_STRIPS);
    engine.spin(BET);

    const result = engine.respin();
    expect(result.landed).toHaveLength(OPEN_CELLS);
    expect(result).toMatchObject({ finished: true, grand: true, collected: CELL_COUNT * BET, totalWin: (CELL_COUNT + JACKPOT_MULTIPLIERS.GRAND) * BET });
    expect(engine.isInHoldSpin()).toBe(false);
  });

  it('免費遊戲中觸發：贏分不乘倍數，併入免費遊戲累積贏分，結束後繼續免費遊戲', () => {
    const script = [
      ...TRIGGER, // 一般遊戲觸發免費遊戲
      ...NO_TRIGGER, // 第 1 次免費旋轉（倍數 x1）
      4, 4, 4, 1, 1, ...repeat(ONE_X, 6), // 第 2 次免費旋轉（倍數 x2）出現 6 個 BONUS
      ...repeat(MISS, OPEN_CELLS * HOLD_SPIN_RESPINS),
    ];
    // 第 0~2 欄停輪 0 為 SCATTER；停輪 4 為兩個 BONUS
    const mixed: SymbolId[] = ['SCATTER', 'J', 'Q', 'K', 'BONUS', 'BONUS', 'A', 'H1', 'H2'];
    const engine = new SlotEngine(scriptedRandom(script), [mixed, mixed, mixed, PLAIN_STRIP, PLAIN_STRIP]);
    engine.spin(BET);
    const first = engine.spinFree(BET);
    const second = engine.spinFree(BET);

    expect(second.multiplier).toBe(2);
    expect(second.holdSpinTriggered).toBe(true);
    expect(engine.getHoldSpinState()?.duringFreeSpin).toBe(true);
    expect(() => engine.spinFree(BET)).toThrow();

    let respin = engine.respin();
    while (!respin.finished) respin = engine.respin();
    expect(respin.totalWin).toBe(6 * BET);
    expect(engine.isInFreeSpin()).toBe(true);
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 8, totalWin: first.totalWin + second.totalWin + 6 * BET });
  });

  it('同一轉同時觸發免費遊戲與 Hold & Spin：必須先完成 Hold & Spin', () => {
    const script = [0, 0, 0, 3, 3, ...repeat(ONE_X, 6), ...repeat(MISS, OPEN_CELLS * HOLD_SPIN_RESPINS)];
    const engine = new SlotEngine(scriptedRandom(script), COMBO_STRIPS);
    const result = engine.spin(BET);

    expect(result.scatterWin?.freeSpinsAwarded).toBe(10);
    expect(result.holdSpinTriggered).toBe(true);
    expect(() => engine.spinFree(BET)).toThrow();

    let respin = engine.respin();
    while (!respin.finished) respin = engine.respin();
    expect(engine.getFreeSpinState()).toMatchObject({ remaining: 10, totalWin: 0 });
    expect(engine.isInFreeSpin()).toBe(true);
  });
});
