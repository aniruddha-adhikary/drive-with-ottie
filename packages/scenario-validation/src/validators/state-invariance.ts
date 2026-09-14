import { type DeepReadonly, type Diagnostic, type World, canonicalJson } from '@ottie/contracts';
import { verifyCanonicalHash } from '@ottie/scenario-core';
import { Collector, type SemanticValidator } from '../world-index';

type SemanticKey = Exclude<keyof World, 'cameraPresets'>;

type InvarianceCategory =
  | 'identity'
  | 'geometry'
  | 'traffic'
  | 'answer_bearing'
  | 'asset_transform'
  | 'seed_and_provenance';

const CATEGORY_OF: Readonly<Record<SemanticKey, InvarianceCategory>> = {
  id: 'identity',
  schemaVersion: 'identity',
  conventions: 'identity',
  controlRegime: 'answer_bearing',
  roads: 'geometry',
  lanes: 'geometry',
  movements: 'answer_bearing',
  anchors: 'geometry',
  markings: 'asset_transform',
  supports: 'asset_transform',
  signFaces: 'asset_transform',
  signalHeads: 'asset_transform',
  signalControllers: 'traffic',
  actors: 'traffic',
  conditions: 'traffic',
  depictedViolations: 'answer_bearing',
  evidence: 'answer_bearing',
  provenance: 'seed_and_provenance',
};

const SEMANTIC_KEYS = Object.keys(CATEGORY_OF) as readonly SemanticKey[];

/**
 * Single-world half: the world is deeply frozen and its canonical hash (when it carries one) still
 * matches its content, so nothing downstream can have edited it in place.
 */
export const stateInvariance: SemanticValidator = {
  name: 'state_invariance',
  run(index) {
    const out = new Collector('state_invariance');
    const path = findUnfrozen(index.world, 'world', new Set());
    if (path) {
      out.error({
        code: 'world_not_frozen',
        message: `world ${index.world.id} is mutable at ${path}; semantic worlds must be deep-frozen`,
        entityIds: [index.world.id],
        data: { path },
      });
    }
    if (index.world.provenance.canonicalHash !== null && !verifyCanonicalHash(index.world)) {
      out.error({
        code: 'canonical_hash_mismatch',
        message: `world ${index.world.id} content no longer matches provenance.canonicalHash; it was edited after generation`,
        entityIds: [index.world.id],
      });
    }
    for (const camera of index.world.cameraPresets) {
      if (camera.linkedEntityId !== null && !index.kinds.has(camera.linkedEntityId)) {
        out.error({
          code: 'camera_references_missing_entity',
          message: `camera '${camera.name}' is linked to ${camera.linkedEntityId}, which is not in the world`,
          entityIds: [camera.linkedEntityId],
        });
      }
    }
    return out.diagnostics;
  },
};

/**
 * Pair half: `candidate` is the same world after a presentation change (camera moved, view chosen,
 * re-rendered). Every field other than `cameraPresets` must be canonically identical; a difference
 * is reported per field with the category of state that leaked.
 */
export function checkStateInvariance(
  base: DeepReadonly<World>,
  candidate: DeepReadonly<World>,
): readonly Diagnostic[] {
  const out = new Collector('state_invariance');
  for (const key of SEMANTIC_KEYS) {
    const before = canonicalJson(base[key]);
    const after = canonicalJson(candidate[key]);
    if (before === after) continue;
    out.error({
      code: 'non_presentation_field_changed',
      message: `presentation change altered '${key}' (${CATEGORY_OF[key]} state) of world ${base.id}`,
      entityIds: [base.id, ...changedIds(base[key], candidate[key])],
      data: { field: key, category: CATEGORY_OF[key] },
    });
  }
  if (canonicalJson(base.provenance.key) !== canonicalJson(candidate.provenance.key)) {
    out.error({
      code: 'seed_changed',
      message: `presentation change altered the reproducibility key (seed/template/registry hash) of world ${base.id}`,
      entityIds: [base.id],
    });
  }
  return out.diagnostics;
}

function changedIds(before: unknown, after: unknown): readonly string[] {
  if (!Array.isArray(before) || !Array.isArray(after)) return [];
  const byId = (items: readonly unknown[]) => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string')
        map.set(item.id, canonicalJson(item));
    }
    return map;
  };
  const b = byId(before);
  const a = byId(after);
  const ids = new Set<string>();
  for (const [id, json] of b) if (a.get(id) !== json) ids.add(id);
  for (const id of a.keys()) if (!b.has(id)) ids.add(id);
  return [...ids];
}

function findUnfrozen(value: unknown, path: string, seen: Set<object>): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (!Object.isFrozen(value)) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = findUnfrozen(value[i], `${path}[${String(i)}]`, seen);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    const found = findUnfrozen(nested, `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}
