import {
  type AssemblyDefinitionId,
  type AssetId,
  type AssetRef,
  type ContentBundle,
  type ContentBundleRef,
  type DeepReadonly,
  type QuestionId,
  type Template,
  type TemplateId,
  type TermId,
  type World,
  type WorldId,
} from '@ottie/contracts';
import { type CompiledRegistry, compareStrings, refKey } from './records';

/** Content and scenario records whose asset references the registry indexes. */
export interface DependencyInputs {
  readonly registry: CompiledRegistry;
  readonly worlds?: readonly DeepReadonly<World>[];
  readonly templates?: readonly Template[];
  readonly bundles?: readonly ContentBundle[];
}

export interface AssetDependents {
  readonly id: AssetId;
  /** Assets whose closure includes this one (via assembly definitions). */
  readonly assets: readonly AssetRef[];
  readonly definitions: readonly AssemblyDefinitionId[];
  readonly worlds: readonly WorldId[];
  readonly templates: readonly TemplateId[];
  readonly questions: readonly QuestionId[];
  readonly terms: readonly TermId[];
  readonly bundles: readonly ContentBundleRef[];
}

/** Exact transitive dependency set of one bundle, world or template. Sorted; no duplicates. */
export interface DependencyClosure {
  readonly root: string;
  readonly assets: readonly AssetRef[];
  readonly definitions: readonly AssemblyDefinitionId[];
  readonly references: readonly AssetId[];
  readonly worlds: readonly WorldId[];
  readonly templates: readonly TemplateId[];
  /** Referenced ids that no loaded record satisfies (world, asset or definition). */
  readonly missing: readonly string[];
}

export interface DependencyIndex {
  readonly worldIds: readonly WorldId[];
  readonly templateIds: readonly TemplateId[];
  readonly bundleKeys: readonly string[];
  worldAssets(id: WorldId): readonly AssetRef[] | null;
  templateClosure(id: TemplateId): DependencyClosure | null;
  worldClosure(id: WorldId): DependencyClosure | null;
  bundleClosure(ref: ContentBundleRef): DependencyClosure | null;
  /** Assets and definitions an asset depends on transitively (through cited assembly definitions). */
  assetClosure(ref: AssetRef): DependencyClosure;
  dependents(id: AssetId): AssetDependents;
}

export function bundleKey(ref: ContentBundleRef): string {
  return `${ref.id}@${ref.version}`;
}

function worldAssetRefs(world: DeepReadonly<World>): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const marking of world.markings) refs.push(marking.asset);
  for (const support of world.supports) if (support.asset) refs.push(support.asset);
  for (const face of world.signFaces) refs.push(face.asset);
  for (const head of world.signalHeads) refs.push(head.asset);
  for (const actor of world.actors) if (actor.asset) refs.push(actor.asset);
  return dedupeRefs(refs);
}

function dedupeRefs(refs: readonly AssetRef[]): AssetRef[] {
  const seen = new Map<string, AssetRef>();
  for (const ref of refs) seen.set(refKey(ref), ref);
  return [...seen.values()].sort((a, b) => compareStrings(a.id, b.id) || a.version - b.version);
}

function sortedUnique<T extends string>(items: Iterable<T>): T[] {
  return [...new Set(items)].sort(compareStrings);
}

/**
 * Builds the forward and reverse dependency graph over the compiled registry and every loaded
 * world, template and bundle. Everything is computed eagerly from the inputs; the result is a
 * pure lookup structure.
 */
