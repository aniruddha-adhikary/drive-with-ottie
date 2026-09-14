import {
  type AssetDefinition,
  type AssetId,
  type AssetRef,
  type AssetResolution,
  type AssetResolver,
  type ResolutionMode,
  type Sha256,
} from '@ottie/contracts';

function refKey(ref: AssetRef): string {
  return `${ref.id}@${ref.version}`;
}

/**
 * Resolver over a fixed list. `release` mode refuses anything that is not release-ready AND
 * content-approved AND reuse-approved; `development` mode returns such assets flagged quarantined.
 * `dependents` is empty here: C1 wires it to the content/world index.
 */
export function createInMemoryResolver(
  assets: readonly AssetDefinition[],
  mode: ResolutionMode,
  registryHash: Sha256,
): AssetResolver {
  const byRef = new Map<string, AssetDefinition>();
  const byId = new Map<AssetId, AssetDefinition[]>();
  for (const asset of assets) {
    byRef.set(refKey({ id: asset.id, version: asset.version }), asset);
    const versions = byId.get(asset.id) ?? [];
    versions.push(asset);
    byId.set(asset.id, versions);
  }

  const resolve = (ref: AssetRef): AssetResolution => {
    const asset = byRef.get(refKey(ref));
    if (!asset) {
      const known = byId.get(ref.id);
      return known
        ? { ok: false, ref, reason: 'unknown_version', detail: `known versions: ${known.map((a) => a.version).join(', ')}` }
        : { ok: false, ref, reason: 'unknown_asset', detail: 'not in registry' };
    }
    if (asset.review.runtimeState === 'retired') {
      return { ok: false, ref, reason: 'retired', detail: 'asset retired' };
    }
    if (asset.review.extractionStatus === 'blocked' && mode === 'release') {
      return { ok: false, ref, reason: 'blocked', detail: asset.review.warnings.join('; ') };
    }
    const approved = asset.review.releaseReady && asset.review.contentApproved && asset.review.reuseApproved;
    if (!approved && mode === 'release') {
      return { ok: false, ref, reason: 'not_release_ready', detail: `releaseReady=${String(asset.review.releaseReady)} contentApproved=${String(asset.review.contentApproved)} reuseApproved=${String(asset.review.reuseApproved)}` };
    }
    return { ok: true, asset, quarantined: !approved };
  };

  return {
    mode,
    registryHash,
    resolve,
    dependents: () => [],
    list: () => assets.map((a) => ({ id: a.id, version: a.version })),
  };
}
