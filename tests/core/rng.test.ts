import { describe, expect, it } from 'vitest';
import { createRandom } from '../../assets/scripts/core/rng';

describe('createRandom', () => {
  it('相同 seed 產生相同序列', () => {
    const a = createRandom(12345);
    const b = createRandom(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('不同 seed 產生不同序列', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() 落在 [0, 1)，nextInt() 落在 [0, max)', () => {
    const rng = createRandom(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.nextInt(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('nextInt() 分佈大致均勻', () => {
    const rng = createRandom(7);
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[rng.nextInt(10)]++;
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it('nextInt() 拒絕非正整數上限', () => {
    const rng = createRandom(1);
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(2.5)).toThrow();
  });
});
