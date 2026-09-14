import { type AssetId } from '@ottie/contracts';
import { type AssetDependents, type CompiledRegistry, buildDependencyIndex, type DependencyIndex } from '@ottie/asset-registry';
import { type ReviewInputs } from './inputs';

export interface AssetImpactReport {
  readonly assetId: AssetId;
  readonly found: boolean;
  readonly directRecord: { readonly version: number; readonly releaseReady: boolean; readonly review: CompiledRegistry['assets'][number]['review']; readonly conflicted: boolean } | null;
  readonly dependents: AssetDependents;
  readonly regenerate: { readonly worlds: readonly string[] };
  readonly review: { readonly questions: readonly string[]; readonly terms: readonly string[]; readonly bundles: readonly { readonly id: string; readonly version: number }[]; readonly templates: readonly string[] };
  readonly viaDefinitions: readonly string[];
  readonly paths: readonly { readonly worldId: string; readonly chain: readonly string[] }[];
  readonly assetClosure: ReturnType<DependencyIndex['assetClosure']>;
}

function reportFor(inputs: ReviewInputs, index: DependencyIndex, id: AssetId): AssetImpactReport {
  const asset = inputs.registry.assets.find((candidate) => candidate.id === id);
  const dependents = index.dependents(id);
  const directRecord = asset ? { version: asset.version, releaseReady: asset.review.releaseReady, review: asset.review, conflicted: inputs.registry.conflictedIds.includes(id) } : null;
  const paths = dependents.worlds.map((worldId) => {
    const closure = index.worldClosure(worldId);
    const chain = closure
      ? [
        id,
        ...dependents.definitions.filter((definition) => closure.definitions.includes(definition)),
        ...dependents.assets
          .filter((ref) => closure.assets.some((candidate) => candidate.id === ref.id && candidate.version === ref.version))
          .map((ref) => `${ref.id}@${ref.version}`),
        `world:${worldId}`,
      ]
      : [id, `world:${worldId}`];
    return { worldId, chain };
  });
  return {
    assetId: id,
    found: asset !== undefined,
    directRecord,
    dependents,
    regenerate: { worlds: dependents.worlds },
    review: { questions: dependents.questions, terms: dependents.terms, bundles: dependents.bundles, templates: dependents.templates },
    viaDefinitions: dependents.definitions,
    paths,
    assetClosure: index.assetClosure({ id, version: asset?.version ?? 1 }),
  };
}

export function assetChangeImpact(inputs: ReviewInputs, assetId: AssetId): AssetImpactReport {
  return reportFor(inputs, buildDependencyIndex(inputs), assetId);
}

export function impactForAssets(inputs: ReviewInputs, ids: readonly AssetId[]): readonly AssetImpactReport[] {
  const index = buildDependencyIndex(inputs);
  return ids.map((id) => reportFor(inputs, index, id));
}
