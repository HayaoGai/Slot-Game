import { _decorator, Button, Component, Label, Sprite } from 'cc';
import { BET_LEVELS, DEFAULT_BET_INDEX, INITIAL_BALANCE, REEL_COUNT } from './core/config';
import { REEL_STRIPS } from './core/reelStrips';
import { createRandom } from './core/rng';
import { SlotEngine } from './core/slotEngine';
import type { SpinResult } from './core/types';
import { GameAssets } from './view/GameAssets';
import { NORMAL_TIMING, ReelSet, TURBO_TIMING } from './view/ReelSet';

const { ccclass, property } = _decorator;

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

const formatMoney = (cents: number) => (cents / 100).toFixed(2);

@ccclass('GameController')
export class GameController extends Component {
    @property(ReelSet)
    reelSet: ReelSet | null = null;

    @property(Sprite)
    background: Sprite | null = null;

    @property(Button)
    spinButton: Button | null = null;

    @property(Label)
    spinLabel: Label | null = null;

    @property(Label)
    balanceLabel: Label | null = null;

    @property(Label)
    winLabel: Label | null = null;

    private engine!: SlotEngine;
    private balance = INITIAL_BALANCE;
    private bet = BET_LEVELS[DEFAULT_BET_INDEX];
    private turbo = false;
    private spinning = false;
    private spinCount = 0;
    private mismatches = 0;

    async start(): Promise<void> {
        await GameAssets.loadAll();
        this.background!.spriteFrame = GameAssets.background;

        const params = readDebugParams();
        const seed = params.seed ?? Date.now() >>> 0;
        this.turbo = params.turbo;
        this.engine = new SlotEngine(createRandom(seed));

        const layoutRng = createRandom(seed ^ 0x5bd1e995);
        const initialStops = REEL_STRIPS.map((strip) => layoutRng.nextInt(strip.length));
        this.reelSet!.init(REEL_STRIPS, initialStops, GameAssets.symbolPrefab);

        this.spinButton!.node.on(Button.EventType.CLICK, this.onSpinPressed, this);
        this.refreshLabels();
        console.log(`[GameController] ready, seed=${seed}`);

        if (params.autospin > 0) void this.runAutospin(params.autospin);
    }

    private onSpinPressed(): void {
        if (this.spinning) this.reelSet!.requestQuickStop();
        else void this.spinOnce();
    }

    private async spinOnce(): Promise<SpinResult> {
        this.spinning = true;
        this.balance -= this.bet;
        this.refreshLabels();

        const result = this.engine.isInFreeSpin() ? this.engine.spinFree(this.engine.getFreeSpinState().bet) : this.engine.spin(this.bet);
        const timing = this.turbo ? TURBO_TIMING : NORMAL_TIMING;
        const reels = this.reelSet!;
        reels.startSpin(timing);
        await reels.waitMinimumSpin(timing);
        await reels.stopAll(result, timing);

        this.verify(result);
        this.balance += result.totalWin;
        this.refreshLabels(result.totalWin);
        this.spinning = false;
        return result;
    }

    /** 以 console 對照畫面停輪結果與引擎結果 */
    private verify(result: SpinResult): void {
        this.spinCount++;
        const shown = this.reelSet!.getVisibleGrid();
        const ok = shown.every((column, reel) => column.every((symbol, row) => symbol === result.grid[reel][row]));
        if (ok) {
            console.log(`[verify] spin #${this.spinCount} OK stops=[${result.stopIndices.join(',')}] win=${formatMoney(result.totalWin)}`);
        } else {
            this.mismatches++;
            console.error(`[verify] spin #${this.spinCount} MISMATCH expected=${JSON.stringify(result.grid)} shown=${JSON.stringify(shown)}`);
        }
    }

    private async runAutospin(count: number): Promise<void> {
        const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
        const heapBefore = heap();
        for (let i = 0; i < count; i++) await this.spinOnce();
        const nodes = this.reelSet!.countSymbolNodes();
        console.log(
            `[verify] done spins=${this.spinCount} mismatches=${this.mismatches} symbolNodes=${nodes} (expected ${REEL_COUNT * 5}) ` +
                `heapMB ${(heapBefore / 1048576).toFixed(1)} -> ${(heap() / 1048576).toFixed(1)}`,
        );
    }

    private refreshLabels(win = 0): void {
        this.balanceLabel!.string = formatMoney(this.balance);
        this.winLabel!.string = win > 0 ? formatMoney(win) : '';
        this.spinLabel!.string = 'SPIN';
    }
}
