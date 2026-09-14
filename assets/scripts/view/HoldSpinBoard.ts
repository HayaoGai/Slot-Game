import { _decorator, Color, Component, Label, Node, Prefab, Tween, tween, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { CELL_COUNT, HOLD_SPIN_RESPINS, ROW_COUNT } from '../core/config';
import { bonusMultiple, JACKPOT_MULTIPLIERS } from '../core/paytable';
import type { BonusCell, BonusPrize, Position, RespinResult } from '../core/types';
import { BalanceDisplay } from '../ui/BalanceDisplay';
import { formatMoney } from '../ui/format';
import { JackpotBar } from '../ui/JackpotBar';
import { Banner } from './Banner';
import { RespinCell } from './RespinCell';

const { ccclass, property } = _decorator;

export interface RespinTiming {
    speed: number; // cells / s
    minSpinTime: number; // s
    stopDelay: number; // s，格與格之間的停輪間隔
    anticipationTime: number; // s，只剩最後一格時額外的等待
    collectStep: number; // s，結算時每顆 BONUS 的間隔
}

export const NORMAL_RESPIN_TIMING: RespinTiming = { speed: 9, minSpinTime: 0.5, stopDelay: 0.06, anticipationTime: 1.5, collectStep: 0.3 };
export const TURBO_RESPIN_TIMING: RespinTiming = { speed: 13, minSpinTime: 0.2, stopDelay: 0.02, anticipationTime: 0.7, collectStep: 0.12 };

const HOLD_COLOR = new Color(255, 122, 217);
const GRAND_COLOR = new Color(255, 213, 74);
const POP_SCALE = new Vec3(1.4, 1.4, 1);

export interface LockedPrize {
    position: Position;
    prize: BonusPrize;
}

/**
 * Hold & Spin 盤面：覆蓋在滾輪上方的 15 個 RespinCell、右側 HUD（剩餘重轉次數、已收集金額），
 * 以及進場橫幅、重轉、結算（逐顆 BONUS 累加贏分、GRAND）演出。
 * 結果一律來自引擎的 RespinResult；結算金額則由盤面上實際顯示的獎項計算，供 GameController 與引擎結果比對。
 */
@ccclass('HoldSpinBoard')
export class HoldSpinBoard extends Component {
    /** 盤面與 HUD，Hold & Spin 期間才啟用 */
    @property(Node)
    content: Node | null = null;

    /** 依欄、列順序排列：index = reel × 3 + row */
    @property([RespinCell])
    cells: RespinCell[] = [];

    @property(Label)
    respinsLabel: Label | null = null;

    @property(Label)
    collectedLabel: Label | null = null;

    @property(Banner)
    banner: Banner | null = null;

    @property(BalanceDisplay)
    display: BalanceDisplay | null = null;

    @property(JackpotBar)
    jackpotBar: JackpotBar | null = null;

    private bet = 0;
    private quickStop = false;
    private skipRequested = false;
    private readonly waiters = new Set<() => void>();

    /** 最近一次結算演出的金額加總（含 GRAND），供與引擎結果對照 */
    lastPresentedTotal = 0;

    init(symbolPrefab: Prefab): void {
        this.cells.forEach((cell) => cell.init(symbolPrefab));
    }

    show(locked: readonly BonusCell[], bet: number): void {
        this.bet = bet;
        this.quickStop = false;
        this.skipRequested = false;
        this.content!.active = true;
        this.cells.forEach((cell) => cell.clear());
        for (const cell of locked) this.cellAt(cell.position).lock(cell.prize, bet);
        this.setRespins(HOLD_SPIN_RESPINS, false);
        this.refreshCollected();
    }

    hide(): void {
        this.skip();
        this.content!.active = false;
    }

    showIntro(turbo: boolean): Promise<void> {
        AudioManager.instance.play('holdSpinTrigger');
        this.cells.filter((cell) => cell.isLocked).forEach((cell) => cell.pop());
        return this.banner!.show('HOLD & SPIN', `${HOLD_SPIN_RESPINS} RESPINS  ·  FILL ALL ${CELL_COUNT} FOR GRAND`, turbo ? 1.2 : 2.6, HOLD_COLOR);
    }

    /** 一次重轉：未鎖定的格子旋轉，依序停輪；新落下的 BONUS 鎖定 */
    async spin(result: RespinResult, turbo: boolean): Promise<void> {
        const timing = turbo ? TURBO_RESPIN_TIMING : NORMAL_RESPIN_TIMING;
        this.quickStop = false;
        this.skipRequested = false;
        const open = this.cells.filter((cell) => !cell.isLocked);
        const landed = new Map<RespinCell, BonusPrize>();
        for (const cell of result.landed) landed.set(this.cellAt(cell.position), cell.prize);

        AudioManager.instance.play('spinStart');
        open.forEach((cell) => cell.startSpin(timing.speed, this.bet));
        await this.wait(timing.minSpinTime);

        const stops: Promise<void>[] = [];
        for (let i = 0; i < open.length; i++) {
            const cell = open[i];
            if (i > 0) await this.wait(timing.stopDelay);
            // 只剩最後一格：這一格決定能否填滿盤面拿到 GRAND，放慢揭曉
            if (open.length === 1 && !this.quickStop) {
                cell.setAnticipation(true);
                AudioManager.instance.play('anticipation');
                await this.wait(timing.anticipationTime);
            }
            const prize = landed.get(cell) ?? null;
            stops.push(
                cell.stop(prize).then(() => {
                    cell.setAnticipation(false);
                    if (!prize) return;
                    AudioManager.instance.play('bonusLock');
                    this.refreshCollected();
                }),
            );
        }
        await Promise.all(stops);
        this.setRespins(result.respinsLeft, result.landed.length > 0);
    }

    /** 快速停止：取消等待，剩餘格子立即停輪 */
    requestQuickStop(): void {
        this.quickStop = true;
        this.flushWaiters();
    }

    /**
     * 結算：依欄、列順序逐顆強調 BONUS 並累加贏分（Jackpot 同時閃動上方牌匾），填滿盤面時另外演出 GRAND，
     * 最後顯示總贏分橫幅。金額由盤面上顯示的獎項計算。
     */
    async collect(turbo: boolean): Promise<void> {
        const timing = turbo ? TURBO_RESPIN_TIMING : NORMAL_RESPIN_TIMING;
        this.skipRequested = false;
        const display = this.display!;
        const base = display.displayedWin;
        const locked = this.cells.filter((cell) => cell.isLocked);
        const collected = this.lockedTotal();
        let presented = 0;

        AudioManager.instance.play('countUp');
        for (const cell of locked) {
            if (this.skipRequested) break;
            const prize = cell.prize!;
            cell.pop();
            if (prize.kind === 'jackpot') {
                this.jackpotBar!.flash(prize.jackpot);
                AudioManager.instance.play('jackpotWin');
            }
            presented += bonusMultiple(prize) * this.bet;
            void display.countWin(base + presented, timing.collectStep * 0.8);
            await this.wait(timing.collectStep);
        }
        // 略過時直接跳到全部收集完的金額
        presented = collected;
        void display.countWin(base + presented, 0);
        AudioManager.instance.stop('countUp');

        if (locked.length === CELL_COUNT) {
            const grand = JACKPOT_MULTIPLIERS.GRAND * this.bet;
            presented += grand;
            this.jackpotBar!.flash('GRAND');
            AudioManager.instance.play('jackpotWin');
            void display.countWin(base + presented, turbo ? 0.6 : 1.5);
            await this.banner!.show('GRAND', formatMoney(grand), turbo ? 1.5 : 3.5, GRAND_COLOR);
            display.finishWin();
        }

        this.lastPresentedTotal = presented;
        AudioManager.instance.play('holdSpinEnd');
        await this.banner!.show('HOLD & SPIN WIN', formatMoney(presented), turbo ? 1.2 : 3, HOLD_COLOR);
    }

    /** 略過結算累加或橫幅 */
    skip(): void {
        this.skipRequested = true;
        this.display?.finishWin();
        this.flushWaiters();
        this.banner?.skip();
    }

    /** 盤面上已鎖定的獎項，依欄、列順序排列 */
    getLockedPrizes(): LockedPrize[] {
        const out: LockedPrize[] = [];
        this.cells.forEach((cell, i) => {
            if (cell.isLocked) out.push({ position: [Math.floor(i / ROW_COUNT), i % ROW_COUNT], prize: cell.prize! });
        });
        return out;
    }

    private cellAt([reel, row]: Position): RespinCell {
        return this.cells[reel * ROW_COUNT + row];
    }

    private lockedTotal(): number {
        return this.cells.reduce((sum, cell) => sum + (cell.isLocked ? bonusMultiple(cell.prize!) * this.bet : 0), 0);
    }

    private refreshCollected(): void {
        this.collectedLabel!.string = formatMoney(this.lockedTotal());
    }

    private setRespins(respins: number, reset: boolean): void {
        const label = this.respinsLabel!;
        label.string = String(respins);
        if (!reset) return;
        Tween.stopAllByTarget(label.node);
        label.node.setScale(POP_SCALE);
        tween(label.node).to(0.3, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    private wait(seconds: number): Promise<void> {
        if (this.quickStop || this.skipRequested || seconds <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => {
                this.waiters.delete(done);
                this.unschedule(done);
                resolve();
            };
            this.waiters.add(done);
            this.scheduleOnce(done, seconds);
        });
    }

    private flushWaiters(): void {
        // 引擎的 Babel 設定以寬鬆模式轉譯 spread / for-of，Set 必須先轉成陣列
        Array.from(this.waiters).forEach((done) => done());
    }
}
