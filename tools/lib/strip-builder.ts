/**
 * 依符號組成排列出一條 reel strip。
 *
 * - 一般符號可設定堆疊（stack）長度：同一符號以區塊方式連續出現。
 *   堆疊不會改變 RTP（RTP 只取決於組成），但會讓中獎集中在同一次 spin 的多條線上，
 *   降低 hit frequency、提高單次中獎金額，是調整波動性的主要手段。
 * - 相鄰區塊不得為同一符號（含首尾循環），避免堆疊意外變長。
 * - WILD 一律單格出現，彼此至少相隔 3 格。
 * - BONUS 依堆疊長度成組出現（2 格一組），組與組之間至少相隔 2 格：
 *   一個視窗只會碰到一組，視窗的 BONUS 數量分佈因此只取決於數量（見 rtp-math 的 bonusWindowModel）。
 * - SCATTER 等距插入在區塊邊界，兩個時約相隔半條 strip，遠大於規則要求的 8 格；
 *   插在邊界只會拉開其他區塊的間距，不會拆散堆疊。
 */
import { createRandom } from '../../assets/scripts/core/rng';
import type { SymbolId } from '../../assets/scripts/core/types';
import { stripLength, type Composition } from './rtp-math';

export type StackSizes = Partial<Record<SymbolId, number>>;

/** 同一符號兩個區塊之間至少需要的間隔格數 */
const MIN_GAP: Partial<Record<SymbolId, number>> = { WILD: 3, BONUS: 2 };

function cyclicOk(strip: SymbolId[]): boolean {
    const n = strip.length;
    for (let i = 0; i < n; i++) {
        const s = strip[i];
        const next = strip[(i + 1) % n];
        if ((s === 'SCATTER' || s === 'WILD') && next === s) return false;
        const gap = MIN_GAP[s];
        // 只在區塊結尾檢查間隔
        if (gap !== undefined && next !== s) {
            for (let d = 1; d <= gap; d++) if (strip[(i + d) % n] === s) return false;
        }
    }
    return true;
}

function tooClose(seq: readonly SymbolId[], symbol: SymbolId): boolean {
    const gap = MIN_GAP[symbol];
    return gap !== undefined && seq.slice(-gap).indexOf(symbol) !== -1;
}

export function arrangeStrip(comp: Composition, seed: number, stacks: StackSizes = {}): SymbolId[] {
    const length = stripLength(comp);

    for (let attempt = 0; attempt < 5000; attempt++) {
        const rng = createRandom(seed * 1_000_003 + attempt);

        const blocks: SymbolId[][] = [];
        for (const [symbol, n] of Object.entries(comp) as [SymbolId, number][]) {
            if (symbol === 'SCATTER' || !n) continue;
            const size = symbol === 'WILD' ? 1 : Math.max(1, stacks[symbol] ?? 1);
            for (let left = n; left > 0; left -= size) blocks.push(new Array<SymbolId>(Math.min(size, left)).fill(symbol));
        }

        const seq: SymbolId[] = [];
        let failed = false;
        while (blocks.length > 0) {
            const last = seq[seq.length - 1];
            const candidates = blocks.filter((b) => b[0] !== last && !tooClose(seq, b[0]));
            if (candidates.length === 0) {
                failed = true;
                break;
            }
            const total = candidates.reduce((s, b) => s + b.length, 0);
            let pick = rng.nextInt(total);
            const chosen = candidates.find((b) => (pick -= b.length) < 0)!;
            blocks.splice(blocks.indexOf(chosen), 1);
            seq.push(...chosen);
        }
        if (failed || seq[0] === seq[seq.length - 1]) continue;

        // SCATTER 由後往前插入，避免索引位移；插入點選在目標位置附近的區塊邊界
        const scatters = comp.SCATTER ?? 0;
        for (let j = scatters - 1; j >= 0; j--) {
            const target = Math.floor((j * length) / scatters);
            let index = target;
            for (let d = 0; d < seq.length; d++) {
                const i = Math.min(target + d, seq.length);
                if (i === 0 || i === seq.length || seq[i - 1] !== seq[i]) {
                    index = i;
                    break;
                }
            }
            seq.splice(index, 0, 'SCATTER');
        }

        if (cyclicOk(seq)) return seq;
    }
    throw new Error(`Unable to arrange strip for composition ${JSON.stringify(comp)}`);
}
