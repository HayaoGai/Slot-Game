/**
 * 產生 assets/scenes/Main.scene 與 assets/resources/prefabs/*.prefab。
 *
 *   pnpm gen:scene
 *
 * 所有節點以 NodeSpec 宣告，由 tools/lib/cocos-json.ts 序列化；
 * 場景內只有節點 / 元件之間的引用，不含任何資產 uuid（貼圖與 prefab 皆於 runtime 載入）。
 */
import path from 'node:path';
import {
    color,
    hex,
    LAYER_DEFAULT,
    ref,
    script,
    vec2,
    writePrefab,
    writeScene,
    type ComponentSpec,
    type NodeSpec,
    type Value,
} from './lib/cocos-json';

const ROOT = process.cwd();
const scriptPath = (rel: string) => path.join(ROOT, 'assets/scripts', rel);
const use = (rel: string, props?: Record<string, Value>, key?: string) => script(scriptPath(rel), props, key);

// ─── 版面常數（設計解析度 1280x720，所有內容位於中央安全區內） ─────────────
const DESIGN_W = 1280;
const DESIGN_H = 720;
const CELL = 140;
const COLUMN_GAP = 10;
const REELS = 5;
const ROWS = 3;
const REEL_WINDOW_W = REELS * CELL + (REELS - 1) * COLUMN_GAP; // 740
const REEL_WINDOW_H = ROWS * CELL; // 420
const REEL_AREA_Y = 40;
const CONTROL_BAR_Y = -292;

// ─── 元件工廠 ────────────────────────────────────────────────────────────

const graphics = (key?: string): ComponentSpec => ({
    type: 'cc.Graphics',
    key,
    props: {
        _lineWidth: 1,
        _strokeColor: color(0, 0, 0),
        _lineJoin: 2,
        _lineCap: 1,
        _fillColor: color(255, 255, 255),
        _miterLimit: 10,
    },
});

const panel = (fill: string, stroke: string, lineWidth: number, radius: number): ComponentSpec[] => [
    graphics(),
    use('view/PanelGraphic.ts', { fillColor: hex(fill), strokeColor: hex(stroke), lineWidth, radius }),
];

const sprite = (key?: string, tint = '#ffffff'): ComponentSpec => ({
    type: 'cc.Sprite',
    key,
    props: {
        _color: hex(tint),
        _spriteFrame: null,
        _type: 0,
        _fillType: 0,
        _sizeMode: 0,
        _fillCenter: vec2(0, 0),
        _fillStart: 0,
        _fillRange: 0,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null,
    },
});

interface LabelOptions {
    text: string;
    size: number;
    color?: string;
    bold?: boolean;
    outline?: [string, number];
    align?: 'left' | 'center' | 'right';
}

const label = (o: LabelOptions, key?: string): ComponentSpec => ({
    type: 'cc.Label',
    key,
    props: {
        _color: hex(o.color ?? '#ffffff'),
        _string: o.text,
        _horizontalAlign: o.align === 'left' ? 0 : o.align === 'right' ? 2 : 1,
        _verticalAlign: 1,
        _actualFontSize: o.size,
        _fontSize: o.size,
        _fontFamily: 'Arial',
        _lineHeight: Math.round(o.size * 1.2),
        _overflow: 0,
        _enableWrapText: false,
        _font: null,
        _isSystemFontUsed: true,
        _spacingX: 0,
        _isItalic: false,
        _isBold: o.bold ?? false,
        _isUnderline: false,
        _underlineHeight: 2,
        _cacheMode: 0,
        _enableOutline: Boolean(o.outline),
        _outlineColor: hex(o.outline?.[0] ?? '#000000'),
        _outlineWidth: o.outline?.[1] ?? 2,
        _enableShadow: false,
    },
});

const button = (target: string, key?: string): ComponentSpec => ({
    type: 'cc.Button',
    key,
    props: {
        clickEvents: [],
        _interactable: true,
        _transition: 3, // SCALE
        _duration: 0.08,
        _zoomScale: 0.92,
        _target: ref(target),
    },
});

const opacity = (value = 255): ComponentSpec => ({ type: 'cc.UIOpacity', props: { _opacity: value } });

/** 帶文字的按鈕：底圖以 PanelGraphic 繪製 */
function textButton(name: string, x: number, y: number, w: number, h: number, text: string, style: { fill: string; stroke: string; size: number; radius?: number }): NodeSpec {
    const key = `${name}`;
    return {
        name,
        key,
        position: [x, y],
        size: [w, h],
        components: [...panel(style.fill, style.stroke, 3, style.radius ?? 14), button(key, `${key}Button`), opacity()],
        children: [{ name: 'Label', size: [w, h], components: [label({ text, size: style.size, bold: true }, `${key}Label`)] }],
    };
}

