import { describe, expect, it } from 'vitest';
import { type ScenarioPackage, StarterContentError, loadStarterPackages } from './packages';
import { parseStarterClosure } from './closure';
import { loadStarterClosure } from './closure-data';
import { loadStarterContentSet } from './load';
import { canonicalWorldJson } from '@ottie/scenario-core';

const content = loadStarterContentSet();

function mutatedPackages(mutate: (scenario: ScenarioPackage) => ScenarioPackage) {
  const [first, ...rest] = loadStarterPackages();
  if (!first) throw new Error('no starter packages');
  return [{ scenario: mutate(first.scenario), questions: first.questions }, ...rest];
}

describe('starter content boundary', () => {
  it('loads three scenario packages, six questions and every pinned world through the exact closure', () => {
    expect(content.scenarios).toHaveLength(3);
    expect(content.bundle.questions).toHaveLength(6);
    expect(content.closure.assets).toHaveLength(14);
    for (const scenario of content.scenarios) {
      for (const g of scenario.worlds) {
        expect(g.world.provenance.key.assetRegistryHash).toBe(content.closure.registryHash);
        expect(g.world.provenance.canonicalHash).toBe(g.authored.canonicalHash);
        expect(content.worlds.get(g.world.id)).toBe(g.world);
      }
    }
    for (const question of content.bundle.questions) {
      expect(content.worlds.has(question.worldId)).toBe(true);
      expect(question.options).toHaveLength(4);
    }
  });

  it('refuses a registry hash mismatch instead of rendering against a different library', () => {
    const packages = mutatedPackages((s) => ({ ...s, pins: { ...s.pins, assetRegistryHash: 'a'.repeat(64) as ScenarioPackage['pins']['assetRegistryHash'] } }));
    expect(() => loadStarterContentSet({ packages })).toThrow(StarterContentError);
    expect(() => loadStarterContentSet({ packages })).toThrow(/registry_hash_mismatch|pins asset registry/);
  });

  it('refuses an authored canonical hash mismatch instead of silently accepting regenerated geometry', () => {
    const packages = mutatedPackages((s) => {
      const [world, ...others] = s.worlds;
      if (!world) throw new Error('scenario has no worlds');
      return { ...s, worlds: [{ ...world, canonicalHash: 'b'.repeat(64) as typeof world.canonicalHash }, ...others] };
    });
    let error: unknown;
    try {
      loadStarterContentSet({ packages });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(StarterContentError);
    expect((error as StarterContentError).code).toBe('canonical_hash_mismatch');
  });

  it('refuses a hand-edited closure record', () => {
    const closure = loadStarterClosure();
    const [asset, ...rest] = closure.assets;
    if (!asset) throw new Error('closure has no assets');
    const edited: unknown = { ...closure, assets: [{ ...asset, id: `${asset.id}.edited` }, ...rest] };
    expect(() => parseStarterClosure(edited)).toThrow(/closure/);
  });

  it('keeps the green circular + green right-arrow comparison unavailable with its reason', () => {
    const signal = content.scenarios.find((s) => s.scenario.id.includes('signal'));
    if (!signal) throw new Error('signal scenario missing');
    const greenGreen = signal.comparisons.find((c) => /green.*green|protected/i.test(`${c.comparison.id} ${c.comparison.label}`));
    expect(greenGreen).toBeDefined();
    expect(greenGreen?.kind).toBe('unavailable');
    if (greenGreen?.kind === 'unavailable') {
      // The generator does not author a protected right turn against the opposing movements, so V1
      // refuses the phase; the refusal (not a rendered green/green junction) is what the lesson shows.
      expect(['unsupported_phase', 'validation_errors']).toContain(greenGreen.reason);
      expect(greenGreen.detail).toMatch(/signal_movements/);
    }
  });

  it('renders every available comparison in a separate world without touching the base', () => {
    for (const scenario of content.scenarios) {
      for (const outcome of scenario.comparisons) {
        if (outcome.kind !== 'available') continue;
        const base = content.worlds.get(outcome.comparison.baseWorldId);
        if (!base) throw new Error(`base ${outcome.comparison.baseWorldId} missing`);
        expect(outcome.world).not.toBe(base);
        expect(outcome.world.id).not.toBe(base.id);
        expect(canonicalWorldJson(outcome.world)).not.toBe(canonicalWorldJson(base));
        const pinned = scenario.worlds.find((g) => g.world.id === base.id);
        expect(pinned?.world.provenance.canonicalHash).toBe(pinned?.authored.canonicalHash);
      }
      expect(scenario.comparisons.some((c) => c.kind === 'available')).toBe(true);
    }
  });
});
