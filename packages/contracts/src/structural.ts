import { type Diagnostic, type Validator } from './diagnostic';
import { FROZEN_WORLD_CONVENTIONS } from './units';
import { WORLD_SCHEMA_VERSION } from './version';
import { type World, collectEntityIds } from './world';
import { type Question } from './content';

/**
 * Structural integrity only: IDs resolve, conventions match, no duplicate IDs, actual bindings hit
 * real entities. This is deliberately NOT the semantic validation V1 owns (topology, control
 * completeness, mounts, facing, signal movements, evidence). A world passing these checks can
 * still be wrong; a world failing them cannot be validated further.
 */
export const checkWorldStructure: Validator<World> = (world) => {
  const out: Diagnostic[] = [];
  const err = (code: string, message: string, entityIds: readonly string[] = []) => {
    out.push({ validator: 'structural_integrity', severity: 'error', code, message, entityIds });
  };

  if (world.schemaVersion !== WORLD_SCHEMA_VERSION) {
    err('structural_integrity.schema_version', `expected schemaVersion ${WORLD_SCHEMA_VERSION}, got ${world.schemaVersion}`);
  }
  if (JSON.stringify(world.conventions) !== JSON.stringify(FROZEN_WORLD_CONVENTIONS)) {
    err('structural_integrity.conventions', 'world conventions differ from FROZEN_WORLD_CONVENTIONS');
  }

  const seen = new Set<string>();
  const collections: readonly (readonly { readonly id: string }[])[] = [
    world.roads, world.lanes, world.movements, world.anchors, world.markings, world.supports,
    world.signFaces, world.signalHeads, world.signalControllers, world.actors, world.depictedViolations,
  ];
  for (const items of collections) {
    for (const item of items) {
      if (seen.has(item.id)) err('structural_integrity.duplicate_id', `duplicate entity id ${item.id}`, [item.id]);
      seen.add(item.id);
    }
  }

  const roadIds = new Set(world.roads.map((r) => r.id));
  const laneIds = new Set(world.lanes.map((l) => l.id));
  const movementIds = new Set(world.movements.map((m) => m.id));
  const anchorIds = new Set(world.anchors.map((a) => a.id));
  const supportIds = new Set(world.supports.map((s) => s.id));
  const headIds = new Set(world.signalHeads.map((h) => h.id));
  const controllerIds = new Set(world.signalControllers.map((c) => c.id));
  const evidenceIds = new Set(world.evidence.map((e) => e.id));
  const allIds = collectEntityIds(world);

  const requireIn = (set: ReadonlySet<string>, id: string, what: string, owner: string) => {
    if (!set.has(id)) err('structural_integrity.dangling_reference', `${owner} references unknown ${what} ${id}`, [owner, id]);
  };

  for (const lane of world.lanes) {
    requireIn(roadIds, lane.roadId, 'road', lane.id);
    if (lane.centreline.length < 2) err('structural_integrity.degenerate_polyline', `lane ${lane.id} needs ≥2 centreline points`, [lane.id]);
    for (const m of lane.outgoingMovementIds) requireIn(movementIds, m, 'movement', lane.id);
  }
  for (const movement of world.movements) {
    requireIn(laneIds, movement.fromLaneId, 'lane', movement.id);
    requireIn(laneIds, movement.toLaneId, 'lane', movement.id);
    for (const c of movement.conflictsWith) requireIn(movementIds, c, 'movement', movement.id);
    for (const y of movement.yieldsTo) {
      requireIn(movementIds, y, 'movement', movement.id);
      if (!movement.conflictsWith.includes(y)) {
        err('structural_integrity.yields_to_non_conflict', `${movement.id} yields to ${y} which is not in conflictsWith`, [movement.id, y]);
      }
    }
  }
  for (const anchor of world.anchors) {
    switch (anchor.kind) {
      case 'lane_boundary':
        requireIn(laneIds, anchor.laneId, 'lane', anchor.id);
        break;
      case 'control_line':
        for (const l of anchor.controlsLaneIds) requireIn(laneIds, l, 'lane', anchor.id);
        requireIn(roadIds, anchor.road.roadId, 'road', anchor.id);
        break;
      case 'movement_path':
        requireIn(movementIds, anchor.movementId, 'movement', anchor.id);
        break;
      case 'crossing_bound':
        for (const l of anchor.crossesLaneIds) requireIn(laneIds, l, 'lane', anchor.id);
        break;
      case 'roadside_edge':
        requireIn(roadIds, anchor.roadId, 'road', anchor.id);
        break;
      case 'support_base':
        requireIn(laneIds, anchor.roadsideOf.laneId, 'lane', anchor.id);
        requireIn(roadIds, anchor.road.roadId, 'road', anchor.id);
        break;
    }
  }
  for (const marking of world.markings) {
    requireIn(anchorIds, marking.anchorId, 'anchor', marking.id);
    for (const l of marking.applicableLaneIds) requireIn(laneIds, l, 'lane', marking.id);
    for (const m of marking.applicableMovementIds) requireIn(movementIds, m, 'movement', marking.id);
  }
  for (const support of world.supports) requireIn(anchorIds, support.baseAnchorId, 'anchor', support.id);
  for (const face of world.signFaces) {
    requireIn(supportIds, face.attachment.supportId, 'support', face.id);
    for (const l of face.applicableLaneIds) requireIn(laneIds, l, 'lane', face.id);
    for (const l of face.intendedApproach.laneIds) requireIn(laneIds, l, 'lane', face.id);
    for (const m of face.applicableMovementIds) requireIn(movementIds, m, 'movement', face.id);
    for (const a of face.linkedControlLineIds) requireIn(anchorIds, a, 'anchor', face.id);
  }
  for (const head of world.signalHeads) {
    requireIn(supportIds, head.attachment.supportId, 'support', head.id);
    requireIn(controllerIds, head.controllerId, 'signal controller', head.id);
    for (const l of head.applicableLaneIds) requireIn(laneIds, l, 'lane', head.id);
    for (const a of head.linkedControlLineIds) requireIn(anchorIds, a, 'anchor', head.id);
    for (const aspect of head.aspects) for (const m of aspect.controlsMovementIds) requireIn(movementIds, m, 'movement', head.id);
  }
  for (const controller of world.signalControllers) {
    for (const s of controller.aspectStates) {
      requireIn(headIds, s.headId, 'signal head', controller.id);
      const head = world.signalHeads.find((h) => h.id === s.headId);
      if (head && !head.aspects.some((a) => a.slot === s.slot)) {
        err('structural_integrity.unknown_aspect_slot', `${controller.id} sets unknown slot ${s.slot} on ${s.headId}`, [controller.id, s.headId]);
      }
    }
    for (const p of controller.movementPermissions) {
      requireIn(movementIds, p.movementId, 'movement', controller.id);
      for (const g of p.governedByAspects) requireIn(headIds, g.headId, 'signal head', controller.id);
    }
  }
  for (const actor of world.actors) {
    if (actor.laneId !== null) requireIn(laneIds, actor.laneId, 'lane', actor.id);
    if (actor.movementId !== null) requireIn(movementIds, actor.movementId, 'movement', actor.id);
  }
  for (const evidence of world.evidence) {
    for (const t of evidence.targetEntityIds) requireIn(allIds, t, 'entity', evidence.id);
    for (const c of evidence.coVisibleWith) requireIn(evidenceIds, c, 'evidence', evidence.id);
    for (const a of evidence.contextAnchorIds) requireIn(anchorIds, a, 'anchor', evidence.id);
  }
  for (const preset of world.cameraPresets) {
    for (const e of preset.evidenceIds) requireIn(evidenceIds, e, 'evidence', `camera:${preset.name}`);
    if (preset.linkedEntityId !== null) requireIn(allIds, preset.linkedEntityId, 'entity', `camera:${preset.name}`);
  }
  if (world.actors.filter((a) => a.isEgo).length !== 1) {
    err('structural_integrity.ego_count', 'exactly one ego actor is required');
  }
  return out;
};

