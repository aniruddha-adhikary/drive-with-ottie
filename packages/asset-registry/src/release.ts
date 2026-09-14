import {
  type AssemblyDefinitionId,
  type AssetDefinition,
  type AssetId,
  type AssetRef,
  type ContentBundle,
  type ContentBundleRef,
  type DeepReadonly,
  type ReviewState,
  type Sha256,
  type Template,
  type TemplateId,
  type World,
  type WorldId,
} from '@ottie/contracts';
import { type DependencyClosure, type DependencyIndex, buildDependencyIndex, bundleKey } from './dependencies';
import { type CompiledRegistry, type ReferenceRecord, compareStrings, refKey } from './records';

export type ReleaseRejectionReason =
  | 'unknown_asset'
  | 'unknown_version'
  | 'retired'
  | 'blocked'
  | 'not_release_ready'
  | 'conflicted'
  | 'reference_not_approved'
  | 'definition_not_release_ready'
  | 'unknown_definition'
  | 'missing_dependency'
  | 'source_conflict'
  | 'source_unresolved'
  | 'content_not_reviewed'
  | 'rule_unresolved'
  | 'unknown_root';

export interface ReleaseRejection {
  /** Asset ref key, definition id, reference id, world id, template id, bundle key or rule id. */
  readonly subject: string;
  readonly reason: ReleaseRejectionReason;
  readonly detail: string;
  /** Root (bundle/world/template/asset) whose closure pulled the subject in. */
  readonly root: string;
}

export interface ReleaseRoots {
  readonly bundles?: readonly ContentBundleRef[];
  readonly worlds?: readonly WorldId[];
  readonly templates?: readonly TemplateId[];
  readonly assets?: readonly AssetRef[];
}

export interface ReleaseExportInput {
  readonly registry: CompiledRegistry;
  readonly registryHash: Sha256;
  readonly worlds?: readonly DeepReadonly<World>[];
  readonly templates?: readonly Template[];
  readonly bundles?: readonly ContentBundle[];
  /** Defaults to every supplied bundle. There is no option to admit unapproved records. */
  readonly roots?: ReleaseRoots;
}

export interface ReleaseExport {
  readonly ok: boolean;
  readonly registryHash: Sha256;
  /** Roots that passed and the exact closure they carry. Empty until sources are approved. */
  readonly accepted: readonly DependencyClosure[];
  readonly rejectedRoots: readonly string[];
  readonly rejections: readonly ReleaseRejection[];
}

export function isApproved(review: ReviewState): boolean {
  return review.releaseReady && review.contentApproved && review.reuseApproved && review.approvalEvidence.length > 0;
}

function describeReview(review: ReviewState): string {
  return `releaseReady=${String(review.releaseReady)} contentApproved=${String(review.contentApproved)} reuseApproved=${String(review.reuseApproved)} evidence=${String(review.approvalEvidence.length)}`;
}

/**
 * Release rules for one record, independent of what depends on it. Approval requires every flag,
 * evidence, no `blocked`/`retired` state and no compiler-detected conflict. Reference records are
 * held to the same standard because a definition's evidence ships with the definition.
 */
export function assessAssetRecord(registry: CompiledRegistry, asset: AssetDefinition, root: string): ReleaseRejection[] {
  const subject = refKey(asset);
  const out: ReleaseRejection[] = [];
  if (registry.conflictedIds.includes(asset.id)) out.push({ subject, reason: 'conflicted', detail: 'compiler diagnostics report an unresolved error for this record', root });
  if (asset.review.runtimeState === 'retired') out.push({ subject, reason: 'retired', detail: 'asset retired', root });
  if (asset.review.extractionStatus === 'blocked') out.push({ subject, reason: 'blocked', detail: asset.review.warnings.join('; ') || 'extraction blocked', root });
  if (!isApproved(asset.review)) out.push({ subject, reason: 'not_release_ready', detail: describeReview(asset.review), root });
  for (const file of asset.provenance.files) {
    if (file.sha256 === null) out.push({ subject, reason: 'conflicted', detail: `${file.role} ${file.path} has no sha256`, root });
  }
  for (const locator of asset.provenance.geometrySources) {
    const source = registry.sources.find((s) => s.id === locator.sourceId);
    if (!source) out.push({ subject, reason: 'missing_dependency', detail: `source ${locator.sourceId} not in registry`, root });
    else if (source.unresolved.length > 0) out.push({ subject, reason: 'source_unresolved', detail: `${source.id}: ${source.unresolved.join('; ')}`, root });
    if (registry.sourceConflicts.some((c) => c.sourceId === locator.sourceId)) out.push({ subject, reason: 'source_conflict', detail: `source ${locator.sourceId} has conflicting hashes`, root });
  }
  return out;
}

