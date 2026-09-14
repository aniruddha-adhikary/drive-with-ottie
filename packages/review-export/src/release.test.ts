import { describe, expect, it } from 'vitest';
import { compileRegistry, createRegistryResolver, curationFromDefinitions } from '@ottie/asset-registry';
import { computeRegistryHash } from '@ottie/asset-registry/hash.node.js';
import { loadExtractionLibrary } from '@ottie/asset-registry/library.node.js';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_TEMPLATES, DEVELOPMENT_WORLDS, EXTRACTED_DEVELOPMENT_ASSETS } from '@ottie/contracts/fixtures';
import { assessReleaseExport } from './release';

function inputs() {
  const repoRoot = new URL('../../../', import.meta.url).pathname;
  const registry = compileRegistry(loadExtractionLibrary(repoRoot), {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((asset) => asset.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);
  return { registry, registryHash, worlds: DEVELOPMENT_WORLDS, templates: DEVELOPMENT_TEMPLATES, bundles: [DEVELOPMENT_CONTENT_BUNDLE], resolver: createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, registryHash), repoRoot };
}

describe('review release refusal', () => {
  it('refuses every development fixture before release closure', () => {
    const report = assessReleaseExport(inputs());
    expect(report.ok).toBe(false);
    for (const world of DEVELOPMENT_WORLDS) {
      expect(report.refusals).toEqual(expect.arrayContaining([
        expect.objectContaining({ worldId: world.id, reason: 'uses_quarantined_assets' }),
        expect.objectContaining({ worldId: world.id, reason: 'fixture_not_release_candidate' }),
        expect.objectContaining({ worldId: world.id, reason: 'canonical_hash_missing' }),
      ]));
      expect(report.refusals).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ worldId: world.id, reason: 'canonical_hash_mismatch' }),
      ]));
    }
    expect(report.c1.rejections).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'not_release_ready' })]));
  });

  it('does not bypass C1 when fixture status is changed', () => {
    const source = inputs();
    const worlds = DEVELOPMENT_WORLDS.map((world) => ({ ...world, provenance: { ...world.provenance, status: 'generated' as const, usesQuarantinedAssets: false } }));
    const report = assessReleaseExport({ ...source, worlds });
    expect(report.ok).toBe(false);
    expect(report.c1.rejections.length).toBeGreaterThan(0);
  });
});
