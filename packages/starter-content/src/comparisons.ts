import {
  type AspectStateEntry,
  type AssetDefinition,
  type AssetResolver,
  type DeepReadonly,
  type Marking,
  type MovementPriority,
  type SignFace,
  type SourceLocator,
  type World,
  assetId,
  entityId,
  freezeDeep,
  worldId as makeWorldId,
} from '@ottie/contracts';
import { computeCanonicalHash } from '@ottie/scenario-core';
import { z } from 'zod';
import { type AuthoredComparison } from './packages';

const replaceControlDelta = z
  .object({
    replaceMarking: z
      .object({ id: z.string().min(1), withAssetId: z.string().min(1), role: z.enum(['give_way_line', 'stop_line']) })
      .strict(),
    replaceSignFace: z.object({ id: z.string().min(1), withAssetId: z.string().min(1) }).strict(),
  })
  .strict();

const changeSignalStateDelta = z
  .object({
    aspectStates: z
      .array(z.object({ headId: z.string().min(1), slot: z.string().min(1), state: z.enum(['lit', 'dark', 'flashing']) }).strict())
      .min(1)
      .readonly(),
  })
  .strict();

/**
 * Applies an authored comparison delta to a base world and returns a NEW frozen world. The base
 * world is never touched: comparison/replay always renders a separate immutable world so the
 * current question, attempt and answer cannot change (`state_invariance`).
 *
 * Only deltas whose semantic consequences are fully known are applied here:
 *  - `replace_control`: swaps the control marking + sign face, flips the control regime and the
 *    priority of the movements the control governs (`yield` <-> `stop_then_yield`), and re-cites
 *    the replacement assets' own source locators. Nothing else in the junction moves.
 *  - `change_signal_state`: rewrites the listed aspect states on the controller. Movement
 *    permissions are NOT re-derived here, so the caller MUST run V1 (`signal_movements`) on the
 *    result and refuse to show it when the phase is unsupported or inconsistent.
 *  - `swap_actor_class`: not applied here; T1 already pins a generated world for it.
 *
 * Every result is a candidate: `applyComparison` never claims validity. Callers validate.
 */
export type ComparisonApplication =
  | { readonly ok: true; readonly world: DeepReadonly<World>; readonly notes: readonly string[] }
  | { readonly ok: false; readonly reason: ComparisonRefusalReason; readonly detail: string };

export type ComparisonRefusalReason =
  | 'unsupported_delta'
  | 'entity_missing'
  | 'asset_unresolved'
  | 'asset_role_mismatch'
  | 'no_source_locators';

const PRIORITY_FOR_ROLE: Partial<Record<Marking['role'], MovementPriority>> = {
  give_way_line: 'yield',
  stop_line: 'stop_then_yield',
};

const REGIME_FOR_ROLE: Partial<Record<Marking['role'], World['controlRegime']>> = {
  give_way_line: 'give_way',
  stop_line: 'stop',
};

function locatorsOf(asset: AssetDefinition): readonly SourceLocator[] {
  const seen = new Set<string>();
  const out: SourceLocator[] = [];
  for (const locator of [...asset.provenance.geometrySources, ...asset.provenance.meaningSources]) {
    const key = JSON.stringify(locator);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(locator);
  }
  return out;
}

function derivedId(base: DeepReadonly<World>, comparison: AuthoredComparison): World['id'] {
  const suffix = comparison.id.replace(/^cmp\./, '').replace(/[^a-z0-9._-]/g, '-');
  return makeWorldId(`${base.id}.cmp.${suffix}`);
}

function finish(
  base: DeepReadonly<World>,
  comparison: AuthoredComparison,
  body: Omit<World, 'id' | 'provenance'>,
  notes: readonly string[],
): ComparisonApplication {
  const withoutHash: World = {
    ...body,
    id: derivedId(base, comparison),
    provenance: {
      ...base.provenance,
      parameters: { ...base.provenance.parameters, comparisonId: comparison.id, comparisonKind: comparison.kind, baseWorldId: base.id },
      canonicalHash: null,
      notes: [
        ...base.provenance.notes,
        `Derived comparison world: ${comparison.kind} '${comparison.id}' applied to ${base.id} (base canonical hash ${base.provenance.canonicalHash ?? 'null'}). ${comparison.generationNote ?? ''}`.trim(),
        ...notes,
      ],
    },
  };
  const world: World = {
    ...withoutHash,
    provenance: { ...withoutHash.provenance, canonicalHash: computeCanonicalHash(withoutHash) },
  };
  return { ok: true, world: freezeDeep(world), notes };
}