export function buildDependencyIndex(inputs: DependencyInputs): DependencyIndex {
  const { registry } = inputs;
  const worlds = new Map<WorldId, DeepReadonly<World>>();
  for (const world of inputs.worlds ?? []) worlds.set(world.id, world);
  const templates = new Map<TemplateId, Template>();
  for (const template of inputs.templates ?? []) templates.set(template.id, template);
  const bundles = new Map<string, ContentBundle>();
  for (const bundle of inputs.bundles ?? []) bundles.set(bundleKey(bundle), bundle);

  const assetsByKey = new Map<string, AssetRef>();
  const assetIds = new Set<AssetId>();
  for (const asset of registry.assets) {
    assetsByKey.set(refKey(asset), { id: asset.id, version: asset.version });
    assetIds.add(asset.id);
  }
  const referenceIds = new Set<AssetId>(registry.references.map((r) => r.id));
  const definitions = new Map<AssemblyDefinitionId, CompiledRegistry['assemblyDefinitions'][number]>();
  for (const definition of registry.assemblyDefinitions) definitions.set(definition.id, definition);

  /* Forward: asset → definitions → (reference assets | runtime assets | parent definitions). */
  const assetClosure = (ref: AssetRef): DependencyClosure => {
    const assets = new Map<string, AssetRef>();
    const defs = new Set<AssemblyDefinitionId>();
    const refs = new Set<AssetId>();
    const missing = new Set<string>();
    const visitDefinition = (id: AssemblyDefinitionId): void => {
      if (defs.has(id)) return;
      defs.add(id);
      const definition = definitions.get(id);
      if (!definition) {
        missing.add(id);
        return;
      }
      for (const sourceAsset of definition.sourceAssetIds) visitAssetId(sourceAsset);
      if (definition.inherits !== null) visitDefinition(definition.inherits);
    };
    const visitAssetId = (id: AssetId): void => {
      if (referenceIds.has(id)) {
        refs.add(id);
        return;
      }
      if (!assetIds.has(id)) {
        missing.add(id);
        return;
      }
      for (const candidate of registry.assets) {
        if (candidate.id === id) visitAsset({ id: candidate.id, version: candidate.version });
      }
    };
    const visitAsset = (target: AssetRef): void => {
      const key = refKey(target);
      if (assets.has(key)) return;
      if (!assetsByKey.has(key)) {
        if (referenceIds.has(target.id)) refs.add(target.id);
        else missing.add(key);
        return;
      }
      assets.set(key, target);
      for (const definitionId of registry.definitionCitations[target.id] ?? []) visitDefinition(definitionId);
    };
    visitAsset(ref);
    return {
      root: refKey(ref),
      assets: dedupeRefs([...assets.values()]),
      definitions: sortedUnique(defs),
      references: sortedUnique(refs),
      worlds: [],
      templates: [],
      missing: sortedUnique(missing),
    };
  };

  const mergeClosures = (root: string, parts: readonly DependencyClosure[], extra: { worlds?: Iterable<WorldId>; templates?: Iterable<TemplateId>; missing?: Iterable<string> } = {}): DependencyClosure => ({
    root,
    assets: dedupeRefs(parts.flatMap((p) => p.assets)),
    definitions: sortedUnique(parts.flatMap((p) => p.definitions)),
    references: sortedUnique(parts.flatMap((p) => p.references)),
    worlds: sortedUnique([...parts.flatMap((p) => p.worlds), ...(extra.worlds ?? [])]),
    templates: sortedUnique([...parts.flatMap((p) => p.templates), ...(extra.templates ?? [])]),
    missing: sortedUnique([...parts.flatMap((p) => p.missing), ...(extra.missing ?? [])]),
  });

  const worldClosure = (id: WorldId): DependencyClosure | null => {
    const world = worlds.get(id);
    if (!world) return null;
    return mergeClosures(id, worldAssetRefs(world).map(assetClosure), { worlds: [id] });
  };

  const templateClosure = (id: TemplateId): DependencyClosure | null => {
    const template = templates.get(id);
    if (!template) return null;
    const parts = template.requiredAssets.map(assetClosure);
    const missing: string[] = [];
    for (const worldId of template.fixtureWorldIds) {
      const closure = worldClosure(worldId);
      if (closure) parts.push(closure);
      else missing.push(worldId);
    }
    return mergeClosures(id, parts, { templates: [id], missing });
  };

  const bundleClosure = (ref: ContentBundleRef): DependencyClosure | null => {
    const bundle = bundles.get(bundleKey(ref));
    if (!bundle) return null;
    const parts: DependencyClosure[] = [];
    const missing: string[] = [];
    const worldIds = new Set<WorldId>(bundle.worldIds);
    for (const question of bundle.questions) worldIds.add(question.worldId);
    for (const comparison of bundle.comparisons) worldIds.add(comparison.baseWorldId);
    for (const worldId of sortedUnique(worldIds)) {
      const closure = worldClosure(worldId);
      if (closure) parts.push(closure);
      else missing.push(worldId);
    }
    for (const term of bundle.terms) for (const illustrated of term.illustratedBy) parts.push(assetClosure(illustrated));
    return mergeClosures(bundleKey(ref), parts, { missing });
  };

  /* Reverse index, built once. */
  const reverse = new Map<AssetId, { assets: Map<string, AssetRef>; definitions: Set<AssemblyDefinitionId>; worlds: Set<WorldId>; templates: Set<TemplateId>; questions: Set<QuestionId>; terms: Set<TermId>; bundles: Map<string, ContentBundleRef> }>();
  const entry = (id: AssetId) => {
    let value = reverse.get(id);
    if (!value) {
      value = { assets: new Map(), definitions: new Set(), worlds: new Set(), templates: new Set(), questions: new Set(), terms: new Set(), bundles: new Map() };
      reverse.set(id, value);
    }
    return value;
  };
  for (const definition of registry.assemblyDefinitions) {
    for (const sourceAsset of definition.sourceAssetIds) entry(sourceAsset).definitions.add(definition.id);
  }
  for (const asset of registry.assets) {
    const ref = { id: asset.id, version: asset.version };
    for (const dependency of assetClosure(ref).assets) {
      if (dependency.id !== asset.id) entry(dependency.id).assets.set(refKey(ref), ref);
    }
    for (const reference of assetClosure(ref).references) entry(reference).assets.set(refKey(ref), ref);
  }
  for (const world of worlds.values()) {
    const closure = worldClosure(world.id);
    if (!closure) continue;
    for (const ref of closure.assets) entry(ref.id).worlds.add(world.id);
    for (const reference of closure.references) entry(reference).worlds.add(world.id);
  }
  for (const template of templates.values()) {
    const closure = templateClosure(template.id);
    if (!closure) continue;
    for (const ref of closure.assets) entry(ref.id).templates.add(template.id);
    for (const reference of closure.references) entry(reference).templates.add(template.id);
  }
  for (const bundle of bundles.values()) {
    const bundleRef: ContentBundleRef = { id: bundle.id, version: bundle.version };
    const closure = bundleClosure(bundleRef);
    if (!closure) continue;
    for (const ref of closure.assets) entry(ref.id).bundles.set(bundleKey(bundleRef), bundleRef);
    for (const reference of closure.references) entry(reference).bundles.set(bundleKey(bundleRef), bundleRef);
    for (const question of bundle.questions) {
      const questionClosure = worldClosure(question.worldId);
      if (!questionClosure) continue;
      for (const ref of questionClosure.assets) entry(ref.id).questions.add(question.id);
      for (const reference of questionClosure.references) entry(reference).questions.add(question.id);
    }
    for (const term of bundle.terms) {
      for (const illustrated of term.illustratedBy) {
        for (const ref of assetClosure(illustrated).assets) entry(ref.id).terms.add(term.id);
      }
    }
  }

  const dependents = (id: AssetId): AssetDependents => {
    const value = reverse.get(id);
    return {
      id,
      assets: value ? dedupeRefs([...value.assets.values()]) : [],
      definitions: value ? sortedUnique(value.definitions) : [],
      worlds: value ? sortedUnique(value.worlds) : [],
      templates: value ? sortedUnique(value.templates) : [],
      questions: value ? sortedUnique(value.questions) : [],
      terms: value ? sortedUnique(value.terms) : [],
      bundles: value ? [...value.bundles.values()].sort((a, b) => compareStrings(bundleKey(a), bundleKey(b))) : [],
    };
  };

  return {
    worldIds: sortedUnique(worlds.keys()),
    templateIds: sortedUnique(templates.keys()),
    bundleKeys: sortedUnique(bundles.keys()),
    worldAssets: (id) => {
      const world = worlds.get(id);
      return world ? worldAssetRefs(world) : null;
    },
    templateClosure,
    worldClosure,
    bundleClosure,
    assetClosure,
    dependents,
  };
}
