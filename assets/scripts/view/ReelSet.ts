import { _decorator, Color, Component, Graphics, Prefab, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { REEL_COUNT, ROW_COUNT } from '../core/config';
import type { Grid, Position, ReelStrips, SpinResult, SymbolId } from '../core/types';
import { ReelView } from './ReelView';
import type { SymbolView } from './SymbolView';

const { ccclass, property } = _decorator;

export interface ReelTiming {
    speed: number; // rows / s
    minSpinTime: number; // s
    stopDelay: number; // s，欄與欄之間的停輪間隔
    anticipationSpeed: number;
    anticipationTime: number;
}

export const NORMAL_TIMING: ReelTiming = { speed: 16, minSpinTime: 0.45, stopDelay: 0.12, anticipationSpeed: 7, anticipationTime: 1.3 };
export const TURBO_TIMING: ReelTiming = { speed: 26, minSpinTime: 0.15, stopDelay: 0.04, anticipationSpeed: 10, anticipationTime: 0.6 };

/** 觸發免費遊戲所需的 SCATTER 數量減一：達到此數量後，剩餘欄位進入 anticipation */
const ANTICIPATION_SCATTERS = 2;

/**
 * 管理五個滾輪：逐欄停止、anticipation 與快速停止。
 * 掛載於 ReelArea；滾輪本身位於 ReelMask 之下，anticipation 邊框畫在遮罩之外的 fxGraphics。
 */
@ccclass('ReelSet')
export class ReelSet extends Component {
    @property([ReelView])
    reels: ReelView[] = [];

    @property(Graphics)
    fxGraphics: Graphics | null = null;

    @property
    cellWidth = 140;

    @property
    cellHeight = 140;

    @property
    columnGap = 10;

    private quickStop = false;
    private readonly waiters = new Set<() => void>();
    private readonly anticipating = new Set<number>();
    private fxTime = 0;

    init(strips: ReelStrips, initialStops: readonly number[], symbolPrefab: Prefab): void {
        this.reels.forEach((reel, i) => reel.init(strips[i], symbolPrefab, initialStops[i]));
    }

    /** ReelArea 座標系中的格子中心 */
    cellPosition(reel: number, row: number, out = new Vec3()): Vec3 {
        const x = (reel - (REEL_COUNT - 1) / 2) * (this.cellWidth + this.columnGap);
        const y = ((ROW_COUNT - 1) / 2 - row) * this.cellHeight;
        return out.set(x, y, 0);
    }

    get isSpinning(): boolean {
        return this.reels.some((r) => !r.isIdle);
    }

    startSpin(timing: ReelTiming): void {
        this.quickStop = false;
        this.reels.forEach((reel) => reel.startSpin(timing.speed));
        AudioManager.instance.play('spinStart');
    }

    /** 等待最短旋轉時間（可被快速停止中斷） */
    waitMinimumSpin(timing: ReelTiming): Promise<void> {
        return this.wait(timing.minSpinTime);
    }

    async stopAll(result: SpinResult, timing: ReelTiming): Promise<void> {
        const landings: Promise<void>[] = [];
        let landedScatters = 0;

        for (let i = 0; i < this.reels.length; i++) {
            const reel = this.reels[i];
            if (i > 0) await this.wait(timing.stopDelay);

            const anticipate = !this.quickStop && landedScatters >= ANTICIPATION_SCATTERS;
            if (anticipate) {
                // 前面的欄位全部落定後才開始，讓玩家看清楚已經有兩個 SCATTER
                await Promise.all(landings);
                for (let j = i; j < this.reels.length; j++) this.reels[j].setSpeed(timing.anticipationSpeed);
                this.anticipating.add(i);
                AudioManager.instance.play('anticipation');
                await this.wait(timing.anticipationTime);
            }

            const landing = reel.stop(result.stopIndices[i], this.quickStop ? 1 : 2).then(() => {
                this.anticipating.delete(i);
                AudioManager.instance.play('reelStop');
            });
            landings.push(landing);
            if (anticipate) await landing;

            landedScatters += result.grid[i].filter((s) => s === 'SCATTER').length;
        }
        await Promise.all(landings);
        this.anticipating.clear();
        this.fxGraphics?.clear();
    }

    /** 快速停止：取消所有等待與 anticipation，剩餘欄位立即停輪 */
    requestQuickStop(): void {
        this.quickStop = true;
        // 引擎的 Babel 設定以寬鬆模式轉譯 spread / for-of，Set 必須先轉成陣列
        Array.from(this.waiters).forEach((resolve) => resolve());
        this.waiters.clear();
    }

    getVisibleGrid(): Grid {
        return this.reels.map((reel) => reel.getVisibleSymbols());
    }

    symbolAt(reel: number, row: number): SymbolView {
        return this.reels[reel].getSymbolView(row);
    }

    /** 非中獎格降低亮度 */
    dimExcept(positions: readonly Position[]): void {
        const lit = new Set(positions.map(([r, c]) => `${r},${c}`));
        this.forEachVisible((view, reel, row) => view.setDim(!lit.has(`${reel},${row}`)));
    }

    stopWinAnimations(): void {
        this.forEachVisible((view) => view.stopWinAnimation());
    }

    resetSymbols(): void {
        this.forEachVisible((view) => {
            view.setDim(false);
            view.stopWinAnimation();
        });
    }

    countSymbolNodes(): number {
        return this.reels.reduce((sum, reel) => sum + reel.node.children.length, 0);
    }

    symbolIdAt(reel: number, row: number): SymbolId {
        return this.symbolAt(reel, row).id!;
    }

    update(dt: number): void {
        const g = this.fxGraphics;
        if (!g) return;
        if (this.anticipating.size === 0) return;

        this.fxTime += dt;
        g.clear();
        const pulse = 0.55 + 0.45 * Math.sin(this.fxTime * 10);
        const center = new Vec3();
        for (const reel of Array.from(this.anticipating)) {
            this.cellPosition(reel, 1, center);
            const w = this.cellWidth + 12;
            const h = this.cellHeight * ROW_COUNT + 12;
            g.lineWidth = 6;
            g.strokeColor = new Color(255, 214, 74, Math.round(255 * pulse));
            g.roundRect(center.x - w / 2, center.y - h / 2, w, h, 16);
            g.stroke();
            g.lineWidth = 14;
            g.strokeColor = new Color(70, 230, 214, Math.round(90 * pulse));
            g.roundRect(center.x - w / 2 - 6, center.y - h / 2 - 6, w + 12, h + 12, 20);
            g.stroke();
        }
    }

    private forEachVisible(fn: (view: SymbolView, reel: number, row: number) => void): void {
        this.reels.forEach((reel, r) => {
            for (let row = 0; row < ROW_COUNT; row++) fn(reel.getSymbolView(row), r, row);
        });
    }

    private wait(seconds: number): Promise<void> {
        if (this.quickStop || seconds <= 0) return Promise.resolve();
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
}
