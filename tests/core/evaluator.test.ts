import { describe, expect, it } from 'vitest';
import { evaluateLine, evaluateLines, evaluateScatter, evaluateSpin } from '../../assets/scripts/core/evaluator';
import { PAYTABLE } from '../../assets/scripts/core/paytable';
import { gridFromRows, quietGrid } from './helpers';

const LINE_BET = 4;
const TOTAL_BET = LINE_BET * 25;

describe('evaluateLine / evaluateLines', () => {
  it('底盤不產生任何中獎', () => {
    expect(evaluateLines(quietGrid(), LINE_BET)).toEqual([]);
    expect(evaluateScatter(quietGrid(), TOTAL_BET)).toBeNull();
  });

  it('中線 3 連', () => {
    const grid = quietGrid([[0, 1, 'J'], [1, 1, 'J'], [2, 1, 'J']]);
    const wins = evaluateLines(grid, LINE_BET);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toEqual({
      lineIndex: 0,
      symbol: 'J',
      matchCount: 3,
      positions: [[0, 1], [1, 1], [2, 1]],
      payout: PAYTABLE.J[0] * LINE_BET,
    });
  });

  it('4 連與 5 連', () => {
    const four = quietGrid([[0, 0, 'K'], [1, 0, 'K'], [2, 0, 'K'], [3, 0, 'K']]);
    const fourWin = evaluateLine(four, 1, LINE_BET);
    expect(fourWin?.matchCount).toBe(4);
    expect(fourWin?.payout).toBe(PAYTABLE.K[1] * LINE_BET);

    const five = quietGrid([[0, 2, 'H3'], [1, 2, 'H3'], [2, 2, 'H3'], [3, 2, 'H3'], [4, 2, 'H3']]);
    const fiveWin = evaluateLine(five, 2, LINE_BET);
    expect(fiveWin?.matchCount).toBe(5);
    expect(fiveWin?.payout).toBe(PAYTABLE.H3[2] * LINE_BET);
  });

  it('必須從最左欄開始，中斷即停止', () => {
    const grid = gridFromRows(['H1 H2 H3 A K', 'Q J J J J', 'H1 H2 H3 A K']);
    expect(evaluateLine(grid, 0, LINE_BET)).toBeNull();
  });

  it('WILD 替代一般符號參與連線', () => {
    const grid = quietGrid([[0, 1, 'A'], [1, 1, 'WILD'], [2, 1, 'A'], [3, 1, 'WILD']]);
    const win = evaluateLine(grid, 0, LINE_BET);
    expect(win?.symbol).toBe('A');
    expect(win?.matchCount).toBe(4);
    expect(win?.positions).toEqual([[0, 1], [1, 1], [2, 1], [3, 1]]);
  });

  it('WILD 不替代 SCATTER，SCATTER 會中斷連線', () => {
    const grid = quietGrid([[0, 1, 'J'], [1, 1, 'WILD'], [2, 1, 'SCATTER'], [3, 1, 'J']]);
    expect(evaluateLine(grid, 0, LINE_BET)).toBeNull();
  });

  it('WILD 造成多種可能時，取該線最高賠付（而非最長連線）', () => {
    // WILD WILD WILD K H3：K 四連 = 8，H3 三連 = 12 → 取 H3
    const grid = gridFromRows(['H1 A H1 A H1', 'WILD WILD WILD K H3', 'H2 Q H2 Q H2']);
    const win = evaluateLine(grid, 0, LINE_BET);
    expect(win?.symbol).toBe('H3');
    expect(win?.matchCount).toBe(3);
    expect(win?.payout).toBe(PAYTABLE.H3[0] * LINE_BET);
  });

  it('WILD 延伸出更長的連線時取較高者', () => {
    // WILD WILD WILD H3 J：H3 四連 = 50，J 三連 = 2 → 取 H3 四連
    const grid = gridFromRows(['H1 A H1 A H1', 'WILD WILD WILD H3 J', 'H2 Q H2 Q H2']);
    const win = evaluateLine(grid, 0, LINE_BET);
    expect(win?.symbol).toBe('H3');
    expect(win?.matchCount).toBe(4);
  });

  it('多條線同時中獎且各自獨立計算', () => {
    // 上列與中列皆為 Q：只經過第 0、1 列的線都是五連；
    // [0,0,1,2,2] 在第 3 欄進入下列而中斷，成立三連；其餘線在前三欄就碰到下列，不中獎。
    const grid = gridFromRows(['Q Q Q Q Q', 'Q Q Q Q Q', 'H1 H2 H3 A K']);
    const wins = evaluateLines(grid, LINE_BET);
    const byLine = new Map(wins.map((w) => [w.lineIndex, w]));
    for (const line of [0, 1, 5, 7, 9, 11, 13, 15]) expect(byLine.get(line)?.matchCount).toBe(5);
    expect(byLine.get(19)?.matchCount).toBe(3);
    expect(byLine.has(3)).toBe(false); // [0,1,2,1,0] 第 2 欄為 H3
    expect([...byLine.keys()].sort((a, b) => a - b)).toEqual([0, 1, 5, 7, 9, 11, 13, 15, 19]);
    for (const win of wins) expect(win.payout).toBe(PAYTABLE.Q[win.matchCount - 3] * LINE_BET);
  });
});

describe('evaluateScatter', () => {
  const withScatters = (n: number) => quietGrid(Array.from({ length: n }, (_, reel) => [reel, (reel * 2) % 3, 'SCATTER'] as [number, number, 'SCATTER']));

  it('2 個 SCATTER 不賠付', () => {
    expect(evaluateScatter(withScatters(2), TOTAL_BET)).toBeNull();
  });

  it.each([
    [3, 2, 10],
    [4, 10, 15],
    [5, 50, 20],
  ])('%i 個 SCATTER → %i 倍總注、%i 次免費旋轉', (count, multiple, spins) => {
    const win = evaluateScatter(withScatters(count), TOTAL_BET);
    expect(win).not.toBeNull();
    expect(win?.count).toBe(count);
    expect(win?.positions).toHaveLength(count);
    expect(win?.payout).toBe(multiple * TOTAL_BET);
    expect(win?.freeSpinsAwarded).toBe(spins);
  });

  it('SCATTER 不受 payline 限制', () => {
    const grid = quietGrid([[0, 0, 'SCATTER'], [2, 2, 'SCATTER'], [4, 1, 'SCATTER']]);
    expect(evaluateScatter(grid, TOTAL_BET)?.count).toBe(3);
  });
});

describe('evaluateSpin', () => {
  it('總贏分 = (線贏分 + scatter 贏分) × 倍數', () => {
    const grid = quietGrid([[0, 1, 'J'], [1, 1, 'J'], [2, 1, 'J'], [0, 0, 'SCATTER'], [3, 0, 'SCATTER'], [4, 2, 'SCATTER']]);
    const result = evaluateSpin(grid, TOTAL_BET, 3);
    const lineSum = result.lineWins.reduce((s, w) => s + w.payout, 0);
    expect(lineSum).toBe(PAYTABLE.J[0] * LINE_BET);
    expect(result.scatterWin?.payout).toBe(2 * TOTAL_BET);
    expect(result.totalWin).toBe((lineSum + 2 * TOTAL_BET) * 3);
  });
});
