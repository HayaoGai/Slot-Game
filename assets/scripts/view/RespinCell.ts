import { _decorator, Color, Component, Graphics, instantiate, Node, Prefab, Tween, tween, Vec3 } from 'cc';
import type { BonusPrize } from '../core/types';
import { randomBonusPrize } from './bonusVisuals';
import { SymbolView } from './SymbolView';

const { ccclass, property } = _decorator;

const OVERSHOOT_PX = 15;
const BOUNCE_TIME = 0.12;
/** 旋轉中填充面出現 BONUS 的比例（其餘為空白），純表現 */
const FILLER_BONUS_RATE = 0.4;
const LOCK_COLOR = new Color(255, 122, 217);
/** 符號貼圖四周有 9px 透明留白，放大到此比例仍不會被格子遮罩裁切 */
const POP_SCALE = new Vec3(1.12, 1.12, 1);

type Phase = 'idle' | 'spin' | 'settle' | 'bounce';

/**
 * Hold & Spin 盤面中的單一格：只有一格高的迷你滾輪。
 *
 * 兩個符號面循環滾動：current 位於格子中央往下移出，next 從上方進場，移動滿一格就交換並替 next 換上新內容。
 * 要求停輪後，下一個進場的面換成結果（BONUS 或空白），它完全進場後再多滑 OVERSHOOT_PX 並回彈對齊。
 * 結果面一定是停輪要求之後才從上方進場，畫面與結果在結構上一致。已鎖定的格子不再轉動，外框發光。
 */
@ccclass('RespinCell')
export class RespinCell extends Component {
    /** 位於遮罩下，承載兩個符號面 */
    @property(Node)
    tape: Node | null = null;

    /** 鎖定與 anticipation 外框 */
    @property(Graphics)
    frame: Graphics | null = null;

    @property
    cellSize = 140;

    private current: SymbolView | null = null;
    private next: SymbolView | null = null;
    private offset = 0; // px，current 在中央下方的距離
    private speed = 0; // px / s
    private phase: Phase = 'idle';
    private phaseTime = 0;
    private bet = 0;
    private locked = false;
    private stopRequested = false;
    private result: BonusPrize | null = null;
    private landing: SymbolView | null = null;
    private landed: (() => void) | null = null;
    private anticipating = false;
    private fxTime = 0;

    get isLocked(): boolean {
        return this.locked;
    }

    /** 已鎖定格的獎項 */
    get prize(): BonusPrize | null {
        return this.locked ? this.current!.bonusPrize : null;
    }

    init(symbolPrefab: Prefab): void {
        if (this.current) return;
        const make = () => {
            const node = instantiate(symbolPrefab);
            node.parent = this.tape;
            return node.getComponent(SymbolView)!;
        };
        this.current = make();
        this.next = make();
        this.clear();
    }

    /** 空格、解除鎖定 */
    clear(): void {
        this.locked = false;
        this.anticipating = false;
        this.stopRequested = false;
        this.landing = null;
        this.offset = 0;
        this.enter('idle');
        RespinCell.showBlank(this.current!);
        RespinCell.showBlank(this.next!);
        this.layout();
        this.drawFrame();
    }

    /** 直接鎖定（觸發時盤面上既有的 BONUS） */
    lock(prize: BonusPrize, bet: number): void {
        this.bet = bet;
        this.locked = true;
        this.offset = 0;
        this.enter('idle');
        this.showPrize(this.current!, prize, false);
        RespinCell.showBlank(this.next!);
        this.layout();
        this.drawFrame();
    }

    startSpin(rowsPerSecond: number, bet: number): void {
        if (this.locked) return;
        this.bet = bet;
        this.speed = rowsPerSecond * this.cellSize;
        this.stopRequested = false;
        this.result = null;
        this.landing = null;
        this.fillFiller(this.next!);
        this.enter('spin');
    }