/**
 * Structural check of a question against its world: actual bindings must resolve to real entities
 * and evidence, hypothetical bindings must NOT name a world entity, exactly one correct option.
 * Semantic correctness of the answer is V1/T1 work.
 */
export function checkQuestionStructure(question: Question, world: World): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (code: string, message: string, entityIds: readonly string[] = []) => {
    out.push({ validator: 'structural_integrity', severity: 'error', code, message, entityIds });
  };
  if (question.worldId !== world.id) err('structural_integrity.world_mismatch', `question ${question.id} targets ${question.worldId}, given ${world.id}`, [question.id]);
  const entityIds = collectEntityIds(world);
  const evidenceIds = new Set(world.evidence.map((e) => e.id));
  const bindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)];
  for (const binding of bindings) {
    if (binding.role === 'actual') {
      if (!entityIds.has(binding.entityId)) err('structural_integrity.actual_binding_unbound', `"${binding.text}" is bound to missing entity ${binding.entityId}`, [question.id, binding.entityId]);
      for (const e of binding.evidenceIds) if (!evidenceIds.has(e)) err('structural_integrity.actual_binding_no_evidence', `"${binding.text}" requires unknown evidence ${e}`, [question.id]);
    } else if (binding.role === 'hypothetical' && binding.termId !== null && entityIds.has(binding.termId)) {
      err('structural_integrity.hypothetical_names_entity', `hypothetical "${binding.text}" names a real entity ${binding.termId}`, [question.id]);
    }
  }
  for (const e of question.requiredEvidenceIds) if (!evidenceIds.has(e)) err('structural_integrity.required_evidence_missing', `question requires unknown evidence ${e}`, [question.id]);
  if (question.options.filter((o) => o.correct).length !== 1) err('structural_integrity.correct_option_count', 'exactly one correct option required', [question.id]);
  if (new Set(question.options.map((o) => o.id)).size !== 4) err('structural_integrity.option_ids', 'four distinct option ids required', [question.id]);
  return out;
}
