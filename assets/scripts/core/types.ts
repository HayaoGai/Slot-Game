export type SymbolId = 'J' | 'Q' | 'K' | 'A' | 'H1' | 'H2' | 'H3' | 'WILD' | 'SCATTER';

/** 可在 payline 上賠付的符號（WILD 本身不賠付，SCATTER 另計） */
export type PayingSymbolId = Exclude<SymbolId, 'WILD' | 'SCATTER'>;

/** [reel, row] */
export type Position = [number, number];

/** grid[reelIndex][rowIndex] */
export type Grid = SymbolId[][];

export type ReelStrips = readonly (readonly SymbolId[])[];

export interface LineWin {
    lineIndex: number; // 0-24
    symbol: SymbolId; // 實際成立的符號（WILD 替代後的結果）
    matchCount: number; // 3 | 4 | 5
    positions: Position[]; // 中獎格座標，供高亮使用
    payout: number; // 已乘上線注，未乘免費遊戲倍數
}

export interface ScatterWin {
    count: number;
    positions: Position[];
    payout: number; // 未乘免費遊戲倍數
    freeSpinsAwarded: number;
}

export interface SpinResult {
    grid: Grid;
    stopIndices: number[]; // 每欄的 strip 起始索引，供動畫對齊使用
    lineWins: LineWin[];
    scatterWin: ScatterWin | null;
    multiplier: number; // 本次套用的倍數（一般遊戲為 1）
    totalWin: number; // 已含倍數
}

export interface FreeSpinState {
    remaining: number;
    multiplier: number; // 下一次免費旋轉將套用的倍數
    totalWin: number; // 本輪免費遊戲累積贏分
    bet: number; // 觸發時的總注
    spinsPlayed: number;
}
