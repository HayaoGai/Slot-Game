import { _decorator, Component, Sprite } from 'cc';
import { BET_LEVELS, DEFAULT_BET_INDEX, INITIAL_BALANCE, REEL_COUNT } from './core/config';
import { REEL_STRIPS } from './core/reelStrips';
import { createRandom } from './core/rng';
import { SlotEngine } from './core/slotEngine';
import type { SpinResult } from './core/types';
import { BalanceDisplay } from './ui/BalanceDisplay';
import { ControlBar } from './ui/ControlBar';
import { formatMoney } from './ui/format';
import { GameAssets } from './view/GameAssets';
import { NORMAL_TIMING, ReelSet, TURBO_TIMING, type ReelTiming } from './view/ReelSet';
import { WinPresenter } from './view/WinPresenter';

const { ccclass, property } = _decorator;

export enum GameState {
    IDLE = 'IDLE',
    DEDUCT_BET = 'DEDUCT_BET',
    SPINNING = 'SPINNING',
    STOPPING = 'STOPPING',
    EVALUATE = 'EVALUATE',
    PRESENT_WIN = 'PRESENT_WIN',
    CHECK_FREESPIN = 'CHECK_FREESPIN',
    FREESPIN_INTRO = 'FREESPIN_INTRO',
    FREESPIN_LOOP = 'FREESPIN_LOOP',
    FREESPIN_OUTRO = 'FREESPIN_OUTRO',
}

/** 合法的狀態轉移。免費遊戲中每一轉走 FREESPIN_LOOP → SPINNING → … → FREESPIN_LOOP。 */
const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
    [GameState.IDLE]: [GameState.DEDUCT_BET],
    [GameState.DEDUCT_BET]: [GameState.SPINNING, GameState.IDLE],
    [GameState.SPINNING]: [GameState.STOPPING],
    [GameState.STOPPING]: [GameState.EVALUATE],
    [GameState.EVALUATE]: [GameState.PRESENT_WIN, GameState.CHECK_FREESPIN, GameState.FREESPIN_LOOP],
    [GameState.PRESENT_WIN]: [GameState.CHECK_FREESPIN, GameState.FREESPIN_LOOP],
    [GameState.CHECK_FREESPIN]: [GameState.FREESPIN_INTRO, GameState.IDLE],
    [GameState.FREESPIN_INTRO]: [GameState.FREESPIN_LOOP],
    [GameState.FREESPIN_LOOP]: [GameState.SPINNING, GameState.FREESPIN_OUTRO],
    [GameState.FREESPIN_OUTRO]: [GameState.IDLE],
};

type Input = { type: 'spin' } | { type: 'bet'; delta: number } | { type: 'turbo'; on: boolean };

interface DebugParams {
    seed: number | null;
    autospin: number;
    turbo: boolean;
}

function readDebugParams(): DebugParams {
    const search = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const seed = search.get('seed');
    return {
        seed: seed !== null ? Number(seed) : null,
        autospin: Number(search.get('autospin') ?? 0),
        turbo: search.get('turbo') === '1',
    };
}

/**
 * 狀態機主控。
 * - 狀態切換只能經由 enter()，並以 TRANSITIONS 檢查合法性
 * - 所有玩家輸入都經由 handleInput()，依目前狀態決定是否接受與如何解讀
 * - 引擎只產生結果；餘額由此處管理
 */
@ccclass('GameController')
export class GameController extends Component {
    @property(ReelSet)
    reelSet: ReelSet | null = null;

    @property(WinPresenter)
    winPresenter: WinPresenter | null = null;

    @property(ControlBar)
    controlBar: ControlBar | null = null;

    @property(BalanceDisplay)
    balanceDisplay: BalanceDisplay | null = null;

    @property(Sprite)
    background: Sprite | null = null;

    private state = GameState.IDLE;
    private ready = false;
    private engine!: SlotEngine;
    private balance = INITIAL_BALANCE;
    private betIndex = DEFAULT_BET_INDEX;
    private turbo = false;
    private readonly stateWaiters: { state: GameState; resolve: () => void }[] = [];

    private spinCount = 0;
    private gridMismatches = 0;
    private winMismatches = 0;

    get currentState(): GameState {
        return this.state;
    }

