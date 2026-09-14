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
import { ALL_SYMBOLS, HOLD_SPIN_RESPINS, HOLD_SPIN_TRIGGER, LINE_COUNT, RTP_TOLERANCE, TARGET_HIT_FREQUENCY, TARGET_RTP } from '../assets/scripts/core/config';
import { BONUS_PRIZE_TOTAL_WEIGHT, BONUS_PRIZES, bonusMultiple, JACKPOT_MULTIPLIERS, RESPIN_BONUS_CHANCE } from '../assets/scripts/core/paytable';
import { REEL_STRIPS } from '../assets/scripts/core/reelStrips';
import type { BonusJackpotId } from '../assets/scripts/core/types';
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

// RTP 以精確解析驗收；模擬的標準差約 8 倍總注，100 萬次的 95% 信賴區間約 ±1.5%，
// 因此模擬值只要求落在理論值的信賴區間內（驗證實作與理論一致），而不是直接與目標比較
const rtpOk = Math.abs(exact.totalRtp - TARGET_RTP) <= RTP_TOLERANCE;
const consistent = Math.abs(stats.rtp - exact.totalRtp) <= stats.rtpCi95;
const hitOk = stats.hitFrequency >= TARGET_HIT_FREQUENCY[0] && stats.hitFrequency <= TARGET_HIT_FREQUENCY[1];
const mark = (ok: boolean) => (ok ? 'PASS' : 'FAIL');
const signedPct = (v: number) => `${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}`;

const holdSpins = stats.holdSpinTriggers + stats.holdSpinTriggersInFree;
const perHoldSpin = (n: number) => (holdSpins > 0 ? n / holdSpins : 0);
const jackpotWeight = (id: BonusJackpotId) => BONUS_PRIZES.find((p) => p.prize.kind === 'jackpot' && p.prize.jackpot === id)?.weight ?? 0;
const jackpotRow = (id: BonusJackpotId): [string, string, string] => [
    '　' + id + '（每千次 Hold & Spin）',
    (perHoldSpin(stats.jackpots[id]) * 1000).toFixed(1),
    ((exact.expectedFinalBonus * jackpotWeight(id) * 1000) / BONUS_PRIZE_TOTAL_WEIGHT).toFixed(1),
];

const summaryRows: [string, string, string][] = [
    ['總 RTP', pct(stats.rtp), pct(exact.totalRtp, 3)],
    ['　一般遊戲（線贏分 + SCATTER）', pct(stats.baseRtp), pct(exact.baseRtp, 3)],
    ['　免費遊戲（線贏分 + SCATTER）', pct(stats.freeRtp), pct(exact.freeRtp, 3)],
    ['　Hold & Spin（含免費遊戲中觸發）', pct(stats.holdSpinRtp), pct(exact.holdSpinRtp, 3)],
    ['Hit frequency（含觸發的功能）', pct(stats.hitFrequency), '—'],
    ['免費遊戲觸發頻率', `1 / ${stats.triggerInterval.toFixed(1)} spins`, `1 / ${(1 / exact.triggerProb).toFixed(1)} spins`],
    ['每次觸發平均免費旋轉', (stats.freeSpinsPlayed / Math.max(1, stats.triggers)).toFixed(2), exact.expectedFreeSpins.toFixed(2)],
    ['重觸發次數', num(stats.retriggers), '—'],
    ['Hold & Spin 觸發頻率（一般遊戲）', `1 / ${stats.holdSpinInterval.toFixed(1)} spins`, `1 / ${(1 / exact.holdSpinTriggerProb).toFixed(1)} spins`],
    ['免費遊戲中觸發 Hold & Spin', num(stats.holdSpinTriggersInFree), '—'],
    ['每次 Hold & Spin 平均重轉次數', perHoldSpin(stats.respinsPlayed).toFixed(2), '—'],
    ['每次 Hold & Spin 結束時平均 BONUS 數', perHoldSpin(stats.holdSpinBonusTotal).toFixed(2), exact.expectedFinalBonus.toFixed(2)],
    ['每次 Hold & Spin 平均贏分', `${(perHoldSpin(stats.holdWin) / bet).toFixed(2)}x`, `${exact.holdSpinPrize.toFixed(2)}x`],
    ['GRAND（填滿 15 格）', `${num(stats.grands)} 次`, `每 ${(1 / exact.grandProb).toFixed(0)} 次 Hold & Spin`],
    jackpotRow('MAJOR'),
    jackpotRow('MINOR'),
    jackpotRow('MINI'),
    ['最大單次贏分（含觸發的所有功能）', `${(stats.maxWin / bet).toFixed(2)}x`, '—'],
    ['標準差（單次 spin，總注倍數）', stats.stdDev.toFixed(2), '—'],
    ['RTP 95% 信賴區間', `± ${pct(stats.rtpCi95)}`, '—'],
];

