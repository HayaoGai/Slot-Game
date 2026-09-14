import { _decorator, Color, Component, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 全螢幕橫幅（免費遊戲與 Hold & Spin 共用）：半透明遮罩 + 標題 + 副標，顯示指定秒數或被略過。
 * 掛在常駐啟用的節點上，遮罩為子節點；點擊遮罩的事件由 GameController 綁定，
 * 依目前狀態決定是否略過，再呼叫 skip()。
 */
@ccclass('Banner')
export class Banner extends Component {
    @property(Node)
    overlay: Node | null = null;

    @property(Label)
    messageLabel: Label | null = null;

    @property(Label)
    subLabel: Label | null = null;

    private readonly waiters = new Set<() => void>();

    get overlayNode(): Node {
        return this.overlay!;
    }

    async show(message: string, sub: string, seconds: number, color: Color): Promise<void> {
        const overlay = this.overlay!;
        const opacity = overlay.getComponent(UIOpacity)!;
        this.messageLabel!.string = message;
        this.messageLabel!.color = color;
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

    skip(): void {
        // 引擎的 Babel 設定以寬鬆模式轉譯 spread / for-of，Set 必須先轉成陣列
        Array.from(this.waiters).forEach((done) => done());
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
