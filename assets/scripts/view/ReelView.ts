import { _decorator, Component, instantiate, Prefab } from 'cc';
import { ROW_COUNT } from '../core/config';
import type { BonusPrize, SymbolId } from '../core/types';
import { randomBonusPrize } from './bonusVisuals';
import { SymbolView } from './SymbolView';

const { ccclass, property } = _decorator;

/** 3 格可視 + 上下各 1 格緩衝 */
const POOL_SIZE = ROW_COUNT + 2;
const WINDUP_ROWS = 0.22;
const WINDUP_TIME = 0.1;
const ACCELERATION = 90; // rows / s²
const OVERSHOOT_PX = 15;
const BOUNCE_TIME = 0.12;
/** 填充符號與上下幾格內的符號都不重複 */
const FILLER_SPACING = 2;

type Phase = 'idle' | 'windup' | 'spin' | 'stopping' | 'bounce';

interface PooledSymbol {
    view: SymbolView;
    /** 目前顯示的 strip 索引（未取模的「磁帶」座標） */
    tape: number;
}

interface StopRequest {
    index: number;
    minTravel: number;
    /** 停輪後由上到下三格的 BONUS 獎項 */
    prizes: readonly (BonusPrize | null)[];
}

/**
 * 單一滾輪。
 *
 * 以「磁帶」模型描述滾動：pos 表示最上方可視列正對 strip 的哪個索引。
 * 往下滾動時 pos 遞減，節點 y = (pos - tape) × cellHeight + cellHeight。
 * 超出下界的節點回收到最上方，並指派新的符號。
 *
 * strip 含堆疊與成組的符號，旋轉時若直接顯示會看到一段段相同符號，因此除了最終停輪視窗之外，
 * 從上方進入的一律是依 strip 組成隨機抽出、且上下 FILLER_SPACING 格內不重複的填充符號（純表現，不影響結果）。
 * 開始停輪時算出目標位置，只有 [realFrom, realTo] 這段最終視窗顯示真實 strip，
 * 並確保這段視窗全部是之後才從上方進入的格子；pos 對齊到 SpinResult.stopIndices 後，
 * 結果符號自然會依序從上方進入可視區，不需要事後替換貼圖。
 * BONUS 的獎項同理：停輪視窗內的 BONUS 進場時就帶著引擎抽出的獎項，其餘 BONUS 顯示隨機獎項。
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
    private pendingStop: StopRequest | null = null;
    private resultPrizes: readonly (BonusPrize | null)[] | null = null;
    /** 磁帶座標落在 [realFrom, realTo] 的格子顯示真實 strip，其餘顯示填充符號 */
    private realFrom = -Infinity;
    private realTo = Infinity;
    private bet = 0;
    private landed: (() => void) | null = null;

    get isIdle(): boolean {
        return this.phase === 'idle';
    }

    get isStopRequested(): boolean {
        return this.pendingStop !== null || this.phase === 'stopping' || this.phase === 'bounce';
    }

    init(strip: readonly SymbolId[], symbolPrefab: Prefab, initialStop: number, bet: number): void {
        this.strip = strip;
        this.bet = bet;
        if (this.pool.length === 0) {
            for (let i = 0; i < POOL_SIZE; i++) {
                const node = instantiate(symbolPrefab);
                node.parent = this.node;
                this.pool.push({ view: node.getComponent(SymbolView)!, tape: 0 });
            }
        }
        this.pos = initialStop;
        this.realFrom = -Infinity;
        this.realTo = Infinity;
        this.resultPrizes = null;
        this.pool.forEach((item, i) => this.assign(item, initialStop - 1 + i));
        this.layout();
    }

    /** 下注額改變：BONUS 上的金額依新的總注重新換算 */
    setBet(bet: number): void {
        this.bet = bet;
        for (const item of this.pool) item.view.setBet(bet);
    }

    startSpin(rowsPerSecond: number): void {
        this.maxSpeed = rowsPerSecond;
        this.speed = 0;
        this.pendingStop = null;
        this.realFrom = Infinity;
        this.realTo = -Infinity;
        this.phase = 'windup';
        this.phaseTime = 0;
        this.phaseFrom = this.pos;
    }

    /** 旋轉中改變速度（anticipation 減速） */
    setSpeed(rowsPerSecond: number): void {
        this.maxSpeed = rowsPerSecond;
    }

    /** 要求停在 stopIndex；minTravel 為至少再滾動的列數，確保結果符號由上方進入。 */
    stop(stopIndex: number, minTravel = 2, prizes: readonly (BonusPrize | null)[] = []): Promise<void> {
        return new Promise((resolve) => {
            this.landed = resolve;
            this.pendingStop = { index: stopIndex, minTravel, prizes };
            if (this.phase === 'idle') this.beginStop();
        });
    }

    /** 由上到下的可視符號，供結果比對 */
    getVisibleSymbols(): SymbolId[] {
        return this.visibleViews().map((v) => v.id!);
    }

    /** 由上到下的可視 BONUS 獎項（非 BONUS 為 null），供結果比對 */
    getVisiblePrizes(): (BonusPrize | null)[] {
        return this.visibleViews().map((v) => v.bonusPrize);
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
        // 池中現有的格子已顯示填充符號，停輪後的可視列必須全部是之後才從上方進入的格子
        const poolTop = this.pool.reduce((min, item) => Math.min(min, item.tape), Infinity);
        const latest = Math.min(Math.floor(this.pos - request.minTravel), poolTop - ROW_COUNT);
        const offset = (((latest - request.index) % length) + length) % length;
        this.target = latest - offset;
        this.targetIndex = request.index;
        this.resultPrizes = request.prizes;
        // 停輪途中可能滾過大半條 strip，只有最終視窗（含回彈時會露出的上方緩衝格）顯示真實符號
        this.realFrom = this.target - 1;
        this.realTo = this.target + ROW_COUNT - 1;
        this.speed = Math.max(this.speed, this.maxSpeed * 0.75, 4);
        this.enter('stopping');
    }

    private finish(): void {
        // 將磁帶座標正規化回 [0, length)，避免長時間遊玩後數值無限增長
        const shift = this.target - this.targetIndex;
        this.pos = this.targetIndex;
        for (const item of this.pool) item.tape -= shift;
        this.realFrom = -Infinity;
        this.realTo = Infinity;
        this.resultPrizes = null;
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

    private isReal(tape: number): boolean {
        return tape >= this.realFrom && tape <= this.realTo;
    }

    /** 某個磁帶座標目前或即將顯示的符號；尚未決定時回傳 null */
    private symbolNear(tape: number): SymbolId | null {
        if (this.isReal(tape)) return this.symbolAt(tape);
        return this.pool.find((p) => p.tape === tape)?.view.id ?? null;
    }

    /** 依 strip 組成隨機抽一個與上下 FILLER_SPACING 格內都不同的符號；只影響畫面，因此直接使用 Math.random */
    private fillerSymbol(tape: number): SymbolId {
        const nearby: (SymbolId | null)[] = [];
        for (let d = 1; d <= FILLER_SPACING; d++) nearby.push(this.symbolNear(tape - d), this.symbolNear(tape + d));
        let symbol: SymbolId;
        do symbol = this.strip[Math.floor(Math.random() * this.strip.length)];
        while (nearby.indexOf(symbol) !== -1);
        return symbol;
    }

    /** 停輪視窗內的 BONUS 使用引擎結果的獎項 */
    private resultPrizeAt(tape: number): BonusPrize | null {
        if (!this.resultPrizes || !this.isReal(tape)) return null;
        const row = tape - this.target;
        return row >= 0 && row < ROW_COUNT ? this.resultPrizes[row] ?? null : null;
    }

    private assign(item: PooledSymbol, tape: number): void {
        item.tape = tape;
        const symbol = this.isReal(tape) ? this.symbolAt(tape) : this.fillerSymbol(tape);
        item.view.setSymbol(symbol);
        if (symbol === 'BONUS') item.view.setBonusPrize(this.resultPrizeAt(tape) ?? randomBonusPrize(), this.bet);
    }

    private layout(): void {
        // 回收：向下捲出下界的移到最上方；回彈向上時反之
        let recycled = true;
        while (recycled) {
            recycled = false;
            let top = this.pool[0];
            let bottom = this.pool[0];
            for (const item of this.pool) {
                if (item.tape < top.tape) top = item;
                if (item.tape > bottom.tape) bottom = item;
            }
            for (const item of this.pool) {
                if (item.tape > this.pos + ROW_COUNT + 0.5) {
                    this.assign(item, top.tape - 1);
                    recycled = true;
                    break;
                }
                if (item.tape < this.pos - 1.5) {
                    this.assign(item, bottom.tape + 1);
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
