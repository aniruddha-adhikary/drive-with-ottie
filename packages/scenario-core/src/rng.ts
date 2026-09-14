import { type Rng, type Seed } from '@ottie/contracts';

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic 32-bit RNG (mulberry32 seeded from an FNV-1a hash of the seed string). Same seed,
 * same sequence, on every platform. This is the only randomness source generation may use.
 */
export function createSeededRng(seed: Seed): Rng {
  let state = fnv1a32(seed);
  const nextU32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = (): number => nextU32() / 4294967296;
  return {
    seed,
    next,
    int: (minInclusive, maxInclusive) => {
      if (maxInclusive < minInclusive) throw new RangeError('int: empty range');
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('pick: empty list');
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError('pick: index out of range');
      return item;
    },
  };
}
