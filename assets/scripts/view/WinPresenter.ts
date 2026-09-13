import { _decorator, Color, Component, instantiate, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { WIN_TIERS } from '../core/config';
import type { Position, SpinResult } from '../core/types';
import { BalanceDisplay } from '../ui/BalanceDisplay';
import { formatMoney } from '../ui/format';
import { GameAssets } from './GameAssets';
import { PaylineRenderer } from './PaylineRenderer';
import { ReelSet } from './ReelSet';

const { ccclass, property } = _decorator;

export type WinTier = 'BIG WIN' | 'MEGA WIN' | 'EPIC WIN' | null;

export function winTier(multiple: number): WinTier {
    if (multiple >= WIN_TIERS.epic) return 'EPIC WIN';
    if (multiple >= WIN_TIERS.mega) return 'MEGA WIN';
    if (multiple >= WIN_TIERS.big) return 'BIG WIN';
    return null;
}

interface WinStep {
    lineIndex: number; // -1 表示 SCATTER
    positions: Position[];
    amount: number; // 已含倍數
}

const STEP_TIME = 0.8;
const STEP_TIME_TURBO = 0.4;

/**
 * 中獎演出：
 * 1. 非中獎格降低亮度
 * 2. 依序播放每一條中獎線（線條、高亮格、單線贏分）
 * 3. 總贏分 count-up，依倍率顯示 BIG / MEGA / EPIC WIN
 * 4. 結束後進入「全部同時高亮」循環，直到下一次操作呼叫 stop()
 */
@ccclass('WinPresenter')
export class WinPresenter extends Component {
    @property(PaylineRenderer)
    paylines: PaylineRenderer | null = null;

    @property(ReelSet)
    reelSet: ReelSet | null = null;

    @property(BalanceDisplay)
    display: BalanceDisplay | null = null;

    @property(Node)
    labelLayer: Node | null = null;

    @property(Node)
    bigWin: Node | null = null;

    @property(Label)
    bigWinTitle: Label | null = null;

    @property(Label)
    bigWinAmount: Label | null = null;

    private generation = 0;
    private skipRequested = false;
    private readonly waiters = new Set<() => void>();
    private lineLabel: Label | null = null;
    private loopTime = -1;

    /** 最近一次演出中各步驟金額加總，供與引擎結果對照 */
    lastPresentedTotal = 0;

    async present(result: SpinResult, bet: number, turbo: boolean): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        this.skipRequested = false;

        const steps = WinPresenter.buildSteps(result);
        const allPositions = WinPresenter.unique(steps.reduce<Position[]>((all, s) => all.concat(s.positions), []));
        this.lastPresentedTotal = steps.reduce((sum, s) => sum + s.amount, 0);

        const multiple = result.totalWin / bet;
        const tier = winTier(multiple);
        this.reelSet!.dimExcept(allPositions);
        const counting = this.display!.countWin(result.totalWin, WinPresenter.countDuration(multiple, tier, turbo));
        if (tier) this.showBigWin(tier);
        AudioManager.instance.play(tier ? 'bigWin' : 'lineWin');
        AudioManager.instance.play('countUp');

        for (const step of steps) {
            if (this.skipRequested || generation !== this.generation) break;
            this.showStep(step);
            console.log(`[present] ${step.lineIndex < 0 ? 'SCATTER' : `line ${step.lineIndex + 1}`} x${step.positions.length} amount=${formatMoney(step.amount)}`);
            await this.wait(turbo ? STEP_TIME_TURBO : STEP_TIME);
        }
        if (generation !== this.generation) return;

        await counting;
        AudioManager.instance.stop('countUp');
        if (tier && !this.skipRequested) await this.wait(turbo ? 0.5 : 1.2);
        if (generation !== this.generation) return;

        this.hideBigWin();
        this.hideLineLabel();
        this.startLoop(result, allPositions);
    }

    /** 玩家要求略過：立即完成 count-up 並進入循環高亮 */
    skip(): void {
        this.skipRequested = true;
        this.display?.finishWin();
        this.flushWaiters();
    }

    /** 清除所有演出（下一次旋轉開始時呼叫） */
    stop(): void {
        this.generation++;
        this.flushWaiters();
        this.loopTime = -1;
        this.paylines?.clear();
        this.reelSet?.resetSymbols();
        this.hideBigWin();
        this.hideLineLabel();
    }

    /** 在 BalanceDisplay 更新數值之後才同步，避免與下方贏分差一幀 */
    lateUpdate(): void {
        if (this.bigWin?.active) this.bigWinAmount!.string = formatMoney(this.display!.displayedWin);
    }

    update(dt: number): void {
        if (this.loopTime >= 0) {
            this.loopTime += dt;
            this.paylines!.setHighlightOpacity(Math.round(175 + 80 * Math.sin(this.loopTime * 5)));
        }
    }

    private showStep(step: WinStep): void {
        const paylines = this.paylines!;
        const reels = this.reelSet!;
        paylines.clear();
        reels.stopWinAnimations();
        const color = PaylineRenderer.colorFor(step.lineIndex);
        if (step.lineIndex >= 0) paylines.drawLine(step.lineIndex);
        paylines.highlightCells(step.positions, color);
        for (const [reel, row] of step.positions) reels.symbolAt(reel, row).playWinAnimation();

        const [lastReel, lastRow] = step.positions[step.positions.length - 1];
        const anchor = reels.cellPosition(lastReel, lastRow);
        const title = step.lineIndex < 0 ? 'SCATTER' : `LINE ${step.lineIndex + 1}`;
        this.showLineLabel(`${title}  ${formatMoney(step.amount)}`, color, anchor);
    }

    private startLoop(result: SpinResult, positions: Position[]): void {
        const paylines = this.paylines!;
        paylines.clear();
        for (const win of result.lineWins) paylines.drawLine(win.lineIndex);
        paylines.highlightCells(positions, new Color(255, 213, 74));
        for (const [reel, row] of positions) this.reelSet!.symbolAt(reel, row).playWinAnimation();
        this.loopTime = 0;
    }

    private showLineLabel(text: string, color: Color, anchor: Vec3): void {
        if (!this.lineLabel) {
            const node = instantiate(GameAssets.winLabelPrefab);
            node.parent = this.labelLayer;
            this.lineLabel = node.getComponent(Label);
        }
        const label = this.lineLabel!;
        const node = label.node;
        label.string = text;
        label.color = color;
        node.active = true;

        const halfWidth = 360 - 140;
        const x = Math.max(-halfWidth, Math.min(halfWidth, anchor.x));
        const y = Math.min(anchor.y + 58, 190);
        const opacity = node.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);
        node.setPosition(x, y - 18, 0);
        opacity.opacity = 0;
        tween(node).to(0.2, { position: new Vec3(x, y, 0) }, { easing: 'quadOut' }).start();
        tween(opacity).to(0.2, { opacity: 255 }).start();
    }

    private hideLineLabel(): void {
        if (this.lineLabel) this.lineLabel.node.active = false;
    }

    private showBigWin(tier: Exclude<WinTier, null>): void {
        const node = this.bigWin!;
        this.bigWinTitle!.string = tier;
        node.active = true;
        Tween.stopAllByTarget(node);
        node.setScale(0.3, 0.3, 1);
        tween(node).to(0.45, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    private hideBigWin(): void {
        if (!this.bigWin) return;
        Tween.stopAllByTarget(this.bigWin);
        this.bigWin.active = false;
    }

    private wait(seconds: number): Promise<void> {
        if (this.skipRequested) return Promise.resolve();
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

    private static buildSteps(result: SpinResult): WinStep[] {
        const steps: WinStep[] = result.lineWins.map((w) => ({
            lineIndex: w.lineIndex,
            positions: w.positions,
            amount: w.payout * result.multiplier,
        }));
        if (result.scatterWin) {
            steps.push({ lineIndex: -1, positions: result.scatterWin.positions, amount: result.scatterWin.payout * result.multiplier });
        }
        return steps;
    }

    private static unique(positions: Position[]): Position[] {
        const seen = new Set<string>();
        return positions.filter(([r, c]) => {
            const key = `${r},${c}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /** count-up 時長依贏分級距調整 */
    private static countDuration(multiple: number, tier: WinTier, turbo: boolean): number {
        let seconds: number;
        if (tier === 'EPIC WIN') seconds = 5;
        else if (tier === 'MEGA WIN') seconds = 4;
        else if (tier === 'BIG WIN') seconds = 3;
        else if (multiple >= 5) seconds = 1.6;
        else if (multiple >= 1) seconds = 1;
        else seconds = 0.5;
        return turbo ? seconds * 0.4 : seconds;
    }
}
