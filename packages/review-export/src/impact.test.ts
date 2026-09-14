import { describe, expect, it } from 'vitest';
import { compileRegistry, createRegistryResolver, curationFromDefinitions } from '@ottie/asset-registry';
import { computeRegistryHash } from '@ottie/asset-registry/hash.node.js';
import { loadExtractionLibrary } from '@ottie/asset-registry/library.node.js';
import { assetId } from '@ottie/contracts';
import { ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED, DEVELOPMENT_ASSETS, DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_TEMPLATES, DEVELOPMENT_WORLDS, EXTRACTED_DEVELOPMENT_ASSETS, QUESTION_GIVE_WAY } from '@ottie/contracts/fixtures';
import { assetChangeImpact } from './impact';

function inputs() {
  const repoRoot = new URL('../../../', import.meta.url).pathname;
  const registry = compileRegistry(loadExtractionLibrary(repoRoot), {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((asset) => asset.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);
  return { registry, registryHash, worlds: DEVELOPMENT_WORLDS, templates: DEVELOPMENT_TEMPLATES, bundles: [DEVELOPMENT_CONTENT_BUNDLE], resolver: createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, registryHash), repoRoot };
}

describe('asset change impact', () => {
  it('reports direct world, question, bundle and template impact', () => {
    const report = assetChangeImpact(inputs(), assetId('sg.mandatory.give-way'));
    expect(report.found).toBe(true);
    expect(report.regenerate.worlds).toContain('sg-give-way-t-001');
    expect(report.review.questions).toContain(QUESTION_GIVE_WAY.id);
    expect(report.review.bundles).toContainEqual({ id: DEVELOPMENT_CONTENT_BUNDLE.id, version: DEVELOPMENT_CONTENT_BUNDLE.version });
    expect(report.review.templates).toContain('sg.t-junction.give-way');
  });

  it('returns an empty report for an unknown asset', () => {
    const report = assetChangeImpact(inputs(), assetId('sg.unknown.asset'));
    expect(report.found).toBe(false);
    expect(report.directRecord).toBeNull();
    expect(report.dependents.assets).toEqual([]);
    expect(report.dependents.worlds).toEqual([]);
  });

  it('reports definition-transitive signal impact', () => {
    const report = assetChangeImpact(inputs(), assetId('sg.assemblies.signal-circular-red'));
    expect(report.regenerate.worlds).toContain('sg-signal-green-right-red-001');
    expect(report.viaDefinitions).toContain('sg.assemblies.definition.signal-vertical-rag');
    expect(report.dependents.assets).toContainEqual({
      id: ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED.id,
      version: ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED.version,
    });
    const path = report.paths.find((candidate) => candidate.worldId === 'sg-signal-green-right-red-001');
    expect(path?.chain).toContain('sg.assemblies.definition.signal-vertical-rag');
  });
});