    /** 要求停輪；prize 為 null 表示落空。完全落定（含回彈）後 resolve。 */
    stop(prize: BonusPrize | null): Promise<void> {
        return new Promise((resolve) => {
            if (this.phase === 'idle') {
                if (prize) this.lock(prize, this.bet);
                resolve();
                return;
            }
            this.landed = resolve;
            this.result = prize;
            this.stopRequested = true;
        });
    }

    setAnticipation(on: boolean): void {
        this.anticipating = on;
        this.fxTime = 0;
        this.drawFrame();
    }

    /** 落定與結算時的強調動畫 */
    pop(): void {
        const node = this.current!.node;
        Tween.stopAllByTarget(node);
        node.setScale(POP_SCALE);
        tween(node).to(0.3, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    update(dt: number): void {
        if (this.anticipating) {
            this.fxTime += dt;
            this.drawFrame();
        }
        if (this.phase === 'idle') return;
        this.phaseTime += dt;

        switch (this.phase) {
            case 'spin':
                this.offset += this.speed * dt;
                while (this.phase === 'spin' && this.offset >= this.cellSize) {
                    this.offset -= this.cellSize;
                    this.swap();
                }
                break;
            case 'settle':
                this.offset += this.speed * dt;
                if (this.offset >= OVERSHOOT_PX) {
                    this.offset = OVERSHOOT_PX;
                    this.enter('bounce');
                }
                break;
            case 'bounce': {
                const k = Math.min(1, this.phaseTime / BOUNCE_TIME);
                this.offset = OVERSHOOT_PX * (1 - k) * (1 - k);
                if (k >= 1) this.finish();
                break;
            }
        }
        this.layout();
    }

    private swap(): void {
        const leaving = this.current!;
        this.current = this.next;
        this.next = leaving;

        if (this.landing && this.current === this.landing) {
            // 結果面已進場：上方的面清成空白，避免回彈時從格子上緣露出
            RespinCell.showBlank(this.next!);
            this.enter(this.offset >= OVERSHOOT_PX ? 'bounce' : 'settle');
            if (this.phase === 'bounce') this.offset = OVERSHOOT_PX;
            return;
        }
        if (this.stopRequested && !this.landing) {
            this.landing = this.next;
            if (this.result) this.showPrize(this.next!, this.result, false);
            else RespinCell.showBlank(this.next!);
        } else {
            this.fillFiller(this.next!);
        }
    }

    private finish(): void {
        this.offset = 0;
        this.enter('idle');
        this.layout();
        this.anticipating = false;
        this.stopRequested = false;
        this.landing = null;
        if (this.result) {
            this.locked = true;
            this.pop();
        }
        this.drawFrame();
        const done = this.landed;
        this.landed = null;
        done?.();
    }

    private enter(phase: Phase): void {
        this.phase = phase;
        this.phaseTime = 0;
    }

    private layout(): void {
        this.current!.node.setPosition(0, -this.offset, 0);
        this.next!.node.setPosition(0, this.cellSize - this.offset, 0);
    }

    private fillFiller(view: SymbolView): void {
        if (Math.random() < FILLER_BONUS_RATE) this.showPrize(view, randomBonusPrize(), true);
        else RespinCell.showBlank(view);
    }

    private showPrize(view: SymbolView, prize: BonusPrize, dim: boolean): void {
        view.node.active = true;
        view.node.setScale(Vec3.ONE);
        view.setSymbol('BONUS');
        view.setBonusPrize(prize, this.bet);
        view.setDim(dim);
    }

    private static showBlank(view: SymbolView): void {
        Tween.stopAllByTarget(view.node);
        view.node.active = false;
    }

    private drawFrame(): void {
        const g = this.frame!;
        g.clear();
        if (!this.locked && !this.anticipating) return;
        const size = this.cellSize + 2;
        if (this.anticipating) {
            const pulse = 0.55 + 0.45 * Math.sin(this.fxTime * 10);
            g.lineWidth = 7;
            g.strokeColor = new Color(255, 213, 74, Math.round(255 * pulse));
        } else {
            g.lineWidth = 5;
            g.strokeColor = LOCK_COLOR;
        }
        g.roundRect(-size / 2, -size / 2, size, size, 18);
        g.stroke();
    }
}
