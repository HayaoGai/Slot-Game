import { _decorator, Button, Component, Label, Node, Sprite, SpriteFrame, Toggle, UIOpacity } from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { AUTOPLAY_COUNTS } from '../core/config';
import { formatMoney } from './format';

const { ccclass, property } = _decorator;

export type SpinButtonMode = 'spin' | 'stop' | 'skip';

/**
 * 底部操作列。只負責顯示與把玩家操作轉成事件，
 * 所有「此狀態下能不能做這件事」的判斷集中在 GameController。
 */
@ccclass('ControlBar')
export class ControlBar extends Component {
    static readonly EVENT_SPIN = 'control-spin';
    static readonly EVENT_BET = 'control-bet';
    static readonly EVENT_AUTO_START = 'control-auto-start';
    static readonly EVENT_AUTO_STOP = 'control-auto-stop';
    static readonly EVENT_TURBO = 'control-turbo';

    @property(Button)
    spinButton: Button | null = null;

    @property(Label)
    spinLabel: Label | null = null;

    @property(Button)
    betMinus: Button | null = null;

    @property(Button)
    betPlus: Button | null = null;

    @property(Label)
    betLabel: Label | null = null;

    @property(Button)
    autoButton: Button | null = null;

    @property(Label)
    autoLabel: Label | null = null;

    @property(Node)
    autoMenu: Node | null = null;

    @property([Button])
    autoOptions: Button[] = [];

    @property(Toggle)
    turboToggle: Toggle | null = null;

    private autoRunning = false;

    onLoad(): void {
        this.onClick(this.spinButton!, () => this.node.emit(ControlBar.EVENT_SPIN));
        this.onClick(this.betMinus!, () => this.node.emit(ControlBar.EVENT_BET, -1));
        this.onClick(this.betPlus!, () => this.node.emit(ControlBar.EVENT_BET, 1));
        this.onClick(this.autoButton!, () => {
            if (this.autoRunning) this.node.emit(ControlBar.EVENT_AUTO_STOP);
            else this.autoMenu!.active = !this.autoMenu!.active;
        });
        this.autoOptions.forEach((option, i) => {
            this.onClick(option, () => this.node.emit(ControlBar.EVENT_AUTO_START, AUTOPLAY_COUNTS[i]));
            const label = option.getComponentInChildren(Label);
            if (label) label.string = String(AUTOPLAY_COUNTS[i]);
        });
        this.turboToggle!.node.on(Toggle.EventType.TOGGLE, (toggle: Toggle) => {
            AudioManager.instance.play('buttonClick');
            this.node.emit(ControlBar.EVENT_TURBO, toggle.isChecked);
        });
    }

    /** Toggle 的勾選標記需要貼圖，資產載入後再指定 */
    applyTextures(white: SpriteFrame): void {
        const check = this.turboToggle!.checkMark as Sprite | null;
        if (check) {
            check.sizeMode = Sprite.SizeMode.CUSTOM;
            check.spriteFrame = white;
        }
    }

    setBet(cents: number, canDecrease: boolean, canIncrease: boolean, enabled: boolean): void {
        this.betLabel!.string = formatMoney(cents);
        ControlBar.setEnabled(this.betMinus!, enabled && canDecrease);
        ControlBar.setEnabled(this.betPlus!, enabled && canIncrease);
    }

    setSpin(mode: SpinButtonMode, enabled: boolean): void {
        this.spinLabel!.string = mode === 'spin' ? 'SPIN' : mode === 'stop' ? 'STOP' : 'SKIP';
        ControlBar.setEnabled(this.spinButton!, enabled);
    }

    /** remaining 為 null 表示未在自動旋轉 */
    setAutoplay(remaining: number | null, enabled: boolean): void {
        this.autoRunning = remaining !== null;
        this.autoLabel!.string = remaining === null ? 'AUTO' : `STOP ${remaining}`;
        ControlBar.setEnabled(this.autoButton!, enabled || this.autoRunning);
        if (this.autoRunning || !enabled) this.autoMenu!.active = false;
    }

    setTurbo(on: boolean): void {
        this.turboToggle!.setIsCheckedWithoutNotify(on);
    }

    private onClick(button: Button, handler: () => void): void {
        button.node.on(Button.EventType.CLICK, () => {
            AudioManager.instance.play('buttonClick');
            if (button !== this.autoButton) this.autoMenu!.active = false;
            handler();
        });
    }

    private static setEnabled(button: Button, enabled: boolean): void {
        button.interactable = enabled;
        const opacity = button.getComponent(UIOpacity);
        if (opacity) opacity.opacity = enabled ? 255 : 110;
    }
}