    private get bet(): number {
        return BET_LEVELS[this.betIndex];
    }

    private get timing(): ReelTiming {
        return this.turbo ? TURBO_TIMING : NORMAL_TIMING;
    }

    async start(): Promise<void> {
        await GameAssets.loadAll();
        this.background!.spriteFrame = GameAssets.background;
        this.controlBar!.applyTextures(GameAssets.white);

        const params = readDebugParams();
        const seed = params.seed ?? Date.now() >>> 0;
        this.turbo = params.turbo;
        this.engine = new SlotEngine(createRandom(seed));

        const layoutRng = createRandom(seed ^ 0x5bd1e995);
        this.reelSet!.init(
            REEL_STRIPS,
            REEL_STRIPS.map((strip) => layoutRng.nextInt(strip.length)),
            GameAssets.symbolPrefab,
        );

        const bar = this.controlBar!.node;
        bar.on(ControlBar.EVENT_SPIN, () => this.handleInput({ type: 'spin' }));
        bar.on(ControlBar.EVENT_BET, (delta: number) => this.handleInput({ type: 'bet', delta }));
        bar.on(ControlBar.EVENT_TURBO, (on: boolean) => this.handleInput({ type: 'turbo', on }));

        this.controlBar!.setTurbo(this.turbo);
        this.balanceDisplay!.setBalance(this.balance);
        this.balanceDisplay!.clearWin();
        this.ready = true;
        this.enter(GameState.IDLE);
        console.log(`[GameController] ready, seed=${seed}`);

        if (params.autospin > 0) void this.runAutospin(params.autospin);
    }

    // ─── 狀態 ───────────────────────────────────────────────────────────

    private enter(next: GameState): void {
        if (next !== this.state && TRANSITIONS[this.state].indexOf(next) < 0) {
            throw new Error(`Illegal state transition ${this.state} → ${next}`);
        }
        this.state = next;
        this.refreshControls();
        for (let i = this.stateWaiters.length - 1; i >= 0; i--) {
            if (this.stateWaiters[i].state === next) this.stateWaiters.splice(i, 1)[0].resolve();
        }
    }

    private waitForState(state: GameState): Promise<void> {
        if (this.state === state) return Promise.resolve();
        return new Promise((resolve) => this.stateWaiters.push({ state, resolve }));
    }

    // ─── 輸入：每個狀態可接受的輸入集中在此 ────────────────────────────

    private handleInput(input: Input): void {
        if (!this.ready) return;
        if (input.type === 'turbo') {
            // 任何狀態都可切換，下一次旋轉生效
            this.turbo = input.on;
            return;
        }

        switch (this.state) {
            case GameState.IDLE:
                if (input.type === 'spin') void this.playRound();
                else if (input.type === 'bet') this.changeBet(input.delta);
                break;
            case GameState.SPINNING:
            case GameState.STOPPING:
                // 旋轉中再按 Spin：快速停止，而非重新下注
                if (input.type === 'spin') this.reelSet!.requestQuickStop();
                break;
            case GameState.PRESENT_WIN:
                if (input.type === 'spin') this.winPresenter!.skip();
                break;
            default:
                break;
        }
    }

    // ─── 流程 ───────────────────────────────────────────────────────────

    private async playRound(): Promise<void> {
        this.enter(GameState.DEDUCT_BET);
        const bet = this.bet;
        if (this.balance < bet) {
            console.warn('[GameController] insufficient balance');
            this.enter(GameState.IDLE);
            return;
        }
        this.balance -= bet;
        this.balanceDisplay!.setBalance(this.balance);

        await this.runSpin(this.engine.spin(bet), bet);

        this.enter(GameState.CHECK_FREESPIN);
        if (this.engine.isInFreeSpin()) await this.runFreeSpins(bet);
        this.enter(GameState.IDLE);
    }

