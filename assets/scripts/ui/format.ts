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
