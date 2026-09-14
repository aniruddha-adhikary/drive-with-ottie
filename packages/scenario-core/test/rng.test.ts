import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@ottie/scenario-core';
import { seed } from '@ottie/contracts';

describe('seeded rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createSeededRng(seed('alpha'));
    const b = createSeededRng(seed('alpha'));
    const c = createSeededRng(seed('beta'));
    const seqA = [a.next(), a.next(), a.int(0, 9), a.pick(['x', 'y', 'z'])];
    const seqB = [b.next(), b.next(), b.int(0, 9), b.pick(['x', 'y', 'z'])];
    expect(seqA).toEqual(seqB);
    expect([c.next(), c.next()]).not.toEqual(seqA.slice(0, 2));
    for (let i = 0; i < 1000; i += 1) {
      const v = a.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
