import { _decorator, Color, Component, Label, Tween, tween, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { FREE_SPIN_MAX_MULTIPLIER } from '../core/config';
import { formatMoney } from '../ui/format';
import { Banner } from './Banner';

const { ccclass, property } = _decorator;

const POP_SCALE = new Vec3(1.35, 1.35, 1);
const BANNER_COLOR = new Color(143, 252, 239);

/**
 * 免費遊戲 HUD（盤面左側：剩餘次數、目前倍數）與進場 / 重觸發 / 結算橫幅。
 * 橫幅可點擊略過；是否接受略過由 GameController 依狀態決定後呼叫 skip()。
 */
@ccclass('FreeSpinPanel')
export class FreeSpinPanel extends Component {
    @property(Label)
    remainingLabel: Label | null = null;

    @property(Label)
    multiplierLabel: Label | null = null;

    @property(Banner)
    banner: Banner | null = null;

    private shownMultiplier = 0;

    show(): void {
        this.node.active = true;
        this.shownMultiplier = 0;
    }

    hide(): void {
        this.skip();
        this.node.active = false;
    }

    updateHud(remaining: number, multiplier: number): void {
        this.remainingLabel!.string = String(remaining);
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
        return this.banner!.show('FREE SPINS', `${spins} SPINS  ·  MULTIPLIER UP TO x${FREE_SPIN_MAX_MULTIPLIER}`, turbo ? 1.2 : 2.6, BANNER_COLOR);
    }

    showRetrigger(extra: number, turbo: boolean): Promise<void> {
        AudioManager.instance.play('freeSpinTrigger');
        return this.banner!.show(`+${extra} FREE SPINS`, 'RETRIGGERED', turbo ? 0.8 : 1.6, BANNER_COLOR);
    }

    showOutro(totalWin: number, turbo: boolean): Promise<void> {
        AudioManager.instance.play('freeSpinEnd');
        return this.banner!.show('TOTAL WIN', formatMoney(totalWin), turbo ? 1.2 : 3, BANNER_COLOR);
    }

    skip(): void {
        this.banner?.skip();
    }
}
