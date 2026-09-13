import type { ReelStrips } from './types';

/**
 * 初始 reel strips（未調校）。
 * 執行 pnpm tune 後將由 tools/tune-strips.ts 覆寫。
 */
export const REEL_STRIPS: ReelStrips = [
    [
        'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K', 'A', 'H2',
        'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K', 'A', 'H2',
        'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K', 'A', 'H2',
        'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K', 'A', 'H2',
        'H3', 'J', 'Q', 'K', 'A', 'H1', 'H3', 'Q', 'J', 'H2',
    ],
    [
        'Q', 'J', 'A', 'K', 'H2', 'SCATTER', 'J', 'A', 'K', 'H1',
        'Q', 'J', 'A', 'K', 'H2', 'Q', 'J', 'A', 'K', 'H1',
        'Q', 'J', 'A', 'K', 'H2', 'Q', 'J', 'A', 'K', 'H1',
        'Q', 'J', 'A', 'K', 'H2', 'Q', 'J', 'A', 'K', 'H1',
        'WILD', 'H3', 'SCATTER', 'J', 'Q', 'H3', 'WILD', 'K', 'A', 'H1',
    ],
    [
        'K', 'A', 'J', 'Q', 'H1', 'K', 'SCATTER', 'J', 'Q', 'H3',
        'K', 'A', 'J', 'Q', 'H1', 'K', 'A', 'J', 'Q', 'H2',
        'K', 'A', 'WILD', 'Q', 'H1', 'K', 'A', 'J', 'Q', 'H2',
        'K', 'A', 'J', 'Q', 'H1', 'K', 'A', 'J', 'Q', 'H2',
        'WILD', 'H3', 'J', 'SCATTER', 'K', 'H2', 'A', 'Q', 'J', 'H1',
    ],
    [
        'A', 'K', 'Q', 'J', 'H1', 'A', 'SCATTER', 'Q', 'J', 'H2',
        'A', 'K', 'Q', 'J', 'H1', 'A', 'K', 'Q', 'J', 'H2',
        'A', 'K', 'WILD', 'J', 'H1', 'A', 'K', 'Q', 'J', 'H3',
        'A', 'K', 'Q', 'J', 'H1', 'A', 'K', 'Q', 'J', 'H2',
        'H3', 'WILD', 'Q', 'J', 'SCATTER', 'K', 'H1', 'A', 'Q', 'H2',
    ],
    [
        'H1', 'J', 'Q', 'K', 'A', 'SCATTER', 'J', 'Q', 'K', 'A',
        'H2', 'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K', 'A',
        'H3', 'J', 'Q', 'K', 'A', 'H2', 'J', 'Q', 'K', 'A',
        'H1', 'J', 'Q', 'K', 'A', 'H2', 'J', 'Q', 'K', 'A',
        'H3', 'SCATTER', 'J', 'Q', 'K', 'A', 'H1', 'J', 'Q', 'K',
    ],
];
