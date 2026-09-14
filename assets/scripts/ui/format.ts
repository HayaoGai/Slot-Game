import type { BonusPrize } from '../core/types';

/** 金額以分為單位保存，顯示時轉為兩位小數並加上千分位。 */
export function formatMoney(cents: number): string {
    const negative = cents < 0;
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const cents2 = abs % 100;
    const fraction = cents2 < 10 ? `0${cents2}` : `${cents2}`;
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** BONUS 上顯示的文字：現金顯示依總注換算的金額，Jackpot 顯示名稱。 */
export function formatBonusPrize(prize: BonusPrize, bet: number): string {
    return prize.kind === 'cash' ? formatMoney(prize.multiple * bet) : prize.jackpot;
}
