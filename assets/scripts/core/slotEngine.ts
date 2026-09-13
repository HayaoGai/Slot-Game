import { FREE_SPIN_MAX_MULTIPLIER, FREE_SPIN_START_MULTIPLIER, LINE_COUNT, REEL_COUNT, ROW_COUNT } from './config';
import { evaluateSpin } from './evaluator';
import { REEL_STRIPS } from './reelStrips';
import type { IRandom } from './rng';
import type { FreeSpinState, ReelStrips, SpinResult, SymbolId } from './types';

/** 取 strip 從 stop 開始的連續 rows 格（循環）。row 0 為最上方。 */
export function symbolsAt(strip: readonly SymbolId[], stop: number, rows = ROW_COUNT): SymbolId[] {
    const out: SymbolId[] = [];
    for (let row = 0; row < rows; row++) out.push(strip[(stop + row) % strip.length]);
    return out;
}

/**
 * 只負責「產生結果與計分」。不含餘額、動畫或 UI 邏輯。
 *
 * 每次 spin 依欄序 0 → 4 各呼叫一次 rng.nextInt(strip 長度) 決定停輪位置。
 */
export class SlotEngine {
    private readonly strips: ReelStrips;
    private freeSpin: FreeSpinState = SlotEngine.idleState();

    constructor(private readonly rng: IRandom, strips: ReelStrips = REEL_STRIPS) {
        if (strips.length !== REEL_COUNT) throw new Error(`Expected ${REEL_COUNT} reel strips, got ${strips.length}`);
        for (const strip of strips) {
            if (strip.length < ROW_COUNT) throw new Error('Reel strip is shorter than the visible window');
        }
        this.strips = strips;
    }

    /** 一般遊戲 */
    spin(totalBet: number): SpinResult {
        if (this.isInFreeSpin()) throw new Error('Free spins in progress; call spinFree() instead.');
        const result = this.play(totalBet, 1);
        const awarded = result.scatterWin?.freeSpinsAwarded ?? 0;
        if (awarded > 0) {
            this.freeSpin = { remaining: awarded, multiplier: FREE_SPIN_START_MULTIPLIER, totalWin: 0, bet: totalBet, spinsPlayed: 0 };
        }
        return result;
    }

    /** 免費遊戲：套用目前倍數，完成後倍數 +1（上限 x5），再次出現 3+ SCATTER 追加次數。 */
    spinFree(totalBet: number): SpinResult {
        if (!this.isInFreeSpin()) throw new Error('No free spins remaining.');
        const state = this.freeSpin;
        if (totalBet !== state.bet) throw new Error(`Free spin bet is locked to ${state.bet}, got ${totalBet}`);

        const result = this.play(totalBet, state.multiplier);
        state.remaining -= 1;
        state.spinsPlayed += 1;
        state.totalWin += result.totalWin;
        state.remaining += result.scatterWin?.freeSpinsAwarded ?? 0;
        state.multiplier = Math.min(state.multiplier + 1, FREE_SPIN_MAX_MULTIPLIER);
        return result;
    }

    getFreeSpinState(): FreeSpinState {
        return { ...this.freeSpin };
    }

    isInFreeSpin(): boolean {
        return this.freeSpin.remaining > 0;
    }

    getStrips(): ReelStrips {
        return this.strips;
    }

    private play(totalBet: number, multiplier: number): SpinResult {
        if (!Number.isInteger(totalBet) || totalBet <= 0 || totalBet % LINE_COUNT !== 0) {
            throw new Error(`Total bet must be a positive multiple of ${LINE_COUNT}, got ${totalBet}`);
        }
        const stopIndices = this.strips.map((strip) => this.rng.nextInt(strip.length));
        const grid = stopIndices.map((stop, reel) => symbolsAt(this.strips[reel], stop));
        const { lineWins, scatterWin, totalWin } = evaluateSpin(grid, totalBet, multiplier, LINE_COUNT);
        return { grid, stopIndices, lineWins, scatterWin, multiplier, totalWin };
    }

    private static idleState(): FreeSpinState {
        return { remaining: 0, multiplier: FREE_SPIN_START_MULTIPLIER, totalWin: 0, bet: 0, spinsPlayed: 0 };
    }
}
