import {
  type Actor,
  type AnchorOfKind,
  type Diagnostic,
  type EvidenceRequirement,
  type Movement,
  type Question,
  type Term,
  type TermBinding,
} from '@ottie/contracts';
import { POSITION_TOLERANCE_M, distanceToPolyline } from '../geometry';
import {
  Collector,
  type EntityKind,
  type RO,
  type SemanticValidator,
  type WorldIndex,
} from '../world-index';

const DETAIL_TARGET_KINDS: Readonly<
  Record<EvidenceRequirement['requiredDetail'], readonly EntityKind[] | null>
> = {
  presence: null,
  readable_face: ['sign_face', 'signal_head'],
  lane_association: ['actor', 'lane', 'movement'],
  aspect_state: ['signal_head'],
  relative_position: ['actor', 'marking', 'anchor', 'movement', 'lane'],
  row_count: ['marking'],
};

/**
 * Evidence is the bridge between the world and what a learner is asked. Every requirement must
 * point at real entities of a kind its detail can be read from, and the fact it claims must hold:
 * an actor said to be before a line has its FRONT upstream of that line, a lane association names
 * the lane the actor is actually on, a "who has priority" pair really yields one way. The
 * question-level check (`checkQuestionEvidence`) then ties stem/option bindings to those facts and
 * keeps actual and hypothetical bindings apart.
 */
export const questionEvidence: SemanticValidator = {
  name: 'question_evidence',
  run(index) {
    const out = new Collector('question_evidence');
    for (const evidence of index.world.evidence) checkEvidence(out, index, evidence);
    for (const violation of index.world.depictedViolations) {
      if (!index.actors.has(violation.actorId)) {
        out.error({
          code: 'violation_actor_missing',
          message: `depicted violation ${violation.id} names unknown actor ${violation.actorId}`,
          entityIds: [violation.id, violation.actorId],
        });
      }
      for (const evidenceId of violation.evidenceIds) {
        if (!index.evidence.has(evidenceId)) {
          out.error({
            code: 'required_evidence_missing',
            message: `depicted violation ${violation.id} cites unknown evidence ${evidenceId}`,
            entityIds: [violation.id],
          });
        }
      }
      if (!index.ctx.rules.some((r) => r.id === violation.ruleId)) {
        out.error({
          code: 'rule_unknown',
          message: `depicted violation ${violation.id} cites rule ${violation.ruleId}, which no source-backed rule set contains`,
          entityIds: [violation.id],
        });
      }
    }
    return out.diagnostics;
  },
};

