import { type AssetDefinition, type DeepReadonly, type Sha256, type SourceLocator, type SourceRef, type World } from '@ottie/contracts';
import { type CompiledRegistry, type DependencyClosure, type DependencyIndex } from '@ottie/asset-registry';
import { canonicalWorldJson, computeCanonicalHash, verifyCanonicalHash } from '@ottie/scenario-core';
import { sha256OfFile } from '@ottie/asset-registry/library.node.js';
import path from 'node:path';
import { existsSync } from 'node:fs';

export interface ProvenanceSource {
  readonly source: SourceRef | null;
  readonly locator: SourceLocator;
}

export interface ProvenanceFile {
  readonly assetId: string;
  readonly version: number;
  readonly role: string;
  readonly path: string;
  readonly manifestSha256: Sha256 | null;
  readonly actualSha256: Sha256 | null;
  readonly matches: boolean | null;
}

export interface WorldProvenanceExport {
  readonly canonicalJson: string;
  readonly canonicalHash: Sha256 | null;
  readonly computedCanonicalHash: Sha256;
  readonly canonicalHashMatches: boolean;
  readonly reproducibilityKey: World['provenance']['key'];
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly status: World['provenance']['status'];
  readonly usesQuarantinedAssets: boolean;
  readonly notes: readonly string[];
  readonly generatedAt: string | null;
  readonly sources: readonly ProvenanceSource[];
  readonly files: readonly ProvenanceFile[];
  readonly assets: readonly {
    readonly assetId: string;
    readonly version: number;
    readonly review: AssetDefinition['review'];
    readonly releaseReady: boolean;
    readonly conflicted: boolean;
    readonly rawDimensionsMm: Readonly<Record<string, unknown>>;
  }[];
  readonly sourceConflicts: CompiledRegistry['sourceConflicts'];
}

function locKey(locator: SourceLocator): string {
  return `${locator.sourceId}:${String(locator.pdfPage)}:${locator.drawing ?? ''}:${locator.section ?? ''}:${locator.quote ?? ''}`;
}

function assetFiles(asset: AssetDefinition, repoRoot: string | undefined): ProvenanceFile[] {
  return asset.provenance.files.map((file) => {
    const actual = repoRoot && existsSync(path.join(repoRoot, file.path)) ? sha256OfFile(path.join(repoRoot, file.path)) as Sha256 : null;
    return {
      assetId: asset.id,
      version: asset.version,
      role: file.role,
      path: file.path,
      manifestSha256: file.sha256,
      actualSha256: actual,
      matches: actual === null || file.sha256 === null ? null : actual === file.sha256,
    };
  });
}

export function buildWorldProvenance(
  world: DeepReadonly<World>,
  index: DependencyIndex,
  registry: CompiledRegistry,
  repoRoot?: string,
): WorldProvenanceExport {
  const closure: DependencyClosure = index.worldClosure(world.id) ?? {
    root: world.id,
    assets: [],
    definitions: [],
    references: [],
    worlds: [],
    templates: [],
    missing: [],
  };
  const byKey = new Map(registry.assets.map((asset) => [`${asset.id}@${String(asset.version)}`, asset]));
  const assets = closure.assets.map((ref) => byKey.get(`${ref.id}@${String(ref.version)}`)).filter((asset): asset is AssetDefinition => asset !== undefined);
  const locators = assets.flatMap((asset) => [...asset.provenance.geometrySources, ...asset.provenance.meaningSources]);
  const sources = [...new Map(locators.map((locator) => [locKey(locator), {
    source: registry.sources.find((source) => source.id === locator.sourceId) ?? null,
    locator,
  }])).values()].sort((a, b) => locKey(a.locator).localeCompare(locKey(b.locator)));
  return {
    canonicalJson: canonicalWorldJson(world),
    canonicalHash: world.provenance.canonicalHash,
    computedCanonicalHash: computeCanonicalHash(world),
    canonicalHashMatches: verifyCanonicalHash(world),
    reproducibilityKey: world.provenance.key,
    parameters: world.provenance.parameters,
    status: world.provenance.status,
    usesQuarantinedAssets: world.provenance.usesQuarantinedAssets,
    notes: [...world.provenance.notes],
    generatedAt: world.provenance.generatedAt,
    sources,
    files: assets.flatMap((asset) => assetFiles(asset, repoRoot)).sort((a, b) => `${a.assetId}@${a.version}:${a.role}`.localeCompare(`${b.assetId}@${b.version}:${b.role}`)),
    assets: assets.map((asset) => ({
      assetId: asset.id,
      version: asset.version,
      review: asset.review,
      releaseReady: asset.review.releaseReady,
      conflicted: registry.conflictedIds.includes(asset.id),
      rawDimensionsMm: asset.provenance.rawDimensionsMm,
    })).sort((a, b) => `${a.assetId}@${a.version}`.localeCompare(`${b.assetId}@${b.version}`)),
    sourceConflicts: [...registry.sourceConflicts],
  };
}
