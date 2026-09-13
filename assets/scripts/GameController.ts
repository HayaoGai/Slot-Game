import { _decorator, Component, Node, Sprite } from 'cc';
import { BET_LEVELS, DEFAULT_BET_INDEX, FREE_SPIN_MAX_MULTIPLIER, FREE_SPIN_START_MULTIPLIER, INITIAL_BALANCE, REEL_COUNT } from './core/config';
import { REEL_STRIPS } from './core/reelStrips';
import { createRandom } from './core/rng';
import { SlotEngine } from './core/slotEngine';
import type { SpinResult } from './core/types';
import { BalanceDisplay } from './ui/BalanceDisplay';
import { ControlBar } from './ui/ControlBar';
import { formatMoney } from './ui/format';
import { FreeSpinPanel } from './view/FreeSpinPanel';
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

type Input =
    | { type: 'spin' }
    | { type: 'bet'; delta: number }
    | { type: 'autoStart'; count: number }
    | { type: 'autoStop' }
    | { type: 'turbo'; on: boolean };

interface DebugParams {
    seed: number | null;
    autospin: number;
    auto: number;
    turbo: boolean;
}

function readDebugParams(): DebugParams {
    const search = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const seed = search.get('seed');
    return {
        seed: seed !== null ? Number(seed) : null,
        autospin: Number(search.get('autospin') ?? 0),
        auto: Number(search.get('auto') ?? 0),
        turbo: search.get('turbo') === '1',
    };
}