function checkEvidence(out: Collector, index: WorldIndex, evidence: RO<EvidenceRequirement>): void {
  if (evidence.targetEntityIds.length === 0) {
    out.error({
      code: 'target_missing',
      message: `evidence ${evidence.id} has no target`,
      entityIds: [evidence.id],
    });
  }
  const kinds: EntityKind[] = [];
  for (const targetId of evidence.targetEntityIds) {
    const kind = index.kinds.get(targetId);
    if (!kind) {
      out.error({
        code: 'target_missing',
        message: `evidence ${evidence.id} targets ${targetId}, which is not in the world`,
        entityIds: [evidence.id, targetId],
      });
      continue;
    }
    kinds.push(kind);
    const allowed = DETAIL_TARGET_KINDS[evidence.requiredDetail];
    if (allowed && !allowed.includes(kind)) {
      out.error({
        code: 'detail_not_readable_from_target',
        message: `evidence ${evidence.id} asks for ${evidence.requiredDetail} of ${targetId}, a ${kind}`,
        entityIds: [evidence.id, targetId],
      });
    }
  }
  for (const anchorId of evidence.contextAnchorIds) {
    if (!index.anchors.has(anchorId)) {
      out.error({
        code: 'context_anchor_missing',
        message: `evidence ${evidence.id} cites unknown context anchor ${anchorId}`,
        entityIds: [evidence.id, anchorId],
      });
    }
  }
  for (const otherId of evidence.coVisibleWith) {
    if (otherId === evidence.id) {
      out.error({
        code: 'co_visible_with_self',
        message: `evidence ${evidence.id} lists itself as co-visible`,
        entityIds: [evidence.id],
      });
    } else if (!index.evidence.has(otherId)) {
      out.error({
        code: 'co_visible_evidence_missing',
        message: `evidence ${evidence.id} must be co-visible with unknown evidence ${otherId}`,
        entityIds: [evidence.id],
      });
    }
  }
  if (kinds.length !== evidence.targetEntityIds.length) return;

  switch (evidence.requiredDetail) {
    case 'relative_position':
      checkRelativePosition(out, index, evidence);
      break;
    case 'lane_association':
      checkLaneAssociation(out, index, evidence);
      break;
    case 'row_count': {
      for (const targetId of evidence.targetEntityIds) {
        const marking = index.markings.get(targetId);
        const asset = marking ? index.asset(marking.asset) : null;
        if (asset && asset.geometry.kind !== 'marking') {
          out.error({
            code: 'row_count_unreadable',
            message: `evidence ${evidence.id} asks for a row count of ${targetId}, whose asset has no marking profile`,
            entityIds: [evidence.id, targetId],
          });
        }
      }
      break;
    }
    case 'aspect_state': {
      for (const targetId of evidence.targetEntityIds) {
        const head = index.signalHeads.get(targetId);
        if (head && !index.controllers.has(head.controllerId)) {
          out.error({
            code: 'aspect_state_unavailable',
            message: `evidence ${evidence.id} asks for the aspect state of ${targetId}, which has no controller`,
            entityIds: [evidence.id, targetId],
          });
        }
      }
      break;
    }
    case 'presence':
    case 'readable_face':
      break;
  }
}

function checkLaneAssociation(
  out: Collector,
  index: WorldIndex,
  evidence: RO<EvidenceRequirement>,
): void {
  const actors = evidence.targetEntityIds
    .filter((id) => index.actors.has(id))
    .map((id) => index.actors.get(id))
    .filter((a): a is RO<Actor> => a !== undefined);
  const laneIds = evidence.targetEntityIds.filter((id) => index.lanes.has(id));
  const movementIds = evidence.targetEntityIds.filter((id) => index.movements.has(id));
  if (actors.length === 0 || (laneIds.length === 0 && movementIds.length === 0)) {
    out.error({
      code: 'lane_association_incomplete',
      message: `evidence ${evidence.id} needs an actor and the lane or movement it is associated with`,
      entityIds: [evidence.id],
    });
    return;
  }
  for (const actor of actors) {
    for (const laneId of laneIds) {
      if (actor.laneId !== laneId) {
        out.error({
          code: 'lane_association_contradicted',
          message: `evidence ${evidence.id} associates ${actor.id} with lane ${laneId}, but the actor is on ${String(actor.laneId)}`,
          entityIds: [evidence.id, actor.id, laneId],
        });
      }
    }
    for (const movementId of movementIds) {
      if (actor.movementId !== movementId) {
        out.error({
          code: 'lane_association_contradicted',
          message: `evidence ${evidence.id} associates ${actor.id} with movement ${movementId}, but the actor performs ${String(actor.movementId)}`,
          entityIds: [evidence.id, actor.id, movementId],
        });
      }
    }
  }
}

