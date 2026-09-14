import { describe, expect, it } from 'vitest';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { computeRegistryHash } from '@ottie/asset-registry/hash.node';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH, ref } from '@ottie/contracts/fixtures';
import { assetId } from '@ottie/contracts';

describe('in-memory asset resolver', () => {
  const hash = computeRegistryHash(DEVELOPMENT_ASSETS);

  it('pins the development registry hash used by the fixtures', () => {
    expect(hash).toBe(DEVELOPMENT_ASSET_REGISTRY_HASH);
    expect(computeRegistryHash([...DEVELOPMENT_ASSETS].reverse())).toBe(hash);
  });

  it('development mode resolves quarantined assets and says so', () => {
    const resolver = createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', hash);
    for (const asset of DEVELOPMENT_ASSETS) {
      const result = resolver.resolve(ref(asset));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.quarantined).toBe(true);
    }
    expect(resolver.list()).toHaveLength(DEVELOPMENT_ASSETS.length);
  });

  it('release mode rejects every current asset because none is release-ready', () => {
    const resolver = createInMemoryResolver(DEVELOPMENT_ASSETS, 'release', hash);
    for (const asset of DEVELOPMENT_ASSETS) {
      const result = resolver.resolve(ref(asset));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(['not_release_ready', 'blocked']).toContain(result.reason);
    }
  });

  it('distinguishes unknown asset from unknown version', () => {
    const resolver = createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', hash);
    const first = DEVELOPMENT_ASSETS[0];
    if (!first) throw new Error('no assets');
    const wrongVersion = resolver.resolve({ id: first.id, version: first.version + 100 });
    expect(!wrongVersion.ok && wrongVersion.reason).toBe('unknown_version');
    const unknown = resolver.resolve({ id: assetId('sg.markings.does-not-exist'), version: 1 });
    expect(!unknown.ok && unknown.reason).toBe('unknown_asset');
  });
});
