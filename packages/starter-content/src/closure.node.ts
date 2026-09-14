/**
 * Node-only closure/pin maintenance for the starter content boundary. Not re-exported from the
 * package index so the browser bundle never pulls the extraction library or node:crypto; import via
 * `@ottie/starter-content/closure.node.js`.
 *
 * `computeStarterClosure` compiles the FULL extraction library through C1 (the same compile the
 * H1 review CLI uses), generates every authored world/comparison against that registry, and keeps
 * only the transitive C1 dependency closure of the assets those worlds, templates, comparison
 * deltas and glossary terms actually reference. `checkStarterPins` regenerates each pinned world
 * against the committed closure and reports the canonical hash it reproduces; `--write` rewrites
 * ONLY the pin fields (assetRegistryHash / canonicalHash) so every other authored field survives
 * verbatim and the diff is reviewable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type AssetDefinition, type AssetRef, type AssetResolver, type DeepReadonly, type Sha256, type World } from '@ottie/contracts';
import { type CompiledRegistry, buildDependencyIndex, compileRegistry, createRegistryResolver, curationFromDefinitions, refKey } from '@ottie/asset-registry';
import { computeRegistryHash } from '@ottie/asset-registry/hash.node.js';
import { loadExtractionLibrary } from '@ottie/asset-registry/library.node.js';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_TEMPLATES, EXTRACTED_DEVELOPMENT_ASSETS } from '@ottie/contracts/fixtures';
import { loadStarterContent } from '@ottie/scenario-validation';
import { type StarterClosure, closureHashOf, createClosureResolver, parseStarterClosure, projectClosure } from './closure';
import { createStarterGenerator } from './generator';
import { type StarterPackagePair, comparisonGenerationRequest, generationRequest, loadStarterPackages } from './packages';

export const STARTER_CLOSURE_PATH = 'content/registry/starter-closure.json';
export const CLOSURE_COMMAND = 'npm run review:export -- closure --write';
export const PINS_COMMAND = 'npm run review:export -- pins --write';

export interface CompiledStarterRegistry {
  readonly registry: CompiledRegistry;
  readonly registryHash: Sha256;
  readonly resolver: AssetResolver;
}

/** The exact C1 compile the review CLI has always used: manifests + F0 curation + schematic runtime assets. */
export function compileStarterRegistry(repoRoot: string): CompiledStarterRegistry {
  const registry = compileRegistry(loadExtractionLibrary(repoRoot), {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((asset) => asset.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);
  return { registry, registryHash, resolver: createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, registryHash) };
}

function worldRefs(world: DeepReadonly<World>): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const marking of world.markings) refs.push(marking.asset);
  for (const support of world.supports) if (support.asset) refs.push(support.asset);
  for (const face of world.signFaces) refs.push(face.asset);
  for (const head of world.signalHeads) refs.push(head.asset);
  for (const actor of world.actors) if (actor.asset) refs.push(actor.asset);
  return refs;
}

function deltaAssetIds(pkgs: readonly StarterPackagePair[]): string[] {
  const ids: string[] = [];
  for (const { scenario } of pkgs) {
    for (const comparison of scenario.comparisons) {
      for (const value of Object.values(comparison.delta)) {
        if (typeof value === 'object' && value !== null && 'withAssetId' in value && typeof value.withAssetId === 'string') ids.push(value.withAssetId);
      }
    }
  }
  return ids;
}

export interface ClosureComputation {
  readonly closure: StarterClosure;
  readonly compiled: CompiledStarterRegistry;
  /** Worlds that failed to generate against the full registry (closure roots then come from the rest). */
  readonly generationFailures: readonly { readonly worldId: string; readonly detail: string }[];
}