function checkRelativePosition(
  out: Collector,
  index: WorldIndex,
  evidence: RO<EvidenceRequirement>,
): void {
  const actors = evidence.targetEntityIds
    .map((id) => index.actors.get(id))
    .filter((a): a is RO<Actor> => a !== undefined);
  const lines = evidence.targetEntityIds
    .map((id) => controlLineFor(index, id))
    .filter((l): l is RO<AnchorOfKind<'control_line'>> => l !== null);
  const movements = evidence.targetEntityIds
    .map((id) => index.movements.get(id))
    .filter((m): m is RO<Movement> => m !== undefined);
  const laneIds = evidence.targetEntityIds.filter((id) => index.lanes.has(id));

  for (const actor of actors) {
    if (actor.laneId === null) {
      out.error({
        code: 'relative_position_unreadable',
        message: `evidence ${evidence.id} positions ${actor.id}, which is on no lane`,
        entityIds: [evidence.id, actor.id],
      });
      continue;
    }
    const lane = index.lanes.get(actor.laneId);
    if (!lane) continue;
    const lateral = distanceToPolyline(actor.pose.position, lane.centreline);
    if (
      lateral &&
      Math.abs(lateral.distance - Math.abs(actor.lateralOffsetM)) > POSITION_TOLERANCE_M
    ) {
      out.error({
        code: 'actor_pose_off_lane',
        message: `${actor.id} pose is ${lateral.distance.toFixed(2)} m from lane ${lane.id} centreline but declares a lateral offset of ${String(actor.lateralOffsetM)} m`,
        entityIds: [evidence.id, actor.id, lane.id],
      });
    }
    if (lateral && Math.abs(lateral.station - actor.progressM) > POSITION_TOLERANCE_M) {
      out.error({
        code: 'actor_pose_off_lane',
        message: `${actor.id} pose sits ${lateral.station.toFixed(2)} m along lane ${lane.id} but declares progress ${String(actor.progressM)} m`,
        entityIds: [evidence.id, actor.id, lane.id],
      });
    }
    for (const line of lines) {
      if (!line.controlsLaneIds.includes(lane.id)) {
        out.error({
          code: 'relative_position_unreadable',
          message: `evidence ${evidence.id} relates ${actor.id} to control line ${line.id}, which does not control the actor's lane ${lane.id}`,
          entityIds: [evidence.id, actor.id, line.id],
        });
        continue;
      }
      const linePoint = line.polyline[0];
      const station = linePoint ? distanceToPolyline(linePoint, lane.centreline) : null;
      if (!station) continue;
      const frontStation = actor.progressM + actor.frontOffsetM;
      if (frontStation > station.station + POSITION_TOLERANCE_M) {
        out.error({
          code: 'relative_position_contradicted',
          message: `${actor.id} front is ${(frontStation - station.station).toFixed(2)} m beyond control line ${line.id}; the evidence claims it is before the line`,
          entityIds: [evidence.id, actor.id, line.id],
          data: { frontStationM: frontStation, lineStationM: station.station },
        });
      }
    }
    for (const laneId of laneIds) {
      if (actor.laneId !== laneId) {
        out.error({
          code: 'relative_position_contradicted',
          message: `evidence ${evidence.id} places ${actor.id} on lane ${laneId}, but the actor is on ${lane.id}`,
          entityIds: [evidence.id, actor.id, laneId],
        });
      }
    }
  }

  const [a, b] = movements;
  if (movements.length === 2 && a && b) {
    const aYields = a.yieldsTo.includes(b.id);
    const bYields = b.yieldsTo.includes(a.id);
    if (!a.conflictsWith.includes(b.id) && !b.conflictsWith.includes(a.id)) {
      out.error({
        code: 'priority_evidence_without_conflict',
        message: `evidence ${evidence.id} claims a priority relation between movements ${a.id} and ${b.id}, which do not conflict; there is nothing to give way to`,
        entityIds: [evidence.id, a.id, b.id],
      });
    } else if (aYields === bYields) {
      out.error({
        code: 'relative_position_contradicted',
        message: `evidence ${evidence.id} claims a priority relation between ${a.id} and ${b.id}, but ${aYields ? 'both yield' : 'neither yields'}`,
        entityIds: [evidence.id, a.id, b.id],
      });
    }
  } else if (movements.length > 2) {
    out.error({
      code: 'relative_position_unreadable',
      message: `evidence ${evidence.id} compares more than two movements`,
      entityIds: [evidence.id, ...movements.map((m) => m.id)],
    });
  }
  if (actors.length === 0 && movements.length === 0) {
    out.error({
      code: 'relative_position_unreadable',
      message: `evidence ${evidence.id} has no actor or movement pair to position`,
      entityIds: [evidence.id],
    });
  }
}