/**
 * 狀態機主控。
 * - 狀態切換只能經由 enter()，並以 TRANSITIONS 檢查合法性
 * - 所有玩家輸入都經由 handleInput()，依目前狀態決定是否接受與如何解讀
 * - 引擎只產生結果；餘額、autoplay 與 turbo 由此處管理
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

    @property(FreeSpinPanel)
    freeSpinPanel: FreeSpinPanel | null = null;

    @property(Sprite)
    background: Sprite | null = null;

    private state = GameState.IDLE;
    private ready = false;
    private engine!: SlotEngine;
    private balance = INITIAL_BALANCE;
    private betIndex = DEFAULT_BET_INDEX;
    private turbo = false;
    /** null 表示未在自動旋轉 */
    private autoplayRemaining: number | null = null;
    private readonly stateWaiters: { state: GameState; resolve: () => void }[] = [];

    private rounds = 0;
    private spinCount = 0;
    private gridMismatches = 0;
    private winMismatches = 0;
    private multiplierMismatches = 0;

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
        bar.on(ControlBar.EVENT_AUTO_START, (count: number) => this.handleInput({ type: 'autoStart', count }));
        bar.on(ControlBar.EVENT_AUTO_STOP, () => this.handleInput({ type: 'autoStop' }));
        bar.on(ControlBar.EVENT_TURBO, (on: boolean) => this.handleInput({ type: 'turbo', on }));
        this.freeSpinPanel!.overlayNode.on(Node.EventType.TOUCH_END, () => this.handleInput({ type: 'spin' }));

        this.controlBar!.setTurbo(this.turbo);
        this.balanceDisplay!.setBalance(this.balance);
        this.balanceDisplay!.clearWin();
        this.ready = true;
        this.enter(GameState.IDLE);
        console.log(`[GameController] ready, seed=${seed}`);

        if (params.autospin > 0) void this.runAutospin(params.autospin);
        else if (params.auto > 0) void this.runAutoplayCheck(params.auto);
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

        // 任何狀態都接受：turbo 下一次旋轉生效；停止 autoplay 在本輪結束後生效
        if (input.type === 'turbo') {
            this.turbo = input.on;
            return;
        }
        if (input.type === 'autoStop') {
            this.stopAutoplay('stopped by player');
            return;
        }

        switch (this.state) {
            case GameState.IDLE:
                if (input.type === 'spin') {
                    void this.playRound();
                } else if (input.type === 'bet') {
                    this.changeBet(input.delta);
                } else if (input.type === 'autoStart') {
                    this.autoplayRemaining = input.count;
                    console.log(`[autoplay] start ${input.count}`);
                    void this.playRound();
                }
                break;
            case GameState.SPINNING:
            case GameState.STOPPING:
                // 旋轉中再按 Spin：快速停止，而非重新下注
                if (input.type === 'spin') this.reelSet!.requestQuickStop();
                break;
            case GameState.PRESENT_WIN:
                if (input.type === 'spin') this.winPresenter!.skip();
                break;
            case GameState.FREESPIN_INTRO:
            case GameState.FREESPIN_LOOP:
            case GameState.FREESPIN_OUTRO:
                if (input.type === 'spin') this.freeSpinPanel!.skip();
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
            this.stopAutoplay('insufficient balance');
            console.warn('[GameController] insufficient balance');
            this.enter(GameState.IDLE);
            return;
        }
        if (this.autoplayRemaining !== null) this.autoplayRemaining = Math.max(0, this.autoplayRemaining - 1);
        this.rounds++;
        this.balance -= bet;
        this.balanceDisplay!.setBalance(this.balance);

        await this.runSpin(this.engine.spin(bet), bet);

        this.enter(GameState.CHECK_FREESPIN);
        if (this.engine.isInFreeSpin()) {
            this.stopAutoplay('free spins triggered');
            await this.runFreeSpins(bet);
        }

        this.enter(GameState.IDLE);
        this.continueAutoplay();
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
        const panel = this.freeSpinPanel!;
        const initial = this.engine.getFreeSpinState();
        panel.show();
        panel.updateHud(initial.remaining, initial.multiplier);

        this.enter(GameState.FREESPIN_INTRO);
        console.log(`[freespin] triggered: ${initial.remaining} spins`);
        await panel.showIntro(initial.remaining, this.turbo);

        for (;;) {
            this.enter(GameState.FREESPIN_LOOP);
            if (!this.engine.isInFreeSpin()) break;

            const before = this.engine.getFreeSpinState();
            panel.updateHud(before.remaining - 1, before.multiplier);
            const result = this.engine.spinFree(bet);
            const after = this.engine.getFreeSpinState();
            this.verifyMultiplier(before.spinsPlayed + 1, result.multiplier);
            console.log(
                `[freespin] spin ${after.spinsPlayed} x${result.multiplier} remaining=${after.remaining} ` +
                    `win=${formatMoney(result.totalWin)} total=${formatMoney(after.totalWin)}`,
            );

            await this.runSpin(result, bet);

            if (result.scatterWin) {
                this.enter(GameState.FREESPIN_LOOP);
                console.log(`[freespin] retrigger +${result.scatterWin.freeSpinsAwarded}, remaining=${after.remaining}, multiplier kept x${after.multiplier}`);
                await panel.showRetrigger(result.scatterWin.freeSpinsAwarded, this.turbo);
            }
            panel.updateHud(after.remaining, after.multiplier);
        }

        const final = this.engine.getFreeSpinState();
        this.enter(GameState.FREESPIN_OUTRO);
        console.log(`[freespin] finished: ${final.spinsPlayed} spins, total ${formatMoney(final.totalWin)}`);
        await panel.showOutro(final.totalWin, this.turbo);
        panel.hide();
    }

    private continueAutoplay(): void {
        if (this.autoplayRemaining === null) return;
        if (this.autoplayRemaining <= 0) {
            this.stopAutoplay('finished');
            return;
        }
        this.scheduleOnce(() => {
            if (this.state === GameState.IDLE && this.autoplayRemaining !== null) void this.playRound();
        }, this.turbo ? 0.25 : 0.8);
    }

    private stopAutoplay(reason: string): void {
        if (this.autoplayRemaining === null) return;
        console.log(`[autoplay] ${reason} (remaining ${this.autoplayRemaining})`);
        this.autoplayRemaining = null;
        this.refreshControls();
    }

    private changeBet(delta: number): void {
        this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, this.betIndex + delta));
        this.refreshControls();
    }

    private refreshControls(): void {
        const bar = this.controlBar;
        if (!bar || !this.ready) return;
        const s = this.state;
        const manual = s === GameState.IDLE && this.autoplayRemaining === null;
        bar.setBet(this.bet, this.betIndex > 0, this.betIndex < BET_LEVELS.length - 1, manual);

        if (s === GameState.SPINNING || s === GameState.STOPPING) bar.setSpin('stop', true);
        else if (s === GameState.PRESENT_WIN || s === GameState.FREESPIN_INTRO || s === GameState.FREESPIN_OUTRO) bar.setSpin('skip', true);
        else bar.setSpin('spin', manual);
        bar.setAutoplay(this.autoplayRemaining, manual);
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
        const msg =
            `[verify-win] spin #${this.spinCount} engine=${formatMoney(result.totalWin)} presented=${formatMoney(presented)} ` +
            `displayed=${formatMoney(displayed)} lines=${result.lineWins.length}${result.scatterWin ? ' +scatter' : ''} ${ok ? 'OK' : 'MISMATCH'}`;
        if (ok) console.log(msg);
        else console.error(msg);
    }

    private verifyMultiplier(freeSpinNumber: number, actual: number): void {
        const expected = Math.min(FREE_SPIN_START_MULTIPLIER + freeSpinNumber - 1, FREE_SPIN_MAX_MULTIPLIER);
        if (expected !== actual) {
            this.multiplierMismatches++;
            console.error(`[verify-fs] free spin ${freeSpinNumber}: expected x${expected}, got x${actual}`);
        }
    }

    private logSummary(heapBefore: number): void {
        const heap = GameController.heap();
        console.log(
            `[verify] done rounds=${this.rounds} spins=${this.spinCount} gridMismatches=${this.gridMismatches} winMismatches=${this.winMismatches} ` +
                `multiplierMismatches=${this.multiplierMismatches} symbolNodes=${this.reelSet!.countSymbolNodes()} (expected ${REEL_COUNT * 5}) ` +
                `balance=${formatMoney(this.balance)} heapMB ${(heapBefore / 1048576).toFixed(1)} -> ${(heap / 1048576).toFixed(1)}`,
        );
    }

    /** ?autospin=N：透過正常輸入流程連續旋轉 N 次 */
    private async runAutospin(count: number): Promise<void> {
        const heapBefore = GameController.heap();
        for (let i = 0; i < count; i++) {
            await this.waitForState(GameState.IDLE);
            if (i > 0 && i % 50 === 0) console.log(`[heap-probe] round ${i}`);
            this.handleInput({ type: 'spin' });
        }
        await this.waitForState(GameState.IDLE);
        console.log(`[heap-probe] round ${count}`);
        this.logSummary(heapBefore);
    }

    /** ?auto=N：以 autoplay 按鈕相同的輸入啟動，等待其結束或暫停 */
    private async runAutoplayCheck(count: number): Promise<void> {
        const heapBefore = GameController.heap();
        this.handleInput({ type: 'autoStart', count });
        for (;;) {
            await this.waitForState(GameState.IDLE);
            await this.delay(1);
            if (this.state === GameState.IDLE && this.autoplayRemaining === null) break;
        }
        this.logSummary(heapBefore);
    }

    private static heap(): number {
        return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    }
}