export function computeStarterClosure(repoRoot: string, packages: readonly StarterPackagePair[] = loadStarterPackages()): ClosureComputation {
  const compiled = compileStarterRegistry(repoRoot);
  const generator = createStarterGenerator(compiled.resolver);
  const generationFailures: { worldId: string; detail: string }[] = [];
  const roots = new Map<string, AssetRef>();
  const addRef = (ref: AssetRef): void => {
    roots.set(refKey(ref), ref);
  };

  for (const { scenario } of packages) {
    const requests = [
      ...scenario.worlds.map((w) => generationRequest(scenario, w)),
      ...scenario.comparisons.flatMap((c) => {
        const request = comparisonGenerationRequest(scenario, c);
        return request ? [request] : [];
      }),
    ];
    for (const request of requests) {
      const result = generator.generate(request);
      if (!result.ok) {
        generationFailures.push({ worldId: request.id, detail: result.diagnostics.map((d) => `${d.code}: ${d.message}`).join('; ') });
        continue;
      }
      for (const ref of worldRefs(result.world)) addRef(ref);
    }
    const template = DEVELOPMENT_TEMPLATES.find((t) => t.id === scenario.template.id && t.version === scenario.template.version);
    for (const ref of template?.requiredAssets ?? []) addRef(ref);
  }
  const byId = new Map<string, AssetDefinition[]>();
  for (const asset of compiled.registry.assets) byId.set(asset.id, [...(byId.get(asset.id) ?? []), asset]);
  for (const id of deltaAssetIds(packages)) for (const asset of byId.get(id) ?? []) addRef({ id: asset.id, version: asset.version });
  for (const term of loadStarterContent().terms) {
    for (const ref of term.illustratedBy) addRef(ref);
  }

  const index = buildDependencyIndex({ registry: compiled.registry });
  const closureKeys = new Set<string>();
  for (const ref of roots.values()) {
    closureKeys.add(refKey(ref));
    for (const dep of index.assetClosure(ref).assets) closureKeys.add(refKey(dep));
  }
  const closureAssets = compiled.registry.assets.filter((asset) => closureKeys.has(refKey(asset)));
  const projected = projectClosure(
    compiled.registry,
    compiled.registryHash,
    closureAssets,
    [...roots.values()].map((ref) => `${ref.id}@${ref.version}`),
    CLOSURE_COMMAND,
  );
  return { closure: parseStarterClosure(projected), compiled, generationFailures };
}

export function serialiseClosure(closure: StarterClosure): string {
  return `${JSON.stringify(closure, null, 2)}\n`;
}