function controlLineFor(index: WorldIndex, id: string): RO<AnchorOfKind<'control_line'>> | null {
  const direct = index.anchorOfKind(id, 'control_line');
  if (direct) return direct;
  const marking = index.markings.get(id);
  return marking ? index.anchorOfKind(marking.anchorId, 'control_line') : null;
}

/* ------------------------------------------------------------------------------------------------
 * Question-level check
 * ---------------------------------------------------------------------------------------------- */

export function checkQuestionEvidence(
  index: WorldIndex,
  question: RO<Question>,
): readonly Diagnostic[] {
  const out = new Collector('question_evidence');
  const release = index.ctx.target === 'learner_release';
  if (question.worldId !== index.world.id) {
    out.error({
      code: 'world_mismatch',
      message: `question ${question.id} targets world ${question.worldId}, validated against ${index.world.id}`,
      entityIds: [question.id],
    });
  }
  const terms = new Map(index.ctx.terms.map((t) => [t.id, t] as const));
  const placedAssetIds = new Set(index.placedAssetRefs().map((p) => p.ref.id));

  for (const evidenceId of question.requiredEvidenceIds) {
    if (!index.evidence.has(evidenceId)) {
      out.error({
        code: 'required_evidence_missing',
        message: `question ${question.id} requires evidence ${evidenceId}, which the world does not declare`,
        entityIds: [question.id],
      });
    }
  }
  if (question.requiredEvidenceIds.length === 0) {
    out.error({
      code: 'required_evidence_missing',
      message: `question ${question.id} requires no evidence at all; it cannot be answered from the scene`,
      entityIds: [question.id],
    });
  }

  const bindings: { readonly where: string; readonly binding: RO<TermBinding> }[] = [
    ...question.stemBindings.map((binding) => ({ where: 'stem', binding })),
    ...question.options.flatMap((option) =>
      option.bindings.map((binding) => ({ where: `option ${option.id}`, binding })),
    ),
  ];
  for (const { where, binding } of bindings)
    checkBinding(out, index, question.id, where, binding, terms, placedAssetIds);

  const correct = question.options.filter((o) => o.correct);
  if (correct.length !== 1) {
    out.error({
      code: 'correct_option_count',
      message: `question ${question.id} has ${correct.length} correct options`,
      entityIds: [question.id],
    });
  }
  for (const option of correct) {
    if (option.bindings.some((b) => b.role === 'hypothetical')) {
      out.error({
        code: 'correct_option_hypothetical',
        message: `correct option ${option.id} of ${question.id} rests on a hypothetical binding`,
        entityIds: [question.id],
      });
    }
  }

  const rule = index.ctx.rules.find((r) => r.id === question.answerRule.ruleId);
  if (!rule) {
    out.error({
      code: 'answer_rule_unknown',
      message: `question ${question.id} is answered by rule ${question.answerRule.ruleId}, which no source-backed rule set contains`,
      entityIds: [question.id],
    });
  } else {
    if (rule.version !== question.answerRule.version) {
      const input = {
        code: 'answer_rule_version_mismatch',
        message: `question ${question.id} cites ${rule.id} v${String(question.answerRule.version)} but the source-backed rule is v${String(rule.version)}`,
        entityIds: [question.id],
        data: { cited: question.answerRule.version, current: rule.version },
      };
      if (release) out.error(input);
      else out.warning(input);
    }
    if (rule.unresolved.length > 0) {
      const input = {
        code: 'answer_rule_unresolved',
        message: `rule ${rule.id} carries ${rule.unresolved.length} unresolved source note(s)`,
        entityIds: [question.id],
        sourceRefs: rule.sourceRefs,
        data: { unresolved: rule.unresolved },
      };
      if (release) out.error(input);
      else out.info(input);
    }
  }
  if (release && question.reviewStatus !== 'reviewed') {
    out.error({
      code: 'question_not_reviewed',
      message: `question ${question.id} is '${question.reviewStatus}' and cannot be released`,
      entityIds: [question.id],
    });
  }
  return out.diagnostics;
}

