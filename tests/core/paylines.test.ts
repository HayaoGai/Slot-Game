import { describe, expect, it } from 'vitest';
import { LINE_COUNT, REEL_COUNT, ROW_COUNT } from '../../assets/scripts/core/config';
import { PAYLINES } from '../../assets/scripts/core/paylines';

describe('PAYLINES', () => {
  it(`共 ${LINE_COUNT} 條`, () => {
    expect(PAYLINES).toHaveLength(LINE_COUNT);
  });

  it('每條長度皆為 5，值域皆在 0~2', () => {
    for (const line of PAYLINES) {
      expect(line).toHaveLength(REEL_COUNT);
      for (const row of line) {
        expect(Number.isInteger(row)).toBe(true);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(ROW_COUNT);
      }
    }
  });

  it('互不重複', () => {
    const keys = new Set(PAYLINES.map((line) => line.join(',')));
    expect(keys.size).toBe(PAYLINES.length);
  });
});
