import { CELL_COUNT, FREE_SPIN_MAX_MULTIPLIER, FREE_SPIN_START_MULTIPLIER, HOLD_SPIN_RESPINS, HOLD_SPIN_TRIGGER, LINE_COUNT, REEL_COUNT, ROW_COUNT } from './config';
import { evaluateSpin, findBonusPositions } from './evaluator';
import { BONUS_PRIZE_TOTAL_WEIGHT, bonusMultiple, drawBonusPrize, JACKPOT_MULTIPLIERS, RESPIN_BONUS_CHANCE } from './paytable';
import { REEL_STRIPS } from './reelStrips';
import type { IRandom } from './rng';
import type { BonusCell, FreeSpinState, HoldSpinState, Position, ReelStrips, RespinResult, SpinResult, SymbolId } from './types';

/** 取 strip 從 stop 開始的連續 rows 格（循環）。row 0 為最上方。 */
export function symbolsAt(strip: readonly SymbolId[], stop: number, rows = ROW_COUNT): SymbolId[] {
    const out: SymbolId[] = [];
    for (let row = 0; row < rows; row++) out.push(strip[(stop + row) % strip.length]);
    return out;
}

/**
 * 只負責「產生結果與計分」。不含餘額、動畫或 UI 邏輯。
 *
 * RNG 取用順序固定，同一個 seed 在 Node 與瀏覽器中的結果完全相同：
 * - spin / spinFree：依欄序 0 → 4 各呼叫一次 rng.nextInt(strip 長度) 決定停輪位置，
 *   再依欄、列順序為盤面上每個 BONUS 呼叫一次 rng.nextInt() 抽獎項
 * - respin：依欄、列順序為每個未鎖定格呼叫一次 rng.next() 決定是否落下 BONUS，落下時再抽獎項
 */
export class SlotEngine {
    private readonly strips: ReelStrips;
    private freeSpin: FreeSpinState = SlotEngine.idleState();
    private holdSpin: HoldSpinState | null = null;

    constructor(private readonly rng: IRandom, strips: ReelStrips = REEL_STRIPS) {
        if (strips.length !== REEL_COUNT) throw new Error(`Expected ${REEL_COUNT} reel strips, got ${strips.length}`);
        for (const strip of strips) {
            if (strip.length < ROW_COUNT) throw new Error('Reel strip is shorter than the visible window');
        }
        this.strips = strips;
    }

    /** 一般遊戲 */
    spin(totalBet: number): SpinResult {
        if (this.isInHoldSpin()) throw new Error('Hold & Spin in progress; call respin() instead.');
        if (this.isInFreeSpin()) throw new Error('Free spins in progress; call spinFree() instead.');
        const result = this.play(totalBet, 1);
        const awarded = result.scatterWin?.freeSpinsAwarded ?? 0;
        if (awarded > 0) {
            this.freeSpin = { remaining: awarded, multiplier: FREE_SPIN_START_MULTIPLIER, totalWin: 0, bet: totalBet, spinsPlayed: 0 };
        }
        if (result.holdSpinTriggered) this.startHoldSpin(result, totalBet, false);
        return result;
    }

    /** 免費遊戲：套用目前倍數，完成後倍數 +1（上限 x5），再次出現 3+ SCATTER 追加次數。 */
    spinFree(totalBet: number): SpinResult {
        if (this.isInHoldSpin()) throw new Error('Hold & Spin in progress; call respin() instead.');
        if (!this.isInFreeSpin()) throw new Error('No free spins remaining.');
        const state = this.freeSpin;
        if (totalBet !== state.bet) throw new Error(`Free spin bet is locked to ${state.bet}, got ${totalBet}`);

        const result = this.play(totalBet, state.multiplier);
        state.remaining -= 1;
        state.spinsPlayed += 1;
        state.totalWin += result.totalWin;
        state.remaining += result.scatterWin?.freeSpinsAwarded ?? 0;
        state.multiplier = Math.min(state.multiplier + 1, FREE_SPIN_MAX_MULTIPLIER);
        if (result.holdSpinTriggered) this.startHoldSpin(result, totalBet, true);
        return result;
    }

    /**
     * Hold & Spin 重轉：已鎖定的 BONUS 不動，其餘每格各自以 RESPIN_BONUS_CHANCE 的機率落下新的 BONUS。
     * 有新 BONUS 落下時剩餘次數重設為 HOLD_SPIN_RESPINS，否則減一；次數用完或盤面填滿即結束，填滿另得 GRAND。
     */
    respin(): RespinResult {
        const state = this.holdSpin;
        if (!state) throw new Error('No Hold & Spin in progress.');

        const occupied = new Set(state.locked.map((cell) => SlotEngine.cellKey(cell.position)));
        const landed: BonusCell[] = [];
        for (let reel = 0; reel < REEL_COUNT; reel++) {
            for (let row = 0; row < ROW_COUNT; row++) {
                if (occupied.has(SlotEngine.cellKey([reel, row]))) continue;
                if (this.rng.next() < RESPIN_BONUS_CHANCE) landed.push(this.drawBonus([reel, row], state.bet));
            }
        }

        for (const cell of landed) state.locked.push(cell);
        state.respinsPlayed += 1;
        state.respinsLeft = landed.length > 0 ? HOLD_SPIN_RESPINS : state.respinsLeft - 1;

        const grand = state.locked.length === CELL_COUNT;
        const finished = grand || state.respinsLeft === 0;
        const collected = state.locked.reduce((sum, cell) => sum + cell.payout, 0);
        const totalWin = finished ? collected + (grand ? JACKPOT_MULTIPLIERS.GRAND * state.bet : 0) : 0;

        if (finished) {
            if (state.duringFreeSpin) this.freeSpin.totalWin += totalWin;
            this.holdSpin = null;
        }
        return { landed, locked: state.locked.slice(), respinsLeft: state.respinsLeft, finished, grand, collected, totalWin };
    }

    getFreeSpinState(): FreeSpinState {
        return { ...this.freeSpin };
    }

    isInFreeSpin(): boolean {
        return this.freeSpin.remaining > 0;
    }

    getHoldSpinState(): HoldSpinState | null {
        return this.holdSpin ? { ...this.holdSpin, locked: this.holdSpin.locked.slice() } : null;
    }

    isInHoldSpin(): boolean {
        return this.holdSpin !== null;
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
        const bonusCells = findBonusPositions(grid).map((position) => this.drawBonus(position, totalBet));
        return { grid, stopIndices, lineWins, scatterWin, multiplier, totalWin, bonusCells, holdSpinTriggered: bonusCells.length >= HOLD_SPIN_TRIGGER };
    }

    private startHoldSpin(result: SpinResult, bet: number, duringFreeSpin: boolean): void {
        this.holdSpin = { respinsLeft: HOLD_SPIN_RESPINS, locked: result.bonusCells.slice(), bet, respinsPlayed: 0, duringFreeSpin };
    }

    private drawBonus(position: Position, bet: number): BonusCell {
        const prize = drawBonusPrize(this.rng.nextInt(BONUS_PRIZE_TOTAL_WEIGHT));
        return { position, prize, payout: bonusMultiple(prize) * bet };
    }

    private static cellKey([reel, row]: Position): number {
        return reel * ROW_COUNT + row;
    }

    private static idleState(): FreeSpinState {
        return { remaining: 0, multiplier: FREE_SPIN_START_MULTIPLIER, totalWin: 0, bet: 0, spinsPlayed: 0 };
    }
}