export function readCommittedClosure(repoRoot: string): StarterClosure | null {
  try {
    return parseStarterClosure(JSON.parse(readFileSync(path.join(repoRoot, STARTER_CLOSURE_PATH), 'utf8')) as unknown);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export interface ClosureDrift {
  readonly committed: StarterClosure | null;
  readonly computed: StarterClosure;
  readonly upToDate: boolean;
}

export function checkStarterClosure(repoRoot: string): ClosureDrift & { readonly computation: ClosureComputation } {
  const computation = computeStarterClosure(repoRoot);
  const committed = readCommittedClosure(repoRoot);
  const upToDate =
    committed !== null &&
    committed.registryHash === computation.closure.registryHash &&
    committed.closureHash === closureHashOf(computation.closure.assets) &&
    JSON.stringify(committed.roots) === JSON.stringify(computation.closure.roots);
  return { committed, computed: computation.closure, upToDate, computation };
}

export function writeStarterClosure(repoRoot: string, closure: StarterClosure): string {
  const target = path.join(repoRoot, STARTER_CLOSURE_PATH);
  writeFileSync(target, serialiseClosure(closure), 'utf8');
  return target;
}

/* ------------------------------------------------------------------------------------------------
 * Pins
 * ---------------------------------------------------------------------------------------------- */

export interface PinCheck {
  readonly packageId: string;
  readonly file: string;
  readonly worldId: string;
  readonly kind: 'world' | 'comparison';
  readonly pinnedHash: Sha256;
  readonly actualHash: Sha256 | null;
  readonly generationError: string | null;
  readonly matches: boolean;
}

export interface PinReport {
  readonly registryHash: Sha256;
  readonly pinnedRegistryHashes: Readonly<Record<string, Sha256>>;
  readonly checks: readonly PinCheck[];
  readonly ok: boolean;
}

const PACKAGE_FILES: Readonly<Record<string, string>> = {
  'starter.give-way-t-junction': 'content/scenarios/starter/give-way-t-junction.json',
  'starter.stop-development-access': 'content/scenarios/starter/stop-development-access.json',
  'starter.signalised-crossroads-green-right-red': 'content/scenarios/starter/signalised-crossroads-green-right-red.json',
};

export function checkStarterPins(closure: StarterClosure, packages: readonly StarterPackagePair[] = loadStarterPackages()): PinReport {
  const generator = createStarterGenerator(createClosureResolver(closure));
  const checks: PinCheck[] = [];
  const pinnedRegistryHashes: Record<string, Sha256> = {};
  for (const { scenario } of packages) {
    pinnedRegistryHashes[scenario.id] = scenario.pins.assetRegistryHash;
    const file = PACKAGE_FILES[scenario.id] ?? `<unknown file for ${scenario.id}>`;
    const entries: { readonly worldId: string; readonly kind: PinCheck['kind']; readonly pinnedHash: Sha256; readonly request: ReturnType<typeof generationRequest> }[] = [
      ...scenario.worlds.map((w) => ({ worldId: w.worldId, kind: 'world' as const, pinnedHash: w.canonicalHash, request: generationRequest(scenario, w) })),
      ...scenario.comparisons.flatMap((c) => {
        const request = comparisonGenerationRequest(scenario, c);
        return request && c.generation ? [{ worldId: c.generation.worldId, kind: 'comparison' as const, pinnedHash: c.generation.canonicalHash, request }] : [];
      }),
    ];
    for (const entry of entries) {
      const result = generator.generate(entry.request);
      const actualHash = result.ok ? result.world.provenance.canonicalHash : null;
      checks.push({
        packageId: scenario.id,
        file,
        worldId: entry.worldId,
        kind: entry.kind,
        pinnedHash: entry.pinnedHash,
        actualHash,
        generationError: result.ok ? null : result.diagnostics.map((d) => `${d.code}: ${d.message}`).join('; '),
        matches: actualHash !== null && actualHash === entry.pinnedHash,
      });
    }
  }
  const registryOk = Object.values(pinnedRegistryHashes).every((hash) => hash === closure.registryHash);
  return { registryHash: closure.registryHash, pinnedRegistryHashes, checks, ok: registryOk && checks.every((c) => c.matches) };
}

/**
 * Rewrites pin fields in the committed package JSON from a pin report. Touches only
 * `pins.assetRegistryHash`, `worlds[].canonicalHash` and `comparisons[].generation.canonicalHash`;
 * refuses to write a package where any world failed to generate.
 */
export function writeStarterPins(repoRoot: string, report: PinReport): readonly string[] {
  const written: string[] = [];
  const byPackage = new Map<string, PinCheck[]>();
  for (const check of report.checks) byPackage.set(check.packageId, [...(byPackage.get(check.packageId) ?? []), check]);
  for (const [packageId, checks] of byPackage) {
    const failed = checks.filter((c) => c.actualHash === null);
    if (failed.length > 0) {
      throw new Error(`refusing to rewrite ${packageId}: ${failed.map((c) => `${c.worldId} (${c.generationError ?? 'no hash'})`).join(', ')} did not generate`);
    }
    const file = path.join(repoRoot, PACKAGE_FILES[packageId] ?? '');
    const raw = readFileSync(file, 'utf8');
    const doc = JSON.parse(raw) as {
      pins: { assetRegistryHash: string };
      worlds: { worldId: string; canonicalHash: string }[];
      comparisons: { generation: { worldId: string; canonicalHash: string } | null }[];
    };
    doc.pins.assetRegistryHash = report.registryHash;
    const hashFor = new Map<string, string>();
    for (const check of checks) if (check.actualHash) hashFor.set(check.worldId, check.actualHash);
    for (const world of doc.worlds) {
      const actual = hashFor.get(world.worldId);
      if (actual) world.canonicalHash = actual;
    }
    for (const comparison of doc.comparisons) {
      const actual = comparison.generation ? hashFor.get(comparison.generation.worldId) : undefined;
      if (comparison.generation && actual) comparison.generation.canonicalHash = actual;
    }
    const next = `${JSON.stringify(doc, null, 2)}\n`;
    if (next !== raw) {
      writeFileSync(file, next, 'utf8');
      written.push(file);
    }
  }
  return written;
}
