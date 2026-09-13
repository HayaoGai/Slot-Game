/**
 * RTP 蒙地卡羅模擬。
 *
 *   pnpm simulate                       # 預設 1,000,000 次
 *   pnpm simulate --spins 5000000 --seed 42 --bet 100
 *
 * 結果輸出至 console 與 tools/output/rtp-report.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LINE_COUNT, TARGET_HIT_FREQUENCY, TARGET_RTP, RTP_TOLERANCE, ALL_SYMBOLS } from '../assets/scripts/core/config';
import { REEL_STRIPS } from '../assets/scripts/core/reelStrips';
import { analyzeStrips, compositionOf } from './lib/rtp-math';
import { HISTOGRAM_BUCKETS, runSimulation } from './lib/simulation';

const { values } = parseArgs({
    options: {
        spins: { type: 'string', default: '1000000' },
        seed: { type: 'string', default: '20260913' },
        bet: { type: 'string', default: '100' },
        out: { type: 'string', default: 'tools/output/rtp-report.md' },
    },
});

const spins = Number(values.spins);
const seed = Number(values.seed);
const bet = Number(values.bet);
if (!Number.isInteger(spins) || spins <= 0) throw new Error('--spins must be a positive integer');
if (!Number.isInteger(bet) || bet % LINE_COUNT !== 0) throw new Error(`--bet must be a multiple of ${LINE_COUNT}`);

const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
const num = (v: number) => v.toLocaleString('en-US');

console.log(`Simulating ${num(spins)} spins (seed ${seed}, bet ${bet}) ...`);
const stats = runSimulation({ spins, seed, bet, onProgress: (n) => process.stdout.write(`\r  ${num(n)} / ${num(spins)}`) });
process.stdout.write('\n');
const exact = analyzeStrips(REEL_STRIPS);

const rtpOk = Math.abs(stats.rtp - TARGET_RTP) <= RTP_TOLERANCE;
const hitOk = stats.hitFrequency >= TARGET_HIT_FREQUENCY[0] && stats.hitFrequency <= TARGET_HIT_FREQUENCY[1];
const mark = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

const summaryRows: [string, string, string][] = [
    ['總 RTP', pct(stats.rtp), pct(exact.totalRtp, 3)],
    ['　一般遊戲 RTP', pct(stats.baseRtp), pct(exact.baseRtp, 3)],
    ['　免費遊戲 RTP', pct(stats.freeRtp), pct(exact.freeRtp, 3)],
    ['Hit frequency', pct(stats.hitFrequency), '—'],
    ['免費遊戲觸發頻率', `1 / ${stats.triggerInterval.toFixed(1)} spins`, `1 / ${(1 / exact.triggerProb).toFixed(1)} spins`],
    ['每次觸發平均免費旋轉', (stats.freeSpinsPlayed / Math.max(1, stats.triggers)).toFixed(2), exact.expectedFreeSpins.toFixed(2)],
    ['重觸發次數', num(stats.retriggers), '—'],
    ['最大單次贏分（含觸發之免費遊戲）', `${(stats.maxWin / bet).toFixed(2)}x`, '—'],
    ['標準差（單次 spin，總注倍數）', stats.stdDev.toFixed(2), '—'],
    ['RTP 95% 信賴區間', `± ${pct(stats.rtpCi95)}`, '—'],
];

const histogramRows = HISTOGRAM_BUCKETS.map((b, i) => [b.label, num(stats.histogram[i]), pct(stats.histogram[i] / spins, 3)]);

const compositionHeader = ['欄', '長度', ...ALL_SYMBOLS];
const compositionRows = REEL_STRIPS.map((strip, reel) => {
    const comp = compositionOf(strip);
    return [String(reel), String(strip.length), ...ALL_SYMBOLS.map((s) => String(comp[s] ?? 0))];
});

const table = (header: string[], rows: string[][]) =>
    [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const markdown = `# RTP 模擬報告

- 模擬次數：${num(spins)}
- Seed：${seed}
- 總注：${bet}（線注 ${bet / LINE_COUNT}）
- 耗時：${(stats.elapsedMs / 1000).toFixed(1)} s

## 驗收

| 指標 | 目標 | 模擬結果 | 判定 |
|---|---|---|---|
| RTP | ${pct(TARGET_RTP - RTP_TOLERANCE, 1)} ~ ${pct(TARGET_RTP + RTP_TOLERANCE, 1)} | ${pct(stats.rtp)} | ${mark(rtpOk)} |
| Hit frequency | ${pct(TARGET_HIT_FREQUENCY[0], 0)} ~ ${pct(TARGET_HIT_FREQUENCY[1], 0)} | ${pct(stats.hitFrequency)} | ${mark(hitOk)} |

## 指標

「理論值」由 \`tools/lib/rtp-math.ts\` 依 strip 組成精確計算，與模擬結果互相驗證。

${table(['指標', '模擬', '理論值'], summaryRows)}

## 單次 spin 贏分分佈（總注倍數，含觸發之免費遊戲）

${table(['區間', '次數', '佔比'], histogramRows)}

## 各符號對線贏分 RTP 的貢獻（理論值）

${table(['符號', 'RTP 貢獻'], Object.entries(exact.lineRtpBySymbol).map(([s, v]) => [s, pct(v, 3)]))}

| SCATTER 賠付 | ${pct(exact.scatterRtp, 3)} |
|---|---|

## Reel strip 組成

${table(compositionHeader, compositionRows)}
`;

const outPath = path.resolve(values.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown);

console.log('');
console.table(Object.fromEntries(summaryRows.map(([k, sim, th]) => [k.trim(), { 模擬: sim, 理論值: th }])));
console.table(Object.fromEntries(histogramRows.map(([k, n, p]) => [k, { 次數: n, 佔比: p }])));
console.log(`RTP ${mark(rtpOk)} / Hit frequency ${mark(hitOk)}`);
console.log(`Report written to ${path.relative(process.cwd(), outPath)}`);
if (!rtpOk || !hitOk) process.exitCode = 1;
