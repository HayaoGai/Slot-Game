import { _decorator, Component, Label, Node, Tween, tween, Vec3 } from 'cc';
import { JACKPOT_MULTIPLIERS } from '../core/paytable';
import type { JackpotId } from '../core/types';
import { formatMoney } from './format';

const { ccclass, property } = _decorator;

/** 由左到右的排列順序 */
export const JACKPOT_ORDER: readonly JackpotId[] = ['GRAND', 'MAJOR', 'MINOR', 'MINI'];

const FLASH_SCALE = new Vec3(1.18, 1.18, 1);

/** 盤面上方的 Jackpot 金額列。Jackpot 為固定的總注倍數，金額隨下注額變化。 */
@ccclass('JackpotBar')
export class JackpotBar extends Component {
    /** 依 JACKPOT_ORDER 排列 */
    @property([Node])
    plaques: Node[] = [];

    /** 依 JACKPOT_ORDER 排列 */
    @property([Label])
    amountLabels: Label[] = [];

    setBet(bet: number): void {
        JACKPOT_ORDER.forEach((id, i) => {
            this.amountLabels[i].string = formatMoney(JACKPOT_MULTIPLIERS[id] * bet);
        });
    }

    /** 中得 Jackpot 時閃動對應的牌匾 */
    flash(jackpot: JackpotId): void {
        const node = this.plaques[JACKPOT_ORDER.indexOf(jackpot)];
        Tween.stopAllByTarget(node);
        node.setScale(Vec3.ONE);
        tween(node)
            .to(0.12, { scale: FLASH_SCALE }, { easing: 'sineOut' })
            .to(0.18, { scale: Vec3.ONE }, { easing: 'sineIn' })
            .union()
            .repeat(3)
            .start();
    }
}
