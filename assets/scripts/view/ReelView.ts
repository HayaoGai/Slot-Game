import { _decorator, Component, instantiate, Prefab } from 'cc';
import { ROW_COUNT } from '../core/config';
import type { SymbolId } from '../core/types';
import { SymbolView } from './SymbolView';

const { ccclass, property } = _decorator;

/** 3 格可視 + 上下各 1 格緩衝 */
const POOL_SIZE = ROW_COUNT + 2;
const WINDUP_ROWS = 0.22;
const WINDUP_TIME = 0.1;
const ACCELERATION = 90; // rows / s²
const OVERSHOOT_PX = 15;
const BOUNCE_TIME = 0.12;

type Phase = 'idle' | 'windup' | 'spin' | 'stopping' | 'bounce';

interface PooledSymbol {
    view: SymbolView;
    /** 目前顯示的 strip 索引（未取模的「磁帶」座標） */
    tape: number;
}

/**
 * 單一滾輪。
 *
 * 以「磁帶」模型描述滾動：pos 表示最上方可視列正對 strip 的哪個索引。
 * 往下滾動時 pos 遞減，節點 y = (pos - tape) × cellHeight + cellHeight。
 * 超出下界的節點回收到最上方，並指派 strip 上的下一個符號。
 *
 * 因為旋轉期間顯示的就是真實 strip 序列，停輪時只要把 pos 對齊到 SpinResult.stopIndices，
 * 結果符號自然會依序從上方進入可視區，不需要事後替換貼圖。
 */
@ccclass('ReelView')
export class ReelView extends Component {
    @property
    cellHeight = 140;

    private strip: readonly SymbolId[] = [];
    private pool: PooledSymbol[] = [];
    private pos = 0;
    private speed = 0;
    private maxSpeed = 0;
    private phase: Phase = 'idle';
    private phaseTime = 0;
    private phaseFrom = 0;
    private target = 0;
    private targetIndex = 0;
    private pendingStop: { index: number; minTravel: number } | null = null;
    private landed: (() => void) | null = null;

    get isIdle(): boolean {
        return this.phase === 'idle';
    }

    get isStopRequested(): boolean {
        return this.pendingStop !== null || this.phase === 'stopping' || this.phase === 'bounce';
    }

    init(strip: readonly SymbolId[], symbolPrefab: Prefab, initialStop: number): void {
        this.strip = strip;
        if (this.pool.length === 0) {
            for (let i = 0; i < POOL_SIZE; i++) {
                const node = instantiate(symbolPrefab);
                node.parent = this.node;
                this.pool.push({ view: node.getComponent(SymbolView)!, tape: 0 });
            }
        }
        this.pos = initialStop;
        this.pool.forEach((item, i) => {
            item.tape = initialStop - 1 + i;
            item.view.setSymbol(this.symbolAt(item.tape));
        });
        this.layout();
    }

    startSpin(rowsPerSecond: number): void {
        this.maxSpeed = rowsPerSecond;
        this.speed = 0;
        this.pendingStop = null;
        this.phase = 'windup';
        this.phaseTime = 0;
        this.phaseFrom = this.pos;
    }

    /** 旋轉中改變速度（anticipation 減速） */
    setSpeed(rowsPerSecond: number): void {
        this.maxSpeed = rowsPerSecond;
    }

    /** 要求停在 stopIndex；minTravel 為至少再滾動的列數，確保結果符號由上方進入。 */
    stop(stopIndex: number, minTravel = 2): Promise<void> {
        return new Promise((resolve) => {
            this.landed = resolve;
            this.pendingStop = { index: stopIndex, minTravel };
            if (this.phase === 'idle') this.beginStop();
        });
    }

    /** 由上到下的可視符號，供結果比對 */
    getVisibleSymbols(): SymbolId[] {
        return this.visibleViews().map((v) => v.id!);
    }

    /** row 0 為最上方 */
    getSymbolView(row: number): SymbolView {
        return this.visibleViews()[row];
    }