export function assessReferenceRecord(registry: CompiledRegistry, reference: ReferenceRecord, root: string): ReleaseRejection[] {
  const out: ReleaseRejection[] = [];
  if (registry.conflictedIds.includes(reference.id)) out.push({ subject: reference.id, reason: 'conflicted', detail: 'compiler diagnostics report an unresolved error for this record', root });
  if (reference.review.extractionStatus === 'blocked') out.push({ subject: reference.id, reason: 'blocked', detail: reference.review.warnings.join('; ') || 'extraction blocked', root });
  if (!isApproved(reference.review)) out.push({ subject: reference.id, reason: 'reference_not_approved', detail: describeReview(reference.review), root });
  if (registry.sourceConflicts.some((c) => c.sourceId === reference.locator.sourceId)) out.push({ subject: reference.id, reason: 'source_conflict', detail: `source ${reference.locator.sourceId} has conflicting hashes`, root });
  return out;
}

export function assessDefinition(registry: CompiledRegistry, id: AssemblyDefinitionId, root: string): ReleaseRejection[] {
  const definition = registry.assemblyDefinitions.find((d) => d.id === id);
  if (!definition) return [{ subject: id, reason: 'unknown_definition', detail: 'not in registry', root }];
  const out: ReleaseRejection[] = [];
  if (registry.conflictedIds.includes(id)) out.push({ subject: id, reason: 'conflicted', detail: 'compiler diagnostics report an unresolved error for this definition', root });
  if (!definition.releaseReady) out.push({ subject: id, reason: 'definition_not_release_ready', detail: `release_ready=false license=${definition.licenseStatus}`, root });
  return out;
}

/**
 * Every rejection in the exact closure of `closure.root`. A root is releasable only when this is
 * empty: one unapproved reference drawing three definitions deep is enough to reject a bundle.
 */
export function assessClosure(registry: CompiledRegistry, closure: DependencyClosure): ReleaseRejection[] {
  const out: ReleaseRejection[] = [];
  const byKey = new Map<string, AssetDefinition>(registry.assets.map((a) => [refKey(a), a]));
  const references = new Map<AssetId, ReferenceRecord>(registry.references.map((r) => [r.id, r]));
  for (const missing of closure.missing) out.push({ subject: missing, reason: 'missing_dependency', detail: 'referenced but not loaded', root: closure.root });
  for (const ref of closure.assets) {
    const asset = byKey.get(refKey(ref));
    if (!asset) {
      out.push({ subject: refKey(ref), reason: registry.assets.some((a) => a.id === ref.id) ? 'unknown_version' : 'unknown_asset', detail: 'not in registry', root: closure.root });
      continue;
    }
    out.push(...assessAssetRecord(registry, asset, closure.root));
  }
  for (const id of closure.references) {
    const reference = references.get(id);
    if (!reference) out.push({ subject: id, reason: 'unknown_asset', detail: 'reference record not in registry', root: closure.root });
    else out.push(...assessReferenceRecord(registry, reference, closure.root));
  }
  for (const id of closure.definitions) out.push(...assessDefinition(registry, id, closure.root));
  return out;
}

