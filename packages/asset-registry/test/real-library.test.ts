import { describe, expect, it } from 'vitest';
import { assetId, canonicalJson } from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, EXTRACTED_DEVELOPMENT_ASSETS } from '@ottie/contracts/fixtures';
import { compileRegistry } from '../src/compile';
import { curationFromDefinitions } from '../src/curation';
import { classifyFiles } from '../src/records';
import { createRegistryResolver } from '../src/resolver';
import { exportRelease } from '../src/release';
import { verifyFileHashes } from '../src/library.node';
import { computeRegistryHash } from '../src/hash.node';
import { REPO_ROOT, realLibrary } from './helpers';

const library = realLibrary();
const registry = compileRegistry(library, {
  curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
  runtimeAssets: DEVELOPMENT_ASSETS.filter((a) => a.provenance.family === 'runtime'),
});

describe('real extraction library', () => {
  it('loads all six manifests, the geometry files and the assembly definitions cleanly', () => {
    expect(library.diagnostics).toEqual([]);
    expect(library.manifests.map((m) => m.family).sort()).toEqual(['assemblies', 'informatory', 'mandatory', 'markings', 'prohibitory', 'warning']);
    expect(Object.keys(library.markingGeometry)).toHaveLength(24);
    expect(library.assemblyDefinitions?.definitions).toHaveLength(14);
  });

  it('compiles every manifest record into exactly one runtime asset or one reference record', () => {
    const manifestCount = library.manifests.reduce((n, m) => n + m.assets.length, 0);
    expect(manifestCount).toBe(339);
    const runtimeFromManifests = registry.assets.filter((a) => a.provenance.family !== 'runtime');
    expect(runtimeFromManifests.length + registry.references.length).toBe(manifestCount);
    const ids = new Set([...registry.assets.map((a) => a.id), ...registry.references.map((r) => r.id)]);
    expect(ids.size).toBe(manifestCount + 4);
    expect(registry.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(registry.conflictedIds).toEqual([]);
    expect(registry.sourceConflicts).toEqual([]);
  });

  it('never lets a reference record carry a renderer candidate, and every renderer candidate has a manifest hash', () => {
    for (const reference of registry.references) {
      expect(classifyFiles(reference.files).rendererCandidates).toEqual([]);
      expect(['assembly_reference', 'layout_reference']).toContain(reference.kind);
    }
    for (const asset of registry.assets) {
      for (const file of classifyFiles(asset.provenance.files).rendererCandidates) {
        expect(file.sha256, `${asset.id} ${file.path}`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('preserves manifest review state verbatim: nothing is approved', () => {
    for (const asset of registry.assets) {
      expect(asset.review.releaseReady).toBe(false);
      expect(asset.review.contentApproved).toBe(false);
      expect(asset.review.reuseApproved).toBe(false);
    }
    for (const reference of registry.references) expect(reference.review.releaseReady).toBe(false);
    for (const definition of registry.assemblyDefinitions) expect(definition.releaseReady).toBe(false);
  });

  it('keeps every declared source hash and links each locator to a known source', () => {
    const sourceIds = new Set(registry.sources.map((s) => s.id));
    for (const source of registry.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const asset of registry.assets) {
      for (const locator of asset.provenance.geometrySources) expect(sourceIds.has(locator.sourceId)).toBe(true);
    }
    for (const reference of registry.references) expect(sourceIds.has(reference.locator.sourceId)).toBe(true);
  });

  it('file bytes in the repository match the manifest hashes', () => {
    expect(verifyFileHashes(registry, REPO_ROOT)).toEqual([]);
  });

  it('assigns semantic roles from explicit manifest evidence only', () => {
    const byId = new Map(registry.assets.map((a) => [a.id, a]));
    expect(byId.get(assetId('sg.mandatory.stop'))?.role).toBe('stop_sign');
    expect(byId.get(assetId('sg.mandatory.give-way'))?.role).toBe('give_way_sign');
    expect(byId.get(assetId('sg.markings.control-stop-j'))?.role).toBe('stop_line');
    expect(byId.get(assetId('sg.markings.control-give-way-d'))?.role).toBe('give_way_line');
    expect(byId.get(assetId('sg.markings.control-give-way-d'))?.geometry.kind).toBe('marking');
    expect(byId.get(assetId('sg.assemblies.signal-through-green-right-red'))?.role).toBe('vehicle_signal_head');
    for (const asset of registry.assets) {
      if (asset.provenance.family === 'prohibitory') expect(asset.role).toBe('prohibitory_sign');
      if (asset.provenance.family === 'warning') expect(asset.role).toBe('warning_sign');
    }
  });

  it('is deterministic and reproducible', () => {
    const again = compileRegistry(library, {
      curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
      runtimeAssets: DEVELOPMENT_ASSETS.filter((a) => a.provenance.family === 'runtime'),
    });
    expect(canonicalJson(again)).toBe(canonicalJson(registry));
    expect(computeRegistryHash(again.assets)).toBe(computeRegistryHash(registry.assets));
  });

  it('release resolver rejects every asset; development resolver requires the explicit flag and quarantines everything', () => {
    const hash = computeRegistryHash(registry.assets);
    const release = createRegistryResolver(registry, { mode: 'release' }, hash);
    const development = createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, hash);
    for (const ref of release.list()) {
      const rejected = release.resolve(ref);
      expect(rejected.ok).toBe(false);
      const loaded = development.resolve(ref);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) expect(loaded.quarantined).toBe(true);
    }
    for (const reference of registry.references) {
      expect(development.resolve({ id: reference.id, version: 1 }).ok).toBe(false);
    }
  });

  it('default release export of the whole registry accepts nothing today', () => {
    const roots = { assets: registry.assets.map((a) => ({ id: a.id, version: a.version })) };
    const result = exportRelease({ registry, registryHash: computeRegistryHash(registry.assets), roots });
    expect(result.ok).toBe(false);
    expect(result.accepted).toEqual([]);
    expect(result.rejectedRoots).toHaveLength(registry.assets.length);
    expect(result.rejections.every((r) => r.reason !== 'unknown_asset' && r.reason !== 'unknown_root')).toBe(true);
  });

  it('threads signal heads to their assembly definitions and inherited evidence', () => {
    const head = { id: assetId('sg.assemblies.signal-through-green-right-red'), version: 1 };
    const resolver = createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, computeRegistryHash(registry.assets));
    const closure = resolver.index.assetClosure(head);
    expect(closure.definitions).toEqual([
      'sg.assemblies.definition.signal-vertical-paired-arrows',
      'sg.assemblies.definition.signal-vertical-rag',
    ]);
    expect(closure.assets.map((a) => a.id)).toContain('sg.assemblies.signal-circular-red');
    expect(closure.missing).toEqual([]);
    expect(resolver.dependents(assetId('sg.assemblies.signal-circular-red')).map((r) => r.id)).toContain(head.id);
  });
});
