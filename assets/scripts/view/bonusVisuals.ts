import { Color } from 'cc';
import { BONUS_PRIZE_TOTAL_WEIGHT, drawBonusPrize } from '../core/paytable';
import type { BonusPrize, JackpotId } from '../core/types';

/** Jackpot 的代表色：BONUS 文字與 Jackpot 列共用同一組色相 */
export const JACKPOT_TEXT_COLORS: Readonly<Record<JackpotId, Color>> = {
    GRAND: new Color(255, 213, 74),
    MAJOR: new Color(217, 179, 255),
    MINOR: new Color(143, 211, 255),
    MINI: new Color(157, 255, 138),
};

const CASH_TEXT_COLOR = new Color(255, 255, 255);

export function bonusTextColor(prize: BonusPrize): Color {
    return prize.kind === 'cash' ? CASH_TEXT_COLOR : JACKPOT_TEXT_COLORS[prize.jackpot];
}

/** 旋轉中填充用的 BONUS 獎項，依實際權重隨機抽取；只影響畫面，因此直接使用 Math.random */
export function randomBonusPrize(): BonusPrize {
    return drawBonusPrize(Math.floor(Math.random() * BONUS_PRIZE_TOTAL_WEIGHT));
}