    getPoolSize(): number {
        return this.pool.length;
    }

    update(dt: number): void {
        if (this.phase === 'idle') return;
        this.phaseTime += dt;

        switch (this.phase) {
            case 'windup': {
                const k = Math.min(1, this.phaseTime / WINDUP_TIME);
                this.pos = this.phaseFrom + WINDUP_ROWS * Math.sin(k * Math.PI * 0.5);
                if (k >= 1) this.enter('spin');
                if (this.pendingStop) this.beginStop();
                break;
            }
            case 'spin': {
                if (this.speed < this.maxSpeed) this.speed = Math.min(this.maxSpeed, this.speed + ACCELERATION * dt);
                else this.speed = Math.max(this.maxSpeed, this.speed - ACCELERATION * dt);
                this.pos -= this.speed * dt;
                if (this.pendingStop) this.beginStop();
                break;
            }
            case 'stopping': {
                this.pos -= this.speed * dt;
                const overshoot = OVERSHOOT_PX / this.cellHeight;
                if (this.pos <= this.target - overshoot) {
                    this.pos = this.target - overshoot;
                    this.enter('bounce');
                }
                break;
            }
            case 'bounce': {
                const k = Math.min(1, this.phaseTime / BOUNCE_TIME);
                const eased = 1 - (1 - k) * (1 - k);
                this.pos = this.target - (OVERSHOOT_PX / this.cellHeight) * (1 - eased);
                if (k >= 1) this.finish();
                break;
            }
        }
        this.layout();
    }

    private beginStop(): void {
        const request = this.pendingStop!;
        this.pendingStop = null;
        const length = this.strip.length;
        const latest = Math.floor(this.pos - request.minTravel);
        const offset = (((latest - request.index) % length) + length) % length;
        this.target = latest - offset;
        this.targetIndex = request.index;
        this.speed = Math.max(this.speed, this.maxSpeed * 0.75, 4);
        this.enter('stopping');
    }

    private finish(): void {
        // 將磁帶座標正規化回 [0, length)，避免長時間遊玩後數值無限增長
        const shift = this.target - this.targetIndex;
        this.pos = this.targetIndex;
        for (const item of this.pool) item.tape -= shift;
        this.speed = 0;
        this.enter('idle');
        this.layout();
        const done = this.landed;
        this.landed = null;
        done?.();
    }

    private enter(phase: Phase): void {
        this.phase = phase;
        this.phaseTime = 0;
        this.phaseFrom = this.pos;
    }

    private symbolAt(tape: number): SymbolId {
        const length = this.strip.length;
        return this.strip[((tape % length) + length) % length];
    }

    private layout(): void {
        // 回收：向下捲出下界的移到最上方；回彈向上時反之
        let recycled = true;
        while (recycled) {
            recycled = false;
            let min = Infinity;
            let max = -Infinity;
            for (const item of this.pool) {
                min = Math.min(min, item.tape);
                max = Math.max(max, item.tape);
            }
            for (const item of this.pool) {
                if (item.tape > this.pos + ROW_COUNT + 0.5) {
                    item.tape = min - 1;
                    item.view.setSymbol(this.symbolAt(item.tape));
                    recycled = true;
                    break;
                }
                if (item.tape < this.pos - 1.5) {
                    item.tape = max + 1;
                    item.view.setSymbol(this.symbolAt(item.tape));
                    recycled = true;
                    break;
                }
            }
        }
        for (const item of this.pool) {
            item.view.node.setPosition(0, (this.pos - item.tape) * this.cellHeight + this.cellHeight, 0);
        }
    }

    private visibleViews(): SymbolView[] {
        const top = Math.round(this.pos);
        const views: SymbolView[] = [];
        for (let row = 0; row < ROW_COUNT; row++) {
            const item = this.pool.find((p) => p.tape === top + row);
            if (!item) throw new Error(`Reel ${this.node.name}: no symbol at row ${row}`);
            views.push(item.view);
        }
        return views;
    }
}
