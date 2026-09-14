export type SymbolId = 'J' | 'Q' | 'K' | 'A' | 'H1' | 'H2' | 'H3' | 'WILD' | 'SCATTER' | 'BONUS';

/** 可在 payline 上賠付的符號（WILD 本身不賠付，SCATTER 另計，BONUS 只在 Hold & Spin 中計分） */
export type PayingSymbolId = Exclude<SymbolId, 'WILD' | 'SCATTER' | 'BONUS'>;

export type JackpotId = 'MINI' | 'MINOR' | 'MAJOR' | 'GRAND';

/** 會出現在單顆 BONUS 上的 Jackpot；GRAND 只能由填滿盤面獲得 */
export type BonusJackpotId = Exclude<JackpotId, 'GRAND'>;

/** BONUS 符號帶的獎項：現金（總注倍數）或 Jackpot */
export type BonusPrize = { kind: 'cash'; multiple: number } | { kind: 'jackpot'; jackpot: BonusJackpotId };

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

export interface BonusCell {
    position: Position;
    prize: BonusPrize;
    payout: number; // 依總注換算的金額
}

export interface SpinResult {
    grid: Grid;
    stopIndices: number[]; // 每欄的 strip 起始索引，供動畫對齊使用
    lineWins: LineWin[];
    scatterWin: ScatterWin | null;
    multiplier: number; // 本次套用的倍數（一般遊戲為 1）
    totalWin: number; // 線贏分與 SCATTER 贏分，已含倍數；Hold & Spin 贏分另計
    bonusCells: BonusCell[]; // 盤面上所有 BONUS 與其獎項；未觸發 Hold & Spin 時只供顯示，不計分
    holdSpinTriggered: boolean;
}

export interface FreeSpinState {
    remaining: number;
    multiplier: number; // 下一次免費旋轉將套用的倍數
    totalWin: number; // 本輪免費遊戲累積贏分（含期間觸發的 Hold & Spin）
    bet: number; // 觸發時的總注
    spinsPlayed: number;
}

export interface HoldSpinState {
    respinsLeft: number;
    locked: BonusCell[]; // 依鎖定順序
    bet: number; // 觸發時的總注
    respinsPlayed: number;
    /** 由免費遊戲觸發：結束時贏分併入該輪免費遊戲的累積贏分（不乘免費遊戲倍數） */
    duringFreeSpin: boolean;
}

export interface RespinResult {
    landed: BonusCell[]; // 本次新落下並鎖定的 BONUS
    locked: BonusCell[]; // 本次結束後所有已鎖定的 BONUS
    respinsLeft: number;
    finished: boolean;
    grand: boolean; // 填滿盤面
    collected: number; // 已鎖定 BONUS 的金額加總（不含 GRAND）
    totalWin: number; // 結束時為整個 Hold & Spin 的總贏分（collected + GRAND），未結束時為 0
}
