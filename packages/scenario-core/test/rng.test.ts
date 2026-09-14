import { describe, expect, it } from 'vitest';
import { createFixtureGenerator, createSeededRng } from '@ottie/scenario-core';
import { seed, worldId } from '@ottie/contracts';
import { DEVELOPMENT_WORLDS, TEMPLATE_GIVE_WAY_T } from '@ottie/contracts/fixtures';

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

describe('fixture generator (skeleton)', () => {
  it('returns the fixture for a known template and flags it as hand-authored', () => {
    const generator = createFixtureGenerator(DEVELOPMENT_WORLDS);
    const result = generator.generate({
      id: worldId('request-1'),
      schemaVersion: 1,
      templateRef: { id: TEMPLATE_GIVE_WAY_T.id, version: TEMPLATE_GIVE_WAY_T.version },
      seed: seed('any'),
      sourceProfileId: 'development',
      parameters: {},
      contentBundle: null,
      views: ['plan'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.world.provenance.key.template.id).toBe(TEMPLATE_GIVE_WAY_T.id);
      expect(result.diagnostics.some((d) => d.code === 'generator.fixture_returned')).toBe(true);
    }
  });
});
