import type { ReelStrips } from './types';

/**
 * 此檔由 tools/tune-strips.ts 產生，請勿手動修改。
 *
 * 組成：
 *   欄 | 長度 | J | Q | K | A | H1 | H2 | H3 | WILD | SCATTER | BONUS
 *   0 | 53 | 5 | 3 | 12 | 5 | 3 | 10 | 10 | 0 | 0 | 5
 *   1 | 54 | 7 | 8 | 3 | 10 | 3 | 3 | 13 | 1 | 2 | 4
 *   2 | 54 | 9 | 4 | 3 | 5 | 8 | 3 | 14 | 0 | 2 | 6
 *   3 | 54 | 3 | 4 | 4 | 3 | 4 | 10 | 13 | 6 | 2 | 5
 *   4 | 54 | 3 | 9 | 9 | 7 | 3 | 3 | 14 | 0 | 2 | 4
 *
 * 理論值：總 RTP 95.999%（一般 60.132% / 免費 13.153% / Hold & Spin 22.714%），
 * 免費遊戲觸發 1 / 198.8 spins，Hold & Spin 觸發 1 / 152.4 spins。
 */
export const REEL_STRIPS: ReelStrips = [
    [
        'H1', 'H1', 'H3', 'H3', 'H2', 'H2', 'BONUS', 'BONUS', 'K', 'J',
        'BONUS', 'J', 'H3', 'H3', 'K', 'H1', 'A', 'K', 'J', 'K',
        'H3', 'H3', 'K', 'Q', 'H2', 'H2', 'K', 'BONUS', 'BONUS', 'H2',
        'H2', 'K', 'J', 'H3', 'H3', 'K', 'A', 'K', 'H2', 'H2',
        'K', 'A', 'Q', 'H3', 'H3', 'J', 'A', 'K', 'H2', 'H2',
        'Q', 'A', 'K',
    ],
    [
        'SCATTER', 'A', 'Q', 'H1', 'H1', 'A', 'Q', 'H3', 'H3', 'BONUS',
        'BONUS', 'Q', 'J', 'A', 'K', 'H3', 'A', 'K', 'H3', 'H3',
        'A', 'H2', 'A', 'J', 'H3', 'H3', 'Q', 'H3', 'H3', 'SCATTER',
        'A', 'H3', 'H3', 'A', 'H3', 'H3', 'A', 'Q', 'H2', 'H2',
        'J', 'WILD', 'Q', 'J', 'A', 'BONUS', 'BONUS', 'Q', 'J', 'Q',
        'K', 'J', 'H1', 'J',
    ],
    [
        'SCATTER', 'J', 'A', 'Q', 'BONUS', 'BONUS', 'H2', 'H2', 'J', 'H3',
        'H3', 'H1', 'H1', 'H3', 'H3', 'H1', 'H1', 'BONUS', 'BONUS', 'H3',
        'H3', 'Q', 'K', 'H1', 'H1', 'J', 'H1', 'H1', 'SCATTER', 'J',
        'H3', 'H3', 'A', 'J', 'Q', 'J', 'H3', 'H3', 'H2', 'A',
        'J', 'BONUS', 'BONUS', 'K', 'H3', 'H3', 'J', 'A', 'H3', 'H3',
        'Q', 'J', 'K', 'A',
    ],
    [
        'SCATTER', 'A', 'H1', 'H1', 'H3', 'H3', 'H2', 'H2', 'A', 'WILD',
        'H3', 'H3', 'BONUS', 'BONUS', 'H3', 'H3', 'WILD', 'J', 'H1', 'H1',
        'H3', 'H3', 'H2', 'H2', 'H3', 'H3', 'K', 'Q', 'SCATTER', 'H2',
        'H2', 'K', 'A', 'Q', 'J', 'WILD', 'Q', 'H2', 'H2', 'H3',
        'H2', 'H2', 'BONUS', 'BONUS', 'K', 'WILD', 'J', 'Q', 'BONUS', 'WILD',
        'H3', 'H3', 'K', 'WILD',
    ],
    [
        'SCATTER', 'Q', 'H3', 'H3', 'H2', 'H3', 'H3', 'K', 'H3', 'H3',
        'H1', 'H1', 'J', 'A', 'H3', 'H3', 'K', 'A', 'H3', 'H3',
        'H1', 'Q', 'K', 'BONUS', 'BONUS', 'A', 'Q', 'A', 'SCATTER', 'Q',
        'H2', 'H2', 'K', 'H3', 'H3', 'Q', 'K', 'H3', 'H3', 'A',
        'Q', 'A', 'BONUS', 'BONUS', 'K', 'Q', 'K', 'J', 'K', 'Q',
        'K', 'A', 'Q', 'J',
    ],
];