function checkBinding(
  out: Collector,
  index: WorldIndex,
  questionId: string,
  where: string,
  binding: RO<TermBinding>,
  terms: ReadonlyMap<string, Term>,
  placedAssetIds: ReadonlySet<string>,
): void {
  const term = binding.termId === null ? null : (terms.get(binding.termId) ?? null);
  if (binding.termId !== null && !term) {
    out.error({
      code: 'term_unknown',
      message: `${where} of ${questionId} binds "${binding.text}" to unknown term ${binding.termId}`,
      entityIds: [questionId],
    });
  }
  switch (binding.role) {
    case 'actual': {
      const kind = index.kinds.get(binding.entityId);
      if (!kind) {
        out.error({
          code: 'actual_binding_unbound',
          message: `${where} of ${questionId} binds "${binding.text}" as actual to ${binding.entityId}, which is not in the world`,
          entityIds: [questionId, binding.entityId],
        });
        return;
      }
      const related = new Set<string>([binding.entityId]);
      const actor = index.actors.get(binding.entityId);
      if (actor?.laneId) related.add(actor.laneId);
      if (actor?.movementId) related.add(actor.movementId);
      for (const evidenceId of binding.evidenceIds) {
        const evidence = index.evidence.get(evidenceId);
        if (!evidence) {
          out.error({
            code: 'binding_evidence_missing',
            message: `${where} of ${questionId} backs "${binding.text}" with unknown evidence ${evidenceId}`,
            entityIds: [questionId],
          });
        } else if (!evidence.targetEntityIds.some((t) => related.has(t))) {
          out.error({
            code: 'binding_evidence_unrelated',
            message: `${where} of ${questionId} backs "${binding.text}" (${binding.entityId}) with evidence ${evidenceId}, which targets ${evidence.targetEntityIds.join(', ')}`,
            entityIds: [questionId, binding.entityId],
          });
        }
      }
      if (term && term.illustratedBy.length > 0) {
        const placed = index.placedAssetRefs().find((p) => p.entityId === binding.entityId);
        if (placed && !term.illustratedBy.some((a) => a.id === placed.ref.id)) {
          out.error({
            code: 'actual_binding_term_mismatch',
            message: `${where} of ${questionId} calls ${binding.entityId} "${binding.text}" (${term.id}), but that entity is rendered by ${placed.ref.id}, which does not illustrate the term`,
            entityIds: [questionId, binding.entityId],
            data: {
              termId: term.id,
              assetId: placed.ref.id,
              illustratedBy: term.illustratedBy.map((a) => a.id),
            },
          });
        }
      }
      return;
    }
    case 'hypothetical': {
      if (binding.termId !== null && index.kinds.has(binding.termId)) {
        out.error({
          code: 'hypothetical_names_entity',
          message: `${where} of ${questionId} marks "${binding.text}" hypothetical yet names world entity ${binding.termId}`,
          entityIds: [questionId, binding.termId],
        });
      }
      if (term) {
        const present = term.illustratedBy.filter((a) => placedAssetIds.has(a.id));
        if (present.length > 0) {
          out.error({
            code: 'hypothetical_present_in_world',
            message: `${where} of ${questionId} treats "${binding.text}" (${term.id}) as hypothetical, but ${present.map((a) => a.id).join(', ')} is placed in the world`,
            entityIds: [questionId],
            data: { termId: term.id, presentAssets: present.map((a) => a.id) },
          });
        }
      }
      return;
    }
    case 'glossary':
      return;
  }
}
