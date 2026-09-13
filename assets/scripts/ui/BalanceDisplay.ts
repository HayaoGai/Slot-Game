import { _decorator, Component, Label } from 'cc';
import { formatMoney } from './format';

const { ccclass, property } = _decorator;

/** 餘額與贏分顯示；贏分以數字滾動（count-up）方式呈現。 */
@ccclass('BalanceDisplay')
export class BalanceDisplay extends Component {
    @property(Label)
    balanceLabel: Label | null = null;

    @property(Label)
    winLabel: Label | null = null;

    private from = 0;
    private to = 0;
    private shown = 0;
    private time = 0;
    private duration = 0;
    private pending: (() => void) | null = null;

    get displayedWin(): number {
        return this.shown;
    }

    setBalance(cents: number): void {
        this.balanceLabel!.string = formatMoney(cents);
    }

    /** 從目前顯示值滾動到 target，完成時 resolve */
    countWin(target: number, seconds: number): Promise<void> {
        this.resolvePending();
        this.from = this.shown;
        this.to = target;
        this.time = 0;
        this.duration = seconds;
        return new Promise((resolve) => {
            this.pending = resolve;
            if (seconds <= 0) this.finishWin();
        });
    }

    finishWin(): void {
        this.shown = this.to;
        this.time = this.duration;
        this.render();
        this.resolvePending();
    }

    clearWin(): void {
        this.from = this.to = this.shown = 0;
        this.time = this.duration = 0;
        this.render();
        this.resolvePending();
    }

    update(dt: number): void {
        if (!this.pending) return;
        this.time += dt;
        const k = this.duration > 0 ? Math.min(1, this.time / this.duration) : 1;
        const eased = 1 - (1 - k) * (1 - k);
        this.shown = Math.round(this.from + (this.to - this.from) * eased);
        this.render();
        if (k >= 1) this.finishWin();
    }

    private render(): void {
        this.winLabel!.string = this.shown > 0 ? formatMoney(this.shown) : '';
    }

    private resolvePending(): void {
        const resolve = this.pending;
        this.pending = null;
        resolve?.();
    }
}
