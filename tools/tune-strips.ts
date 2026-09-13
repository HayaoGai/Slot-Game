/**
 * Reel strip 自動調校。
 *
 *   pnpm tune             # 調校並寫回 assets/scripts/core/reelStrips.ts
 *   pnpm tune --dry-run   # 只輸出結果
 *
 * 流程：
 * 1. 以 DESIGN 定義每欄的高賠付 / WILD / SCATTER 數量與低賠付初始數量。
 * 2. 以精確解析（rtp-math）計算 RTP，貪婪地逐步 ±1 調整低賠付符號數量，直到 RTP 逼近目標。
 *    RTP 只取決於組成，所以這一步不需要抽樣，收斂穩定且可重現。
 * 3. 依組成排列 strip（SCATTER 間隔、WILD 位置等規則），檢查設計規則。
 * 4. 以蒙地卡羅驗證 hit frequency，全部通過才寫回檔案。
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ALL_SYMBOLS, LOW_SYMBOLS, TARGET_HIT_FREQUENCY, TARGET_RTP } from '../assets/scripts/core/config';
import type { ReelStrips, SymbolId } from '../assets/scripts/core/types';
import { analyzeCompositions, stripLength, type Composition } from './lib/rtp-math';
import { runSimulation } from './lib/simulation';
import { arrangeStrip, type StackSizes } from './lib/strip-builder';
import { STRIP_RULES, validateStrips } from './lib/strip-rules';

const { values } = parseArgs({
    options: {
        'dry-run': { type: 'boolean', default: false },
        seed: { type: 'string', default: '7' },
        'hit-spins': { type: 'string', default: '300000' },
    },
});

/**
 * 設計起點（刻意讓 RTP 高於目標，再由調校加入低賠付符號稀釋）：
 * - 第 0 欄不放 SCATTER，WILD 只在第 1~3 欄
 * - 高賠付符號由左至右遞減（右側欄位較難連到 5 連，壓低大獎機率、拉高波動）
 * - 賠付表的低賠付倍數偏低，必須提高高賠付與 WILD 的集中度才能達到目標 RTP
 */
const DESIGN: Composition[] = [
    { J: 6, Q: 6, K: 6, A: 6, H1: 9, H2: 9, H3: 8 },
    { J: 4, Q: 4, K: 5, A: 5, H1: 8, H2: 8, H3: 8, WILD: 6, SCATTER: 2 },
    { J: 4, Q: 4, K: 5, A: 5, H1: 8, H2: 8, H3: 8, WILD: 6, SCATTER: 2 },
    { J: 5, Q: 5, K: 5, A: 5, H1: 8, H2: 7, H3: 7, WILD: 6, SCATTER: 2 },
    { J: 8, Q: 7, K: 6, A: 6, H1: 8, H2: 7, H3: 6, SCATTER: 2 },
];

/**
 * 堆疊長度。堆疊不影響 RTP，但會讓中獎集中在同一次 spin 的多條線上：
 * 在相同 RTP 下降低 hit frequency、提高單次中獎金額（波動性）。
 */
const STACKS: StackSizes = { J: 4, Q: 4, K: 4, A: 4, H1: 4, H2: 4, H3: 4 };

const RTP_EPSILON = 0.0005;
const MIN_LOW_COUNT = 3;
const MAX_LOW_COUNT = 14;

const pct = (v: number, d = 3) => `${(v * 100).toFixed(d)}%`;

function tuneLowSymbols(start: Composition[]): Composition[] {
    let comps = start.map((c) => ({ ...c }));
    let current = analyzeCompositions(comps).totalRtp;
    console.log(`start RTP ${pct(current)}`);

    for (let iteration = 1; iteration <= 400; iteration++) {
        if (Math.abs(current - TARGET_RTP) < RTP_EPSILON) break;

        let best: { comps: Composition[]; rtp: number; label: string } | null = null;
        for (let reel = 0; reel < comps.length; reel++) {
            for (const symbol of LOW_SYMBOLS) {
                for (const delta of [-1, 1]) {
                    const count = (comps[reel][symbol] ?? 0) + delta;
                    if (count < MIN_LOW_COUNT || count > MAX_LOW_COUNT) continue;
                    const candidate = comps.map((c, i) => (i === reel ? { ...c, [symbol]: count } : c));
                    const len = stripLength(candidate[reel]);
                    if (len < STRIP_RULES.minLength || len > STRIP_RULES.maxLength) continue;

                    const rtp = analyzeCompositions(candidate).totalRtp;
                    // 同樣接近目標時，偏好讓各欄長度較平均的調整
                    const lengths = candidate.map(stripLength);
                    const spread = (Math.max(...lengths) - Math.min(...lengths)) * 1e-6;
                    const score = Math.abs(rtp - TARGET_RTP) + spread;
                    const bestScore = best ? Math.abs(best.rtp - TARGET_RTP) + (Math.max(...best.comps.map(stripLength)) - Math.min(...best.comps.map(stripLength))) * 1e-6 : Infinity;
                    if (score < bestScore) best = { comps: candidate, rtp, label: `reel ${reel} ${symbol} ${delta > 0 ? '+1' : '-1'}` };
                }
            }
        }
        if (!best || Math.abs(best.rtp - TARGET_RTP) >= Math.abs(current - TARGET_RTP)) {
            console.log('no further improvement');
            break;
        }
        comps = best.comps;
        current = best.rtp;
        console.log(`#${iteration} ${best.label.padEnd(14)} → RTP ${pct(current)}`);
    }
    return comps;
}

