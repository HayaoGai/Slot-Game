import { _decorator, Button, Component, Node, Sprite, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { GameAssets } from '../view/GameAssets';

const { ccclass, property } = _decorator;

/**
 * 製作者資訊彈窗（頭像、名字、信箱）。
 * 與遊戲流程無關，不經過 GameController 狀態機；開啟時全螢幕遮罩以 BlockInputEvents 擋住下層操作，
 * 點擊遮罩空白處或關閉按鈕即可關閉，旋轉與 autoplay 在背後照常進行。
 */
@ccclass('CreditsPanel')
export class CreditsPanel extends Component {
    @property(Button)
    openButton: Button | null = null;

    @property(Button)
    closeButton: Button | null = null;

    /** 全螢幕遮罩，點擊空白處關閉 */
    @property(Node)
    popup: Node | null = null;

    /** 資訊卡片，本身擋下點擊，避免點卡片時冒泡到遮罩而關閉 */
    @property(Node)
    card: Node | null = null;

    @property(Sprite)
    avatar: Sprite | null = null;

    onLoad(): void {
        this.openButton!.node.on(Button.EventType.CLICK, () => {
            AudioManager.instance.play('buttonClick');
            this.open();
        });
        this.closeButton!.node.on(Button.EventType.CLICK, () => {
            AudioManager.instance.play('buttonClick');
            this.close();
        });
        this.popup!.on(Node.EventType.TOUCH_END, () => this.close());
    }

    async start(): Promise<void> {
        await GameAssets.loadAll();
        this.avatar!.spriteFrame = GameAssets.avatar;
    }

    private open(): void {
        const popup = this.popup!;
        const opacity = popup.getComponent(UIOpacity)!;
        popup.active = true;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.15, { opacity: 255 }).start();

        const card = this.card!;
        Tween.stopAllByTarget(card);
        card.setScale(0.85, 0.85, 1);
        tween(card).to(0.25, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    private close(): void {
        const opacity = this.popup!.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(0.12, { opacity: 0 })
            .call(() => {
                this.popup!.active = false;
            })
            .start();
    }
}
