import { _decorator, Color, Component, Node, Sprite, Tween, tween, Vec3 } from 'cc';
import type { SymbolId } from '../core/types';
import { GameAssets } from './GameAssets';

const { ccclass, property } = _decorator;

const DIM_COLOR = new Color(85, 85, 95, 255);
const WIN_SCALE = new Vec3(1.1, 1.1, 1);

@ccclass('SymbolView')
export class SymbolView extends Component {
    @property(Sprite)
    sprite: Sprite | null = null;

    private symbolId: SymbolId | null = null;
    private winTween: Tween<Node> | null = null;

    get id(): SymbolId | null {
        return this.symbolId;
    }

    onLoad(): void {
        if (!this.sprite) this.sprite = this.getComponent(Sprite);
        if (this.sprite) this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }

    setSymbol(id: SymbolId): void {
        if (id === this.symbolId) return;
        this.symbolId = id;
        this.sprite!.spriteFrame = GameAssets.symbolFrame(id);
    }

    setDim(dim: boolean): void {
        this.sprite!.color = dim ? DIM_COLOR : Color.WHITE;
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
}