function renderStripsFile(strips: ReelStrips, comps: Composition[]): string {
    const a = analyzeCompositions(comps);
    const header = ['欄', '長度', ...ALL_SYMBOLS].join(' | ');
    const rows = comps.map((c, i) => [i, stripLength(c), ...ALL_SYMBOLS.map((s) => c[s] ?? 0)].join(' | '));
    const body = strips
        .map((strip) => {
            const lines: string[] = [];
            for (let i = 0; i < strip.length; i += 10) {
                lines.push(`        ${strip.slice(i, i + 10).map((s) => `'${s}'`).join(', ')},`);
            }
            return `    [\n${lines.join('\n')}\n    ],`;
        })
        .join('\n');

    return `import type { ReelStrips } from './types';

/**
 * 此檔由 tools/tune-strips.ts 產生，請勿手動修改。
 *
 * 組成：
 *   ${header}
${rows.map((r) => ` *   ${r}`).join('\n')}
 *
 * 理論值：總 RTP ${pct(a.totalRtp)}（一般 ${pct(a.baseRtp)} / 免費 ${pct(a.freeRtp)}），
 * 免費遊戲觸發 1 / ${(1 / a.triggerProb).toFixed(1)} spins。
 */
export const REEL_STRIPS: ReelStrips = [
${body}
];
`;
}

const tuned = tuneLowSymbols(DESIGN);
const analysis = analyzeCompositions(tuned);
const seed = Number(values.seed);
const strips: SymbolId[][] = tuned.map((comp, reel) => arrangeStrip(comp, seed + reel, STACKS));

const errors = validateStrips(strips);
if (errors.length > 0) {
    console.error('Strip rule violations:\n  ' + errors.join('\n  '));
    process.exit(1);
}

const hitSpins = Number(values['hit-spins']);
const mc = runSimulation({ spins: hitSpins, seed: 1, bet: 100, strips });

console.log('');
console.log(`theoretical RTP  ${pct(analysis.totalRtp)} (base ${pct(analysis.baseRtp)}, free ${pct(analysis.freeRtp)})`);
console.log(`trigger          1 / ${(1 / analysis.triggerProb).toFixed(1)} spins, avg ${analysis.expectedFreeSpins.toFixed(2)} free spins`);
console.log(`hit frequency    ${pct(mc.hitFrequency, 2)} (MC ${hitSpins.toLocaleString('en-US')} spins)`);
console.log(`MC RTP           ${pct(mc.rtp, 2)} ± ${pct(mc.rtpCi95, 2)}, std dev ${mc.stdDev.toFixed(2)}`);
console.log('lengths          ' + tuned.map(stripLength).join(', '));

const rtpConverged = Math.abs(analysis.totalRtp - TARGET_RTP) < RTP_EPSILON;
const hitOk = mc.hitFrequency >= TARGET_HIT_FREQUENCY[0] && mc.hitFrequency <= TARGET_HIT_FREQUENCY[1];
if (!rtpConverged || !hitOk) {
    console.error(`\nNot written: RTP converged=${rtpConverged}, hit frequency in range=${hitOk}. Adjust DESIGN and retry.`);
    process.exit(1);
}

if (values['dry-run']) {
    console.log('\n--dry-run: reelStrips.ts not modified.');
} else {
    const target = path.join(process.cwd(), 'assets/scripts/core/reelStrips.ts');
    fs.writeFileSync(target, renderStripsFile(strips, tuned));
    console.log(`\nWritten ${path.relative(process.cwd(), target)}`);
}