export function applyComparison(
  base: DeepReadonly<World>,
  comparison: AuthoredComparison,
  assets: AssetResolver,
): ComparisonApplication {
  if (comparison.kind === 'replace_control') {
    const parsed = replaceControlDelta.safeParse(comparison.delta);
    if (!parsed.success) return { ok: false, reason: 'unsupported_delta', detail: `replace_control delta malformed: ${parsed.error.message}` };
    const delta = parsed.data;
    const marking = base.markings.find((m) => m.id === delta.replaceMarking.id);
    const face = base.signFaces.find((f) => f.id === delta.replaceSignFace.id);
    if (!marking) return { ok: false, reason: 'entity_missing', detail: `marking ${delta.replaceMarking.id} is not in ${base.id}` };
    if (!face) return { ok: false, reason: 'entity_missing', detail: `sign face ${delta.replaceSignFace.id} is not in ${base.id}` };

    const markingRes = assets.resolve({ id: assetId(delta.replaceMarking.withAssetId), version: marking.asset.version });
    const faceRes = assets.resolve({ id: assetId(delta.replaceSignFace.withAssetId), version: face.asset.version });
    if (!markingRes.ok) return { ok: false, reason: 'asset_unresolved', detail: `${delta.replaceMarking.withAssetId}: ${markingRes.reason} (${markingRes.detail})` };
    if (!faceRes.ok) return { ok: false, reason: 'asset_unresolved', detail: `${delta.replaceSignFace.withAssetId}: ${faceRes.reason} (${faceRes.detail})` };
    if (markingRes.asset.role !== delta.replaceMarking.role) {
      return { ok: false, reason: 'asset_role_mismatch', detail: `${markingRes.asset.id} is a ${markingRes.asset.role}, delta asks for ${delta.replaceMarking.role}` };
    }
    const priority = PRIORITY_FOR_ROLE[delta.replaceMarking.role];
    const regime = REGIME_FOR_ROLE[delta.replaceMarking.role];
    if (!priority || !regime) {
      return { ok: false, reason: 'unsupported_delta', detail: `replace_control only knows give_way_line/stop_line, not ${delta.replaceMarking.role}` };
    }
    const markingSources = locatorsOf(markingRes.asset);
    const faceSources = locatorsOf(faceRes.asset);
    if (markingSources.length === 0 || faceSources.length === 0) {
      return { ok: false, reason: 'no_source_locators', detail: 'replacement asset carries no geometry/meaning source locators to cite' };
    }
    const governed = new Set<string>(marking.applicableMovementIds);
    const newMarking: Marking = {
      ...marking,
      role: delta.replaceMarking.role,
      asset: { id: markingRes.asset.id, version: markingRes.asset.version },
      sourceRefs: markingSources,
    };
    const newFace: SignFace = {
      ...face,
      asset: { id: faceRes.asset.id, version: faceRes.asset.version },
      sourceRefs: faceSources,
    };
    const body: Omit<World, 'id' | 'provenance'> = {
      ...base,
      controlRegime: regime,
      movements: base.movements.map((m) => (governed.has(m.id) ? { ...m, priority } : m)),
      markings: base.markings.map((m) => (m.id === marking.id ? newMarking : m)),
      signFaces: base.signFaces.map((f) => (f.id === face.id ? newFace : f)),
    };
    return finish(base, comparison, body, [
      `Control swapped to ${regime}: movements ${[...governed].join(', ')} now ${priority}; sign/marking cite the replacement assets' own locators.`,
    ]);
  }

  if (comparison.kind === 'change_signal_state') {
    const parsed = changeSignalStateDelta.safeParse(comparison.delta);
    if (!parsed.success) return { ok: false, reason: 'unsupported_delta', detail: `change_signal_state delta malformed: ${parsed.error.message}` };
    const delta = parsed.data;
    for (const entry of delta.aspectStates) {
      const head = base.signalHeads.find((h) => h.id === entry.headId);
      if (!head) return { ok: false, reason: 'entity_missing', detail: `signal head ${entry.headId} is not in ${base.id}` };
      if (!head.aspects.some((a) => a.slot === entry.slot)) {
        return { ok: false, reason: 'entity_missing', detail: `head ${entry.headId} has no aspect slot ${entry.slot}` };
      }
    }
    const overrides = new Map<string, AspectStateEntry>();
    for (const entry of delta.aspectStates) {
      overrides.set(`${entry.headId}\u0000${entry.slot}`, { headId: entityId(entry.headId), slot: entry.slot, state: entry.state });
    }
    const body: Omit<World, 'id' | 'provenance'> = {
      ...base,
      signalControllers: base.signalControllers.map((controller) => ({
        ...controller,
        aspectStates: controller.aspectStates.map((state) => overrides.get(`${state.headId}\u0000${state.slot}`) ?? state),
      })),
    };
    return finish(base, comparison, body, [
      'Aspect states rewritten from the authored delta; movement permissions are the base controller’s and must be re-checked by V1 signal_movements before display.',
    ]);
  }

  return { ok: false, reason: 'unsupported_delta', detail: `${comparison.kind} is not applied by the comparison applier (use the pinned generated world)` };
}

/** Validation-independent description of which delta kinds `applyComparison` can build. */
export function comparisonIsApplicable(comparison: AuthoredComparison): boolean {
  return comparison.kind === 'replace_control' || comparison.kind === 'change_signal_state';
}
