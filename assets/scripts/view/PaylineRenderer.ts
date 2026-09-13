import { _decorator, Color, Component, Graphics, instantiate, UIOpacity, Vec3 } from 'cc';
import { PAYLINES } from '../core/paylines';
import type { Position } from '../core/types';
import { GameAssets } from './GameAssets';
import { ReelSet } from './ReelSet';

const { ccclass, property } = _decorator;

/** 線序輪替的四種色相 */
const LINE_COLORS = [new Color(255, 213, 74), new Color(70, 230, 214), new Color(255, 106, 213), new Color(140, 255, 110)];
const SCATTER_COLOR = new Color(143, 252, 239);
const SHADOW_COLOR = new Color(0, 0, 0, 120);

/**
 * 以 Graphics 動態繪製 payline：依 PAYLINES[lineIndex] 取每欄對應列的格子中心連線，
 * 不需要預先準備 25 張線條圖片。中獎格外框使用 PaylineHighlight prefab 物件池。
 */
@ccclass('PaylineRenderer')
export class PaylineRenderer extends Component {
    @property(Graphics)
    graphics: Graphics | null = null;

    @property(ReelSet)
    reelSet: ReelSet | null = null;

    @property
    lineWidth = 4;

    private readonly highlights: { graphics: Graphics; opacity: UIOpacity }[] = [];
    private used = 0;

    static colorFor(lineIndex: number): Color {
        return lineIndex < 0 ? SCATTER_COLOR : LINE_COLORS[lineIndex % LINE_COLORS.length];
    }

    drawLine(lineIndex: number): void {
        const g = this.graphics!;
        const reels = this.reelSet!;
        const points = PAYLINES[lineIndex].map((row, reel) => reels.cellPosition(reel, row));
        const extend = reels.cellWidth / 2 + 16;
        const strokes: [number, Color][] = [
            [this.lineWidth + 6, SHADOW_COLOR],
            [this.lineWidth, PaylineRenderer.colorFor(lineIndex)],
        ];

        g.lineCap = Graphics.LineCap.ROUND;
        g.lineJoin = Graphics.LineJoin.ROUND;
        for (const [width, color] of strokes) {
            g.lineWidth = width;
            g.strokeColor = color;
            g.moveTo(points[0].x - extend, points[0].y);
            for (const p of points) g.lineTo(p.x, p.y);
            g.lineTo(points[points.length - 1].x + extend, points[points.length - 1].y);
            g.stroke();
        }
    }

    highlightCells(positions: readonly Position[], color: Color): void {
        const reels = this.reelSet!;
        const w = reels.cellWidth + 4;
        const h = reels.cellHeight + 4;
        const fill = new Color(color.r, color.g, color.b, 40);
        const pos = new Vec3();

        for (const [reel, row] of positions) {
            const item = this.acquire();
            const g = item.graphics;
            g.clear();
            g.lineWidth = 5;
            g.strokeColor = color;
            g.fillColor = fill;
            g.roundRect(-w / 2, -h / 2, w, h, 18);
            g.fill();
            g.stroke();
            item.opacity.opacity = 255;
            g.node.setPosition(reels.cellPosition(reel, row, pos));
        }
    }

    setHighlightOpacity(value: number): void {
        for (let i = 0; i < this.used; i++) this.highlights[i].opacity.opacity = value;
    }

    clear(): void {
        this.graphics?.clear();
        for (const item of this.highlights) item.graphics.node.active = false;
        this.used = 0;
    }

    private acquire(): { graphics: Graphics; opacity: UIOpacity } {
        if (this.used === this.highlights.length) {
            const node = instantiate(GameAssets.highlightPrefab);
            node.parent = this.node;
            this.highlights.push({ graphics: node.getComponent(Graphics)!, opacity: node.getComponent(UIOpacity)! });
        }
        const item = this.highlights[this.used++];
        item.graphics.node.active = true;
        return item;
    }
}
