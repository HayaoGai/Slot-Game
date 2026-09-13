import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { formatMoney } from '../ui/format';

const { ccclass, property } = _decorator;

const POP_SCALE = new Vec3(1.35, 1.35, 1);

/**
 * 免費遊戲 HUD（剩餘次數、目前倍數）與進場 / 重觸發 / 結算橫幅。
 * 橫幅可點擊略過；是否接受略過由 GameController 依狀態決定後呼叫 skip()。
 */
@ccclass('FreeSpinPanel')
export class FreeSpinPanel extends Component {
    @property(Label)
    titleLabel: Label | null = null;

    @property(Label)
    remainingLabel: Label | null = null;

    @property(Label)
    multiplierLabel: Label | null = null;

    @property(Node)
    overlay: Node | null = null;

    @property(Label)
    messageLabel: Label | null = null;

    @property(Label)
    subLabel: Label | null = null;

    private readonly waiters = new Set<() => void>();
    private shownMultiplier = 0;

    /** 由 GameController 綁定橫幅點擊事件 */
    get overlayNode(): Node {
        return this.overlay!;
    }

    show(): void {
        this.node.active = true;
        this.overlay!.active = false;
        this.titleLabel!.string = 'FREE SPINS';
        this.shownMultiplier = 0;
    }

    hide(): void {
        this.skip();
        this.overlay!.active = false;
        this.node.active = false;
    }

    updateHud(remaining: number, multiplier: number): void {
        this.remainingLabel!.string = `LEFT ${remaining}`;
        this.multiplierLabel!.string = `x${multiplier}`;
        if (multiplier !== this.shownMultiplier) {
            this.shownMultiplier = multiplier;
            const node = this.multiplierLabel!.node;
            Tween.stopAllByTarget(node);
            node.setScale(POP_SCALE);
            tween(node).to(0.25, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
        }
    }

    showIntro(spins: number, turbo: boolean): Promise<void> {
        AudioManager.instance.play('freeSpinTrigger');
        return this.banner('FREE SPINS', `${spins} SPINS  ·  MULTIPLIER UP TO x5`, turbo ? 1.2 : 2.6);
    }

    showRetrigger(extra: number, turbo: boolean): Promise<void> {
        AudioManager.instance.play('freeSpinTrigger');
        return this.banner(`+${extra} FREE SPINS`, 'RETRIGGERED', turbo ? 0.8 : 1.6);
    }

    showOutro(totalWin: number, turbo: boolean): Promise<void> {
        AudioManager.instance.play('freeSpinEnd');
        return this.banner('TOTAL WIN', formatMoney(totalWin), turbo ? 1.2 : 3);
    }

    skip(): void {
        Array.from(this.waiters).forEach((done) => done());
    }

    private async banner(message: string, sub: string, seconds: number): Promise<void> {
        const overlay = this.overlay!;
        const opacity = overlay.getComponent(UIOpacity)!;
        this.messageLabel!.string = message;
        this.subLabel!.string = sub;

        overlay.active = true;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.2, { opacity: 255 }).start();
        const title = this.messageLabel!.node;
        Tween.stopAllByTarget(title);
        title.setScale(0.4, 0.4, 1);
        tween(title).to(0.4, { scale: Vec3.ONE }, { easing: 'backOut' }).start();

        await this.wait(seconds);

        Tween.stopAllByTarget(opacity);
        overlay.active = false;
    }

    private wait(seconds: number): Promise<void> {
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
