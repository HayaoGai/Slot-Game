import { MIN_MATCH, PAYING_SYMBOLS } from './config';
import { PAYLINES } from './paylines';
import { freeSpinsForScatter, linePayMultiplier, scatterPayMultiplier } from './paytable';
import type { Grid, LineWin, Position, ScatterWin } from './types';

/**
 * 判定單一 payline。
 *
 * 規則：必須從最左欄開始連續；WILD 可替代任何非 SCATTER 符號；
 * 若 WILD 讓同一條線可以成立多種符號，取賠付最高者（不一定是最長者）。
 */
export function evaluateLine(grid: Grid, lineIndex: number, lineBet: number, paylines = PAYLINES): LineWin | null {
    const line = paylines[lineIndex];
    const cells = line.map((row, reel) => grid[reel][row]);
    let best: LineWin | null = null;

    for (const symbol of PAYING_SYMBOLS) {
        let count = 0;
        while (count < cells.length && (cells[count] === symbol || cells[count] === 'WILD')) count++;
        if (count < MIN_MATCH) continue;

        const payout = linePayMultiplier(symbol, count) * lineBet;
        if (best === null || payout > best.payout) {
            const positions: Position[] = [];
            for (let reel = 0; reel < count; reel++) positions.push([reel, line[reel]]);
            best = { lineIndex, symbol, matchCount: count, positions, payout };
        }
    }
    return best;
}

export function evaluateLines(grid: Grid, lineBet: number, paylines = PAYLINES): LineWin[] {
    const wins: LineWin[] = [];
    for (let i = 0; i < paylines.length; i++) {
        const win = evaluateLine(grid, i, lineBet, paylines);
        if (win) wins.push(win);
    }
    return wins;
}

/** SCATTER 不受 payline 限制，統計全盤面數量，依總注賠付。 */
export function evaluateScatter(grid: Grid, totalBet: number): ScatterWin | null {
    const positions: Position[] = [];
    grid.forEach((column, reel) => {
        column.forEach((symbol, row) => {
            if (symbol === 'SCATTER') positions.push([reel, row]);
        });
    });
    const count = positions.length;
    if (count < 3) return null;
    return {
        count,
        positions,
        payout: scatterPayMultiplier(count) * totalBet,
        freeSpinsAwarded: freeSpinsForScatter(count),
    };
}

/** 盤面上所有 BONUS 的座標，依欄、列順序排列（決定抽獎項時取用 RNG 的順序）。 */
export function findBonusPositions(grid: Grid): Position[] {
    const positions: Position[] = [];
    grid.forEach((column, reel) => {
        column.forEach((symbol, row) => {
            if (symbol === 'BONUS') positions.push([reel, row]);
        });
    });
    return positions;
}

export interface SpinEvaluation {
    lineWins: LineWin[];
    scatterWin: ScatterWin | null;
    totalWin: number;
}

/** 單次 spin 總贏分 = (所有線贏分 + scatter 贏分) × 倍數 */
export function evaluateSpin(grid: Grid, totalBet: number, multiplier: number, lineCount = PAYLINES.length): SpinEvaluation {
    const lineWins = evaluateLines(grid, totalBet / lineCount);
    const scatterWin = evaluateScatter(grid, totalBet);
    const base = lineWins.reduce((sum, win) => sum + win.payout, 0) + (scatterWin?.payout ?? 0);
    return { lineWins, scatterWin, totalWin: base * multiplier };
}
