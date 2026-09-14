import {
  type AssetDefinition,
  type AssetId,
  type AssetRef,
  type AssetResolution,
  type AssetResolver,
  type ResolutionMode,
  type Sha256,
} from '@ottie/contracts';
import { type DependencyIndex, buildDependencyIndex } from './dependencies';
import { type CompiledRegistry, refKey } from './records';
import { type ReleaseRejectionReason, assessClosure } from './release';

/**
 * Resolver over a fixed list. `release` mode refuses anything that is not release-ready AND
 * content-approved AND reuse-approved; `development` mode returns such assets flagged quarantined.
 * `dependents` is empty: this resolver has no content index. Use `createRegistryResolver` for a
 * compiled registry with transitive checks and reverse lookups.
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

/**
 * Development loads are explicit: the caller must write `loadQuarantined: true`. Release mode has
 * no options because there is nothing to relax.
 */
export type RegistryResolverOptions =
  | { readonly mode: 'release' }
  | { readonly mode: 'development'; readonly loadQuarantined: true };

type FailureReason = Extract<AssetResolution, { ok: false }>['reason'];

/** Release rejections collapse onto the contract's closed reason set; anything structural is `blocked`. */
function resolutionReason(reason: ReleaseRejectionReason): FailureReason {
  switch (reason) {
    case 'retired':
    case 'unknown_asset':
    case 'unknown_version':
    case 'not_release_ready':
      return reason;
    case 'blocked':
    case 'conflicted':
    case 'reference_not_approved':
    case 'definition_not_release_ready':
    case 'unknown_definition':
    case 'missing_dependency':
    case 'source_conflict':
    case 'source_unresolved':
    case 'content_not_reviewed':
    case 'rule_unresolved':
    case 'unknown_root':
      return 'blocked';
  }
}

export interface RegistryResolver extends AssetResolver {
  readonly registry: CompiledRegistry;
  readonly index: DependencyIndex;
}

/**
 * Resolver over a compiled registry. In release mode a ref resolves only when its entire closure
 * (cited assembly definitions, their reference drawings, inherited definitions) is approved and
 * conflict-free, so an approved head cannot smuggle in an unapproved definition. In development
 * mode every non-retired asset resolves and is flagged `quarantined` unless its whole closure is approved.
 * Reference records are never resolvable in either mode.
 */
export function createRegistryResolver(
  registry: CompiledRegistry,
  options: RegistryResolverOptions,
  registryHash: Sha256,
  index: DependencyIndex = buildDependencyIndex({ registry }),
): RegistryResolver {
  const byRef = new Map<string, AssetDefinition>();
  const byId = new Map<AssetId, AssetDefinition[]>();
  for (const asset of registry.assets) {
    byRef.set(refKey(asset), asset);
    const versions = byId.get(asset.id) ?? [];
    versions.push(asset);
    byId.set(asset.id, versions);
  }
  const referenceIds = new Set<AssetId>(registry.references.map((r) => r.id));

  const resolve = (ref: AssetRef): AssetResolution => {
    const asset = byRef.get(refKey(ref));
    if (!asset) {
      const known = byId.get(ref.id);
      if (known) return { ok: false, ref, reason: 'unknown_version', detail: `known versions: ${known.map((a) => a.version).join(', ')}` };
      if (referenceIds.has(ref.id)) return { ok: false, ref, reason: 'unknown_asset', detail: 'reference record: evidence only, not a runtime asset' };
      return { ok: false, ref, reason: 'unknown_asset', detail: 'not in registry' };
    }
    if (asset.review.runtimeState === 'retired') {
      return { ok: false, ref, reason: 'retired', detail: 'asset retired' };
    }
    const rejections = assessClosure(registry, index.assetClosure(ref));
    const first = rejections[0];
    if (first === undefined) return { ok: true, asset, quarantined: false };
    if (options.mode === 'development') return { ok: true, asset, quarantined: true };
    const primary = rejections.find((r) => r.subject === refKey(ref)) ?? first;
    return {
      ok: false,
      ref,
      reason: resolutionReason(primary.reason),
      detail: rejections.map((r) => `${r.subject}: ${r.reason} (${r.detail})`).join(' | '),
    };
  };

  return {
    mode: options.mode,
    registryHash,
    registry,
    index,
    resolve,
    dependents: (id) => index.dependents(id).assets,
    list: () => registry.assets.map((a) => ({ id: a.id, version: a.version })),
  };
}