    /** SPINNING → STOPPING → EVALUATE →（PRESENT_WIN） */
    private async runSpin(result: SpinResult, bet: number): Promise<void> {
        this.winPresenter!.stop();
        this.balanceDisplay!.clearWin();
        const timing = this.timing;
        const reels = this.reelSet!;

        this.enter(GameState.SPINNING);
        reels.startSpin(timing);
        await reels.waitMinimumSpin(timing);

        this.enter(GameState.STOPPING);
        await reels.stopAll(result, timing);

        this.enter(GameState.EVALUATE);
        this.verifyGrid(result);

        if (result.totalWin > 0) {
            this.enter(GameState.PRESENT_WIN);
            await this.winPresenter!.present(result, bet, this.turbo);
            this.verifyWin(result);
            this.balance += result.totalWin;
            this.balanceDisplay!.setBalance(this.balance);
        }
    }

    private async runFreeSpins(bet: number): Promise<void> {
        this.enter(GameState.FREESPIN_INTRO);
        console.log(`[freespin] triggered: ${this.engine.getFreeSpinState().remaining} spins`);
        await this.delay(this.turbo ? 0.4 : 1);

        for (;;) {
            this.enter(GameState.FREESPIN_LOOP);
            if (!this.engine.isInFreeSpin()) break;
            await this.runSpin(this.engine.spinFree(bet), bet);
        }

        this.enter(GameState.FREESPIN_OUTRO);
        console.log(`[freespin] finished: total ${formatMoney(this.engine.getFreeSpinState().totalWin)}`);
        await this.delay(this.turbo ? 0.4 : 1);
    }

    private changeBet(delta: number): void {
        this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, this.betIndex + delta));
        this.refreshControls();
    }

    private refreshControls(): void {
        const bar = this.controlBar;
        if (!bar || !this.ready) return;
        const s = this.state;
        const idle = s === GameState.IDLE;
        bar.setBet(this.bet, this.betIndex > 0, this.betIndex < BET_LEVELS.length - 1, idle);

        if (s === GameState.SPINNING || s === GameState.STOPPING) bar.setSpin('stop', true);
        else if (s === GameState.PRESENT_WIN) bar.setSpin('skip', true);
        else bar.setSpin('spin', idle);
        bar.setAutoplay(null, idle);
    }

    private delay(seconds: number): Promise<void> {
        return new Promise((resolve) => this.scheduleOnce(() => resolve(), seconds));
    }

    // ─── 驗證（console 對照） ───────────────────────────────────────────

    private verifyGrid(result: SpinResult): void {
        this.spinCount++;
        const shown = this.reelSet!.getVisibleGrid();
        const ok = shown.every((column, reel) => column.every((symbol, row) => symbol === result.grid[reel][row]));
        if (ok) {
            console.log(`[verify] spin #${this.spinCount} OK stops=[${result.stopIndices.join(',')}] win=${formatMoney(result.totalWin)} x${result.multiplier}`);
        } else {
            this.gridMismatches++;
            console.error(`[verify] spin #${this.spinCount} MISMATCH expected=${JSON.stringify(result.grid)} shown=${JSON.stringify(shown)}`);
        }
    }

    private verifyWin(result: SpinResult): void {
        const presented = this.winPresenter!.lastPresentedTotal;
        const displayed = this.balanceDisplay!.displayedWin;
        const ok = presented === result.totalWin && displayed === result.totalWin;
        if (!ok) this.winMismatches++;
        const msg = `[verify-win] spin #${this.spinCount} engine=${formatMoney(result.totalWin)} presented=${formatMoney(presented)} displayed=${formatMoney(displayed)} lines=${result.lineWins.length}${result.scatterWin ? ' +scatter' : ''} ${ok ? 'OK' : 'MISMATCH'}`;
        if (ok) console.log(msg);
        else console.error(msg);
    }

    private async runAutospin(count: number): Promise<void> {
        const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
        const heapBefore = heap();
        for (let i = 0; i < count; i++) {
            await this.waitForState(GameState.IDLE);
            this.handleInput({ type: 'spin' });
        }
        await this.waitForState(GameState.IDLE);
        console.log(
            `[verify] done spins=${this.spinCount} gridMismatches=${this.gridMismatches} winMismatches=${this.winMismatches} ` +
                `symbolNodes=${this.reelSet!.countSymbolNodes()} (expected ${REEL_COUNT * 5}) balance=${formatMoney(this.balance)} ` +
                `heapMB ${(heapBefore / 1048576).toFixed(1)} -> ${(heap() / 1048576).toFixed(1)}`,
        );
    }
}
