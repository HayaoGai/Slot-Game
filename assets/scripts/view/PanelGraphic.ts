import { _decorator, Color, Component, Graphics, UITransform } from 'cc';

const { ccclass, property, executeInEditMode, requireComponent } = _decorator;

/**
 * 以 Graphics 繪製圓角面板 / 圓形按鈕底圖。
 * UI 底圖全部以程式繪製，場景檔因此不需要引用任何貼圖 uuid，編輯器中也能即時預覽。
 */
@ccclass('PanelGraphic')
@executeInEditMode
@requireComponent(Graphics)
export class PanelGraphic extends Component {
    @property
    fillColor = new Color(30, 20, 60, 230);

    @property
    strokeColor = new Color(255, 255, 255, 60);

    @property
    lineWidth = 2;

    @property
    radius = 16;

    onEnable(): void {
        this.redraw();
    }

    setColors(fill: Color, stroke?: Color): void {
        this.fillColor = fill;
        if (stroke) this.strokeColor = stroke;
        this.redraw();
    }

    redraw(): void {
        const g = this.getComponent(Graphics);
        const transform = this.getComponent(UITransform);
        if (!g || !transform) return;

        const { width, height } = transform.contentSize;
        const x = -width * transform.anchorX;
        const y = -height * transform.anchorY;
        const inset = this.lineWidth / 2;

        g.clear();
        if (this.radius >= Math.min(width, height) / 2) {
            g.circle(x + width / 2, y + height / 2, Math.min(width, height) / 2 - inset);
        } else {
            g.roundRect(x + inset, y + inset, width - this.lineWidth, height - this.lineWidth, this.radius);
        }
        g.fillColor = this.fillColor;
        g.fill();
        if (this.lineWidth > 0) {
            g.lineWidth = this.lineWidth;
            g.strokeColor = this.strokeColor;
            g.stroke();
        }
    }
}