const caption = (text: string, y: number): NodeSpec => ({
    name: 'Caption',
    position: [0, y],
    size: [160, 24],
    components: [label({ text, size: 16, color: '#b7a6e8', bold: true })],
});

// ─── 場景 ────────────────────────────────────────────────────────────────

const camera: NodeSpec = {
    name: 'Camera',
    layer: LAYER_DEFAULT,
    noTransform: true,
    position: [0, 0],
    components: [
        {
            type: 'cc.Camera',
            key: 'camera',
            props: {
                _projection: 0,
                _priority: 0,
                _fov: 45,
                _fovAxis: 0,
                _orthoHeight: DESIGN_H / 2,
                _near: 0,
                _far: 2000,
                _color: color(8, 4, 18),
                _depth: 1,
                _stencil: 0,
                _clearFlags: 7,
                _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
                _aperture: 19,
                _shutter: 7,
                _iso: 0,
                _screenScale: 1,
                _visibility: 1108344832,
                _targetTexture: null,
            },
        },
    ],
};

/** 背景 1920x720：寬螢幕時填補設計解析度左右多露出的區域，不含資訊性內容 */
const background: NodeSpec = { name: 'Background', size: [1920, DESIGN_H], components: [sprite('backgroundSprite')] };

const reelArea: NodeSpec = {
    name: 'ReelArea',
    position: [0, REEL_AREA_Y],
    size: [REEL_WINDOW_W + 60, REEL_WINDOW_H + 50],
    components: [
        ...panel('#140b2cf0', '#f2c14e', 4, 26),
        use(
            'view/ReelSet.ts',
            {
                reels: [0, 1, 2, 3, 4].map((i) => ref(`reel${i}`)),
                fxGraphics: ref('fxGraphics'),
                cellWidth: CELL,
                cellHeight: CELL,
                columnGap: COLUMN_GAP,
            },
            'reelSet',
        ),
    ],
    children: [
        {
            name: 'ReelBackdrop',
            size: [REEL_WINDOW_W + 16, REEL_WINDOW_H + 16],
            components: [...panel('#07031299', '#00000000', 0, 14)],
        },
        {
            name: 'ReelMask',
            size: [REEL_WINDOW_W, REEL_WINDOW_H],
            components: [graphics(), { type: 'cc.Mask', props: { _type: 0, _inverted: false, _segments: 64, _alphaThreshold: 0.1 } }],
            children: [0, 1, 2, 3, 4].map((i) => ({
                name: `Reel${i}`,
                position: [(i - 2) * (CELL + COLUMN_GAP), 0] as [number, number],
                size: [CELL, REEL_WINDOW_H] as [number, number],
                components: [use('view/ReelView.ts', { cellHeight: CELL }, `reel${i}`)],
            })),
        },
        { name: 'FxLayer', size: [REEL_WINDOW_W + 60, REEL_WINDOW_H + 50], components: [graphics('fxGraphics')] },
        {
            name: 'PaylineLayer',
            key: 'paylineLayer',
            size: [REEL_WINDOW_W + 60, REEL_WINDOW_H + 50],
            components: [
                graphics('paylineGraphics'),
                use('view/PaylineRenderer.ts', { graphics: ref('paylineGraphics'), reelSet: ref('reelSet'), lineWidth: 4 }, 'paylineRenderer'),
            ],
        },
    ],
};

const winLayer: NodeSpec = {
    name: 'WinLayer',
    key: 'winLayer',
    position: [0, REEL_AREA_Y],
    size: [REEL_WINDOW_W, REEL_WINDOW_H],
    components: [
        use(
            'view/WinPresenter.ts',
            {
                paylines: ref('paylineRenderer'),
                reelSet: ref('reelSet'),
                display: ref('balanceDisplay'),
                labelLayer: ref('winLabels'),
                bigWin: ref('bigWin'),
                bigWinTitle: ref('bigWinTitle'),
                bigWinAmount: ref('bigWinAmount'),
            },
            'winPresenter',
        ),
    ],
    children: [
        { name: 'Labels', key: 'winLabels', size: [REEL_WINDOW_W, REEL_WINDOW_H] },
        {
            name: 'BigWin',
            key: 'bigWin',
            active: false,
            size: [900, 200],
            components: [opacity()],
            children: [
                { name: 'Title', position: [0, 40], size: [900, 120], components: [label({ text: 'BIG WIN', size: 104, color: '#ffd54a', bold: true, outline: ['#5a2a00', 6] }, 'bigWinTitle')] },
                { name: 'Amount', position: [0, -60], size: [900, 80], components: [label({ text: '0.00', size: 64, bold: true, outline: ['#1a0b33', 5] }, 'bigWinAmount')] },
            ],
        },
    ],
};