const histogramRows = HISTOGRAM_BUCKETS.map((b, i) => [b.label, num(stats.histogram[i]), pct(stats.histogram[i] / spins, 3)]);

const prizeRows = BONUS_PRIZES.map((entry) => [
    entry.prize.kind === 'cash' ? `${entry.prize.multiple}x` : entry.prize.jackpot,
    `${bonusMultiple(entry.prize)}x`,
    String(entry.weight),
    pct(entry.weight / BONUS_PRIZE_TOTAL_WEIGHT, 1),
]);

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

| 指標 | 目標 | 結果 | 判定 |
|---|---|---|---|
| 理論 RTP（精確解析） | ${pct(TARGET_RTP - RTP_TOLERANCE, 1)} ~ ${pct(TARGET_RTP + RTP_TOLERANCE, 1)} | ${pct(exact.totalRtp, 3)} | ${mark(rtpOk)} |
| 模擬 RTP 與理論值一致 | 差距在 95% 信賴區間內 | ${pct(stats.rtp)}（${signedPct(stats.rtp - exact.totalRtp)}，區間 ± ${pct(stats.rtpCi95)}） | ${mark(consistent)} |
| Hit frequency（模擬） | ${pct(TARGET_HIT_FREQUENCY[0], 0)} ~ ${pct(TARGET_HIT_FREQUENCY[1], 0)} | ${pct(stats.hitFrequency)} | ${mark(hitOk)} |

> 單次 spin 的標準差約 ${stats.stdDev.toFixed(1)} 倍總注，${num(spins)} 次模擬的 RTP 95% 信賴區間約 ± ${pct(stats.rtpCi95)}，
> 一次 GRAND（${JACKPOT_MULTIPLIERS.GRAND}x）就會讓 100 萬次的模擬 RTP 變動 0.1%。因此 RTP 以精確解析驗收，模擬用來確認實作與理論一致。

## 指標

「理論值」由 \`tools/lib/rtp-math.ts\` 依 strip 精確計算，與模擬結果互相驗證。

${table(['指標', '模擬', '理論值'], summaryRows)}

## 單次 spin 贏分分佈（總注倍數，含觸發的所有功能）

${table(['區間', '次數', '佔比'], histogramRows)}

## 各符號對線贏分 RTP 的貢獻（理論值）

${table(['符號', 'RTP 貢獻'], Object.entries(exact.lineRtpBySymbol).map(([s, v]) => [s, pct(v, 3)]))}

| SCATTER 賠付 | ${pct(exact.scatterRtp, 3)} |
|---|---|

## Hold & Spin 設定

- 觸發：盤面 ${HOLD_SPIN_TRIGGER} 個以上 BONUS，重轉 ${HOLD_SPIN_RESPINS} 次，有新 BONUS 落下時重設為 ${HOLD_SPIN_RESPINS} 次
- 重轉時每個未鎖定格落下 BONUS 的機率：${pct(RESPIN_BONUS_CHANCE, 1)}
- Jackpot：MINI ${JACKPOT_MULTIPLIERS.MINI}x、MINOR ${JACKPOT_MULTIPLIERS.MINOR}x、MAJOR ${JACKPOT_MULTIPLIERS.MAJOR}x、GRAND ${JACKPOT_MULTIPLIERS.GRAND}x（GRAND 由填滿 15 格獲得）

${table(['BONUS 獎項', '總注倍數', '權重', '機率'], prizeRows)}

## Reel strip 組成

${table(compositionHeader, compositionRows)}
`;

const outPath = path.resolve(values.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown);

console.log('');
console.table(Object.fromEntries(summaryRows.map(([k, sim, th]) => [k.trim(), { 模擬: sim, 理論值: th }])));
console.table(Object.fromEntries(histogramRows.map(([k, n, p]) => [k, { 次數: n, 佔比: p }])));
console.log(`Theoretical RTP ${mark(rtpOk)} / Simulation consistent ${mark(consistent)} / Hit frequency ${mark(hitOk)}`);
console.log(`Report written to ${path.relative(process.cwd(), outPath)}`);
if (!rtpOk || !consistent || !hitOk) process.exitCode = 1;
