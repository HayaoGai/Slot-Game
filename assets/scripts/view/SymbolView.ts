import { _decorator, Color, Component, Label, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import type { BonusPrize, SymbolId } from '../core/types';
import { formatBonusPrize } from '../ui/format';
import { bonusTextColor } from './bonusVisuals';
import { GameAssets } from './GameAssets';

const { ccclass, property } = _decorator;

const DIM_COLOR = new Color(85, 85, 95, 255);
const DIM_TEXT = 0.4;
const WIN_SCALE = new Vec3(1.1, 1.1, 1);

@ccclass('SymbolView')
export class SymbolView extends Component {
    @property(Sprite)
    sprite: Sprite | null = null;

    /** BONUS 的獎項文字 */
    @property(Label)
    valueLabel: Label | null = null;

    private symbolId: SymbolId | null = null;
    private prize: BonusPrize | null = null;
    private bet = 0;
    private dim = false;
    private winTween: Tween<Node> | null = null;

    get id(): SymbolId | null {
        return this.symbolId;
    }

    get bonusPrize(): BonusPrize | null {
        return this.prize;
    }

    onLoad(): void {
        if (!this.sprite) this.sprite = this.getComponent(Sprite);
        if (this.sprite) this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }

    setSymbol(id: SymbolId): void {
        if (id !== 'BONUS' && this.prize) this.setBonusPrize(null, this.bet);
        if (id === this.symbolId) return;
        this.symbolId = id;
        this.sprite!.spriteFrame = GameAssets.symbolFrame(id);
    }

    /** 只有 BONUS 帶獎項；現金金額依總注換算，下注額改變時以 setBet() 更新 */
    setBonusPrize(prize: BonusPrize | null, bet: number): void {
        this.prize = prize;
        this.bet = bet;
        this.renderValue();
    }

    setBet(bet: number): void {
        if (bet === this.bet) return;
        this.bet = bet;
        this.renderValue();
    }

    setDim(dim: boolean): void {
        this.dim = dim;
        this.sprite!.color = dim ? DIM_COLOR : Color.WHITE;
        this.renderValue();
    }

    playWinAnimation(): void {
        this.stopWinAnimation();
        this.winTween = tween(this.node)
            .to(0.22, { scale: WIN_SCALE }, { easing: 'sineOut' })
            .to(0.22, { scale: Vec3.ONE }, { easing: 'sineIn' })
            .union()
            .repeatForever()
            .start();
    }

    stopWinAnimation(): void {
        this.winTween?.stop();
        this.winTween = null;
        this.node.setScale(Vec3.ONE);
    }

    onDestroy(): void {
        this.stopWinAnimation();
    }

    private renderValue(): void {
        const label = this.valueLabel;
        if (!label) return;
        const prize = this.prize;
        label.node.active = prize !== null;
        if (!prize) return;
        label.string = formatBonusPrize(prize, this.bet);
        const color = bonusTextColor(prize);
        const k = this.dim ? DIM_TEXT : 1;
        label.color = new Color(Math.round(color.r * k), Math.round(color.g * k), Math.round(color.b * k), 255);
    }
}