const autoMenu: NodeSpec = {
    name: 'AutoMenu',
    key: 'autoMenu',
    active: false,
    position: [310, 175],
    size: [130, 196],
    components: [...panel('#1d1240f5', '#f2c14e', 3, 16)],
    children: [10, 25, 50].map((n, i) => textButton(`Auto${n}`, 0, 60 - i * 60, 104, 50, String(n), { fill: '#3b2a7a', stroke: '#8f7ad6', size: 26 })),
};

const controlBar: NodeSpec = {
    name: 'ControlBar',
    key: 'controlBar',
    position: [0, CONTROL_BAR_Y],
    size: [1240, 104],
    components: [
        ...panel('#0e0822f0', '#ffffff33', 2, 22),
        use(
            'ui/ControlBar.ts',
            {
                spinButton: ref('SpinButtonButton'),
                spinLabel: ref('SpinButtonLabel'),
                betMinus: ref('BetMinusButton'),
                betPlus: ref('BetPlusButton'),
                betLabel: ref('betLabel'),
                autoButton: ref('AutoButtonButton'),
                autoLabel: ref('AutoButtonLabel'),
                autoMenu: ref('autoMenu'),
                autoOptions: [ref('Auto10Button'), ref('Auto25Button'), ref('Auto50Button')],
                turboToggle: ref('turboToggle'),
            },
            'controlBarComp',
        ),
    ],
    children: [
        textButton('BetMinus', 20, -6, 58, 58, '−', { fill: '#3b2a7a', stroke: '#8f7ad6', size: 34, radius: 29 }),
        {
            name: 'BetLabel',
            position: [110, -12],
            size: [120, 40],
            components: [label({ text: '1.00', size: 32, bold: true }, 'betLabel')],
            children: [caption('BET', 34)],
        },
        textButton('BetPlus', 200, -6, 58, 58, '+', { fill: '#3b2a7a', stroke: '#8f7ad6', size: 34, radius: 29 }),
        textButton('AutoButton', 310, -6, 104, 58, 'AUTO', { fill: '#3b2a7a', stroke: '#8f7ad6', size: 22 }),
        {
            name: 'TurboToggle',
            key: 'turbo',
            position: [420, -6],
            size: [100, 58],
            components: [
                ...panel('#3b2a7a', '#8f7ad6', 3, 14),
                {
                    type: 'cc.Toggle',
                    key: 'turboToggle',
                    props: {
                        clickEvents: [],
                        _interactable: true,
                        _transition: 3,
                        _duration: 0.08,
                        _zoomScale: 0.92,
                        _target: ref('turbo'),
                        checkEvents: [],
                        _isChecked: false,
                        _toggleGroup: null,
                        _checkMark: ref('turboCheck'),
                    },
                },
                opacity(),
            ],
            children: [
                { name: 'Checkmark', position: [-30, 0], size: [16, 16], components: [sprite('turboCheck', '#ffd54a')] },
                { name: 'Label', position: [10, 0], size: [70, 30], components: [label({ text: 'TURBO', size: 18, bold: true })] },
            ],
        },
        {
            ...textButton('SpinButton', 548, 4, 128, 128, 'SPIN', { fill: '#f2a516', stroke: '#fff0b3', size: 32, radius: 64 }),
        },
        autoMenu,
    ],
};

const ui: NodeSpec = {
    name: 'UI',
    size: [DESIGN_W, DESIGN_H],
    components: [use('ui/BalanceDisplay.ts', { balanceLabel: ref('balanceLabel'), winLabel: ref('winLabel') }, 'balanceDisplay')],
    children: [
        controlBar,
        {
            name: 'BalanceLabel',
            position: [-490, CONTROL_BAR_Y - 12],
            size: [220, 40],
            components: [label({ text: '0.00', size: 32, bold: true }, 'balanceLabel')],
            children: [caption('BALANCE', 34)],
        },
        {
            name: 'WinLabel',
            position: [-250, CONTROL_BAR_Y - 12],
            size: [220, 40],
            components: [label({ text: '', size: 32, color: '#ffd54a', bold: true }, 'winLabel')],
            children: [caption('WIN', 34)],
        },
    ],
};

