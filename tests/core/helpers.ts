import type { Grid, SymbolId } from '../../assets/scripts/core/types';
import type { IRandom } from '../../assets/scripts/core/rng';

/**
 * 以「由上到下三列」的文字描述建立盤面，例如：
 *   ['J Q K A H1', 'J J J A H1', 'H2 H3 A K Q']
 * 回傳 grid[reel][row]。
 */
export function gridFromRows(rows: [string, string, string]): Grid {
  const cells = rows.map((r) => r.trim().split(/\s+/) as SymbolId[]);
  cells.forEach((r) => {
    if (r.length !== 5) throw new Error(`row must have 5 symbols: ${r.join(' ')}`);
  });
  return [0, 1, 2, 3, 4].map((reel) => [cells[0][reel], cells[1][reel], cells[2][reel]]);
}

/**
 * 不會產生任何中獎的底盤：相鄰兩欄使用互斥的符號集合。
 * 可再以 override 覆寫指定格。
 */
export function quietGrid(overrides: Array<[reel: number, row: number, symbol: SymbolId]> = []): Grid {
  const grid: Grid = [
    ['H1', 'H2', 'H3'],
    ['A', 'K', 'Q'],
    ['H1', 'H2', 'H3'],
    ['A', 'K', 'Q'],
    ['H1', 'H2', 'H3'],
  ];
  for (const [reel, row, symbol] of overrides) grid[reel][row] = symbol;
  return grid;
}

/** 依序回傳預先排定的整數，用於精準控制停輪位置。 */
export function scriptedRandom(values: number[]): IRandom {
  let i = 0;
  const take = () => {
    if (i >= values.length) throw new Error('scripted random exhausted');
    return values[i++];
  };
  return {
    next: () => take() / 1_000_000,
    nextInt: (max: number) => take() % max,
  };
}
