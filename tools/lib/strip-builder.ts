/**
 * 依符號組成排列出一條 reel strip。
 *
 * - 一般符號可設定堆疊（stack）長度：同一符號以區塊方式連續出現。
 *   堆疊不會改變 RTP（RTP 只取決於組成），但會讓中獎集中在同一次 spin 的多條線上，
 *   降低 hit frequency、提高單次中獎金額，是調整波動性的主要手段。
 * - 相鄰區塊不得為同一符號（含首尾循環），避免堆疊意外變長。
 * - WILD 一律單格出現，彼此至少相隔 MIN_WILD_GAP 格。
 * - SCATTER 等距插入在區塊邊界，兩個時約相隔半條 strip，遠大於規則要求的 8 格。
 */
import { createRandom } from '../../assets/scripts/core/rng';
import type { SymbolId } from '../../assets/scripts/core/types';
import { stripLength, type Composition } from './rtp-math';

export type StackSizes = Partial<Record<SymbolId, number>>;

const MIN_WILD_GAP = 3;

function cyclicOk(strip: SymbolId[]): boolean {
    const n = strip.length;
    for (let i = 0; i < n; i++) {
        const s = strip[i];
        if (s === 'SCATTER' || s === 'WILD') {
            if (strip[(i + 1) % n] === s) return false;
        }
        if (s === 'WILD') {
            for (let d = 1; d <= MIN_WILD_GAP; d++) if (strip[(i + d) % n] === 'WILD') return false;
        }
    }
    return true;
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
            const recent = seq.slice(-MIN_WILD_GAP);
            const candidates = blocks.filter((b) => b[0] !== last && !(b[0] === 'WILD' && recent.includes('WILD')));
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