const freeSpinPanel: NodeSpec = {
    name: 'FreeSpinPanel',
    key: 'freeSpinPanel',
    active: false,
    size: [DESIGN_W, DESIGN_H],
    children: [
        { name: 'HudBackground', position: [0, 318], size: [660, 58], components: [...panel('#0f5a58f0', '#46e6d6', 3, 18)] },
        { name: 'TitleLabel', position: [-210, 318], size: [220, 40], components: [label({ text: 'FREE SPINS', size: 26, color: '#8ffcef', bold: true }, 'fsTitle')] },
        { name: 'RemainingLabel', position: [20, 318], size: [200, 40], components: [label({ text: 'LEFT 10', size: 26, bold: true }, 'fsRemaining')] },
        { name: 'MultiplierLabel', position: [230, 318], size: [140, 40], components: [label({ text: 'x1', size: 34, color: '#ffd54a', bold: true, outline: ['#5a2a00', 3] }, 'fsMultiplier')] },
        {
            name: 'Overlay',
            key: 'fsOverlay',
            active: false,
            size: [1920, DESIGN_H],
            components: [...panel('#000000b8', '#00000000', 0, 0), { type: 'cc.BlockInputEvents', props: {} }, opacity()],
            children: [
                { name: 'MessageLabel', position: [0, 70], size: [1000, 120], components: [label({ text: 'FREE SPINS', size: 92, color: '#8ffcef', bold: true, outline: ['#032626', 6] }, 'fsMessage')] },
                { name: 'SubLabel', position: [0, -30], size: [1000, 60], components: [label({ text: '', size: 44, bold: true }, 'fsSub')] },
                { name: 'HintLabel', position: [0, -120], size: [1000, 40], components: [label({ text: 'TAP TO CONTINUE', size: 22, color: '#b7a6e8' }, 'fsHint')] },
            ],
        },
    ],
};

const gameRoot: NodeSpec = {
    name: 'GameRoot',
    size: [1, 1],
    components: [
        use('GameController.ts', {
            reelSet: ref('reelSet'),
            winPresenter: ref('winPresenter'),
            controlBar: ref('controlBarComp'),
            balanceDisplay: ref('balanceDisplay'),
            background: ref('backgroundSprite'),
        }),
    ],
};

const canvas: NodeSpec = {
    name: 'Canvas',
    position: [DESIGN_W / 2, DESIGN_H / 2],
    size: [DESIGN_W, DESIGN_H],
    components: [
        { type: 'cc.Canvas', props: { _cameraComponent: ref('camera'), _alignCanvasWithScreen: true } },
        {
            type: 'cc.Widget',
            props: {
                _alignFlags: 45,
                _target: null,
                _left: 0,
                _right: 0,
                _top: 0,
                _bottom: 0,
                _isAbsLeft: true,
                _isAbsRight: true,
                _isAbsTop: true,
                _isAbsBottom: true,
                _originalWidth: 0,
                _originalHeight: 0,
                _alignMode: 2,
                _lockFlags: 0,
            },
        },
    ],
    children: [camera, background, reelArea, winLayer, ui, freeSpinPanel, gameRoot],
};

writeScene(path.join(ROOT, 'assets/scenes/Main.scene'), [canvas]);

// ─── Prefabs ─────────────────────────────────────────────────────────────

const PREFAB_DIR = path.join(ROOT, 'assets/resources/prefabs');

writePrefab(path.join(PREFAB_DIR, 'Symbol.prefab'), {
    name: 'Symbol',
    size: [CELL, CELL],
    components: [sprite('sprite'), use('view/SymbolView.ts', { sprite: ref('sprite') })],
});

/** 中獎格外框，由 PaylineRenderer 以 Graphics 著色繪製 */
writePrefab(path.join(PREFAB_DIR, 'PaylineHighlight.prefab'), {
    name: 'PaylineHighlight',
    size: [CELL + 6, CELL + 6],
    components: [graphics(), opacity()],
});

/** 單線贏分飄字 */
writePrefab(path.join(PREFAB_DIR, 'WinLabel.prefab'), {
    name: 'WinLabel',
    size: [300, 60],
    components: [label({ text: '0.00', size: 40, color: '#ffffff', bold: true, outline: ['#1a0b33', 5] }), opacity()],
});

console.log('Main.scene and prefabs generated.');