/**
 * Default release export. Every root's exact closure must be fully approved: assets, the reference
 * drawings and assembly definitions they cite, the worlds and templates involved, and the content
 * itself (`reviewStatus === 'reviewed'`, no unresolved rule conflicts). Anything else rejects the
 * whole root. There is no override; development consumers use `createRegistryResolver` in
 * development mode instead.
 */
export function exportRelease(input: ReleaseExportInput): ReleaseExport {
  const index: DependencyIndex = buildDependencyIndex({
    registry: input.registry,
    worlds: input.worlds ?? [],
    templates: input.templates ?? [],
    bundles: input.bundles ?? [],
  });
  const bundlesByKey = new Map<string, ContentBundle>((input.bundles ?? []).map((b) => [bundleKey(b), b]));
  const worldsById = new Map<WorldId, DeepReadonly<World>>((input.worlds ?? []).map((w) => [w.id, w]));
  const templatesById = new Map<TemplateId, Template>((input.templates ?? []).map((t) => [t.id, t]));

  const roots: ReleaseRoots = input.roots ?? { bundles: (input.bundles ?? []).map((b) => ({ id: b.id, version: b.version })) };
  const rejections: ReleaseRejection[] = [];
  const accepted: DependencyClosure[] = [];
  const rejectedRoots = new Set<string>();

  const consider = (root: string, closure: DependencyClosure | null, extra: readonly ReleaseRejection[]): void => {
    if (closure === null) {
      rejections.push({ subject: root, reason: 'unknown_root', detail: 'not loaded', root });
      rejectedRoots.add(root);
      return;
    }
    const found = [...extra, ...assessClosure(input.registry, closure)];
    for (const worldId of closure.worlds) {
      const world = worldsById.get(worldId);
      if (!world) found.push({ subject: worldId, reason: 'missing_dependency', detail: 'world not loaded', root });
    }
    for (const templateId of closure.templates) {
      const template = templatesById.get(templateId);
      if (!template) found.push({ subject: templateId, reason: 'missing_dependency', detail: 'template not loaded', root });
      else if (template.reviewStatus !== 'reviewed') found.push({ subject: templateId, reason: 'content_not_reviewed', detail: `template reviewStatus=${template.reviewStatus}`, root });
    }
    if (found.length === 0) accepted.push(closure);
    else {
      rejections.push(...found);
      rejectedRoots.add(root);
    }
  };

  for (const ref of roots.bundles ?? []) {
    const key = bundleKey(ref);
    const bundle = bundlesByKey.get(key);
    const extra: ReleaseRejection[] = [];
    if (bundle) {
      if (bundle.reviewStatus !== 'reviewed') extra.push({ subject: key, reason: 'content_not_reviewed', detail: `bundle reviewStatus=${bundle.reviewStatus}`, root: key });
      for (const question of bundle.questions) {
        if (question.reviewStatus !== 'reviewed') extra.push({ subject: question.id, reason: 'content_not_reviewed', detail: `question reviewStatus=${question.reviewStatus}`, root: key });
      }
      for (const term of bundle.terms) {
        if (term.reviewStatus !== 'reviewed') extra.push({ subject: term.id, reason: 'content_not_reviewed', detail: `term reviewStatus=${term.reviewStatus}`, root: key });
      }
      for (const rule of bundle.rules) {
        if (rule.unresolved.length > 0) extra.push({ subject: rule.id, reason: 'rule_unresolved', detail: rule.unresolved.join('; '), root: key });
      }
    }
    consider(key, index.bundleClosure(ref), extra);
  }
  for (const id of roots.worlds ?? []) consider(id, index.worldClosure(id), []);
  for (const id of roots.templates ?? []) consider(id, index.templateClosure(id), []);
  for (const ref of roots.assets ?? []) consider(refKey(ref), index.assetClosure(ref), []);

  rejections.sort((a, b) => compareStrings(a.root, b.root) || compareStrings(a.subject, b.subject) || compareStrings(a.reason, b.reason));
  return {
    ok: rejectedRoots.size === 0,
    registryHash: input.registryHash,
    accepted,
    rejectedRoots: [...rejectedRoots].sort(compareStrings),
    rejections,
  };
}
