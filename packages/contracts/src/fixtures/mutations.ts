import { type ValidatorName } from '../diagnostic';
import { type DeepReadonly, type Mutable, cloneMutable, freezeDeep } from '../immutable';
import { type Question } from '../content';
import { entityId } from '../ids';
import { metres, unitVec3, vec3 } from '../units';
import { type World } from '../world';
import { ASSET_STOP_LINE_J, ref } from './assets';
import { QUESTION_GIVE_WAY, QUESTION_RED_RIGHT_ARROW, QUESTION_STOP } from './content';
import { GIVE_WAY_IDS, GIVE_WAY_T_JUNCTION } from './give-way-t-junction';
import { SIGNAL_IDS, SIGNAL_SLOTS, SIGNALISED_JUNCTION_RIGHT_ARROW } from './signalised-junction-right-arrow';
import { STOP_DEVELOPMENT_ACCESS, STOP_IDS } from './stop-development-access';

/**
 * Named invalid mutations of the development fixtures. Each one is a semantic wrong that the
 * validator in `expectedValidator` (V1: packages/scenario-validation, R2: renderer/cameras) MUST
 * reject with an error. F0 only guarantees the mutation is well-formed and actually differs from
 * its base; `structurallyDetectable` marks the few that `checkWorldStructure` already catches.
 *
 * Downstream acceptance: `for (const m of INVALID_MUTATIONS) expect(validate(m.apply()).ok).toBe(false)`.
 */
export interface WorldMutation {
  readonly id: string;
  readonly base: DeepReadonly<World>;
  readonly description: string;
  readonly expectedValidator: ValidatorName;
  /** Suggested stable diagnostic code prefix, e.g. `control_completeness.missing_give_way_row`. */
  readonly expectedCode: string;
  readonly structurallyDetectable: boolean;
  apply(): DeepReadonly<World>;
}

export interface QuestionMutation {
  readonly id: string;
  readonly base: Question;
  readonly world: DeepReadonly<World>;
  readonly description: string;
  readonly expectedValidator: ValidatorName;
  readonly expectedCode: string;
  readonly structurallyDetectable: boolean;
  apply(): Question;
}

function mutate(base: DeepReadonly<World>, edit: (draft: Mutable<World>) => void): DeepReadonly<World> {
  const draft = cloneMutable<World>(base);
  edit(draft);
  return freezeDeep<World>(draft);
}

function mustFind<T extends { readonly id: string }>(items: readonly T[], id: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw new RangeError(`fixture entity ${id} missing`);
  return found;
}

export const MUTATION_GIVE_WAY_SINGLE_ROW: WorldMutation = {
  id: 'give-way.single-row',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Give Way line replaced by a single-row J line while the Give Way sign remains: marking role no longer matches the control.',
  expectedValidator: 'control_completeness',
  expectedCode: 'control_completeness.marking_role_mismatch',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      const marking = mustFind(draft.markings, GIVE_WAY_IDS.entities.giveWayLine);
      draft.markings = draft.markings.map((m) => (m.id === marking.id ? { ...m, asset: ref(ASSET_STOP_LINE_J) } : m));
    }),
};

export const MUTATION_GIVE_WAY_LINE_REMOVED: WorldMutation = {
  id: 'give-way.line-removed',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Give Way sign present but no give_way_line marking on the controlled lane.',
  expectedValidator: 'control_completeness',
  expectedCode: 'control_completeness.missing_control_line',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.markings = draft.markings.filter((m) => m.id !== GIVE_WAY_IDS.entities.giveWayLine);
      draft.evidence = draft.evidence.filter((e) => !e.targetEntityIds.includes(GIVE_WAY_IDS.entities.giveWayLine));
      draft.evidence = draft.evidence.map((e) => ({ ...e, coVisibleWith: e.coVisibleWith.filter((c) => c !== GIVE_WAY_IDS.evidence.giveWayLine) }));
      draft.cameraPresets = draft.cameraPresets.map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((e) => e !== GIVE_WAY_IDS.evidence.giveWayLine) }));
    }),
};

export const MUTATION_GIVE_WAY_SIGN_REVERSED: WorldMutation = {
  id: 'give-way.sign-faces-away',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Give Way face normal points north, away from the northbound approach it is meant for.',
  expectedValidator: 'approach_facing',
  expectedCode: 'approach_facing.face_away_from_approach',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.signFaces = draft.signFaces.map((f) => (f.id === GIVE_WAY_IDS.entities.giveWaySign ? { ...f, frontNormal: unitVec3(0, 1, 0) } : f));
    }),
};

export const MUTATION_GIVE_WAY_SIGN_WRONG_APPROACH: WorldMutation = {
  id: 'give-way.sign-controls-major-road',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Give Way face re-associated with the major road westbound lane, which has priority.',
  expectedValidator: 'control_completeness',
  expectedCode: 'control_completeness.control_on_priority_approach',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      const wb = GIVE_WAY_IDS.lanes.majorWestbound;
      draft.signFaces = draft.signFaces.map((f) =>
        f.id === GIVE_WAY_IDS.entities.giveWaySign
          ? { ...f, applicableLaneIds: [wb], intendedApproach: { laneIds: [wb], heading: f.intendedApproach.heading }, applicableMovementIds: [GIVE_WAY_IDS.movements.majorWbStraight] }
          : f,
      );
    }),
};

export const MUTATION_GIVE_WAY_SIGN_FLOATING: WorldMutation = {
  id: 'give-way.sign-without-support',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Sign post removed; the face references a support that does not exist.',
  expectedValidator: 'mount_integrity',
  expectedCode: 'mount_integrity.floating_face',
  structurallyDetectable: true,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.supports = draft.supports.filter((s) => s.id !== GIVE_WAY_IDS.entities.giveWayPost);
    }),
};

export const MUTATION_GIVE_WAY_SIGN_WRONG_MOUNT_POINT: WorldMutation = {
  id: 'give-way.sign-on-ground-attachment',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Face attached to the post\'s `ground` point, which accepts only ground, and its pose no longer matches the support.',
  expectedValidator: 'mount_integrity',
  expectedCode: 'mount_integrity.attachment_kind_mismatch',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.signFaces = draft.signFaces.map((f) =>
        f.id === GIVE_WAY_IDS.entities.giveWaySign
          ? { ...f, attachment: { ...f.attachment, supportAttachmentName: 'ground', heightAboveGroundM: metres(0) }, pose: { ...f.pose, position: vec3(-4.1, -8, 0) } }
          : f,
      );
    }),
};

export const MUTATION_GIVE_WAY_SIGN_HIDDEN: WorldMutation = {
  id: 'give-way.sign-behind-bus',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Bus parked directly between the ego and the Give Way face; readable_face evidence is occluded in approach_ego and no detail view is linked.',
  expectedValidator: 'camera_evidence',
  expectedCode: 'camera_evidence.required_evidence_occluded',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.actors = draft.actors.map((a) =>
        a.id === GIVE_WAY_IDS.entities.bus
          ? { ...a, laneId: GIVE_WAY_IDS.lanes.minorNorthbound, movementId: null, progressM: metres(41), pose: { position: vec3(-3.2, -9, 0), yaw: a.pose.yaw }, lateralOffsetM: metres(-1.45), intention: 'stationary', speedKmh: 0 }
          : a,
      );
      draft.cameraPresets = draft.cameraPresets.filter((c) => c.name !== 'entity_detail');
    }),
};

export const MUTATION_STOP_EGO_BEYOND_LINE: WorldMutation = {
  id: 'stop.ego-front-beyond-line',
  base: STOP_DEVELOPMENT_ACCESS,
  description: 'Ego car front is past the stop line (x < 4.25) while the scene still claims "stopped before the line" evidence.',
  expectedValidator: 'question_evidence',
  expectedCode: 'question_evidence.relative_position_contradicted',
  structurallyDetectable: false,
  apply: () =>
    mutate(STOP_DEVELOPMENT_ACCESS, (draft) => {
      draft.actors = draft.actors.map((a) =>
        a.id === STOP_IDS.entities.ego ? { ...a, progressM: metres(35), pose: { ...a.pose, position: vec3(5, -1.625, 0) } } : a,
      );
    }),
};

export const MUTATION_STOP_LINE_AS_SHOULDER: WorldMutation = {
  id: 'stop.line-role-shoulder-boundary',
  base: STOP_DEVELOPMENT_ACCESS,
  description: 'Same J geometry but role changed to shoulder_boundary: a STOP sign without a stop_line.',
  expectedValidator: 'marking_context',
  expectedCode: 'marking_context.role_not_allowed_on_anchor',
  structurallyDetectable: false,
  apply: () =>
    mutate(STOP_DEVELOPMENT_ACCESS, (draft) => {
      draft.markings = draft.markings.map((m) => (m.id === STOP_IDS.entities.stopLine ? { ...m, role: 'shoulder_boundary' } : m));
    }),
};

export const MUTATION_STOP_SIGN_MISSING: WorldMutation = {
  id: 'stop.sign-missing',
  base: STOP_DEVELOPMENT_ACCESS,
  description: 'Stop line present but no STOP face governs the lane.',
  expectedValidator: 'control_completeness',
  expectedCode: 'control_completeness.missing_sign_for_stop_line',
  structurallyDetectable: false,
  apply: () =>
    mutate(STOP_DEVELOPMENT_ACCESS, (draft) => {
      draft.signFaces = [];
      draft.evidence = draft.evidence.filter((e) => e.id !== STOP_IDS.evidence.stopSign);
      draft.cameraPresets = draft.cameraPresets
        .filter((c) => c.name !== 'entity_detail')
        .map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((e) => e !== STOP_IDS.evidence.stopSign) }));
    }),
};

export const MUTATION_SIGNAL_LENSES_MISORDERED: WorldMutation = {
  id: 'signal.green-above-red',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Circular red and green slots swapped in the head aspect list order (row semantics come from the asset; the head instance disagrees).',
  expectedValidator: 'signal_movements',
  expectedCode: 'signal_movements.aspect_layout_mismatch',
  structurallyDetectable: false,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.signalHeads = draft.signalHeads.map((h) => {
        if (h.id !== SIGNAL_IDS.entities.nbHead) return h;
        const aspects = h.aspects.map((a) => {
          if (a.slot === SIGNAL_SLOTS.circularRed) return { ...a, colour: 'green' as const };
          if (a.slot === SIGNAL_SLOTS.circularGreen) return { ...a, colour: 'red' as const };
          return a;
        });
        return { ...h, aspects };
      });
    }),
};

export const MUTATION_SIGNAL_RIGHT_PERMITTED_UNDER_RED_ARROW: WorldMutation = {
  id: 'signal.right-turn-permitted-under-red-arrow',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Controller grants proceed_permissive to the right turn while the right-arrow red is lit.',
  expectedValidator: 'signal_movements',
  expectedCode: 'signal_movements.permission_contradicts_lit_red_arrow',
  structurallyDetectable: false,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.signalControllers = draft.signalControllers.map((c) => ({
        ...c,
        movementPermissions: c.movementPermissions.map((p) =>
          p.movementId === SIGNAL_IDS.movements.nbRight ? { ...p, permission: 'proceed_permissive' as const } : p,
        ),
      }));
    }),
};

export const MUTATION_SIGNAL_ARROW_CONTROLS_STRAIGHT: WorldMutation = {
  id: 'signal.right-arrow-bound-to-straight',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Right-arrow aspects bound to the straight movement instead of the right turn.',
  expectedValidator: 'signal_movements',
  expectedCode: 'signal_movements.arrow_shape_movement_mismatch',
  structurallyDetectable: false,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.signalHeads = draft.signalHeads.map((h) =>
        h.id === SIGNAL_IDS.entities.nbHead
          ? { ...h, aspects: h.aspects.map((a) => (a.shape === 'arrow_right' ? { ...a, controlsMovementIds: [SIGNAL_IDS.movements.nbStraight] } : a)) }
          : h,
      );
    }),
};

export const MUTATION_SIGNAL_HEAD_NOT_LINKED_TO_STOP_LINE: WorldMutation = {
  id: 'signal.head-without-stop-line',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Northbound head no longer linked to any control line; the stop line marking is removed.',
  expectedValidator: 'control_completeness',
  expectedCode: 'control_completeness.signal_without_stop_line',
  structurallyDetectable: false,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.signalHeads = draft.signalHeads.map((h) => (h.id === SIGNAL_IDS.entities.nbHead ? { ...h, linkedControlLineIds: [] } : h));
      draft.markings = draft.markings.filter((m) => m.id !== SIGNAL_IDS.entities.nbStopLine);
      draft.evidence = draft.evidence.filter((e) => e.id !== SIGNAL_IDS.evidence.nbStopLine);
      draft.cameraPresets = draft.cameraPresets.map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((e) => e !== SIGNAL_IDS.evidence.nbStopLine) }));
    }),
};

export const MUTATION_SIGNAL_HEAD_ON_UNKNOWN_SUPPORT: WorldMutation = {
  id: 'signal.head-on-unknown-support',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Northbound head attached to a support ID that does not exist.',
  expectedValidator: 'mount_integrity',
  expectedCode: 'mount_integrity.floating_head',
  structurallyDetectable: true,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.signalHeads = draft.signalHeads.map((h) =>
        h.id === SIGNAL_IDS.entities.nbHead ? { ...h, attachment: { ...h.attachment, supportId: entityId('ns.nb.pole.missing') } } : h,
      );
    }),
};

export const MUTATION_LANE_DANGLING_ROAD: WorldMutation = {
  id: 'topology.lane-on-missing-road',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Minor road removed while its lanes remain.',
  expectedValidator: 'lane_topology',
  expectedCode: 'lane_topology.lane_without_road',
  structurallyDetectable: true,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.roads = draft.roads.filter((r) => r.id !== 'minor');
    }),
};

export const MUTATION_EVIDENCE_ON_MISSING_ENTITY: WorldMutation = {
  id: 'evidence.target-missing',
  base: STOP_DEVELOPMENT_ACCESS,
  description: 'Evidence requirement targets an entity that is not in the world.',
  expectedValidator: 'question_evidence',
  expectedCode: 'question_evidence.target_missing',
  structurallyDetectable: true,
  apply: () =>
    mutate(STOP_DEVELOPMENT_ACCESS, (draft) => {
      draft.evidence = draft.evidence.map((e) => (e.id === STOP_IDS.evidence.stopSign ? { ...e, targetEntityIds: [entityId('access.stop-sign.ghost')] } : e));
    }),
};

export const MUTATION_CONTROL_LINE_ON_WRONG_LANE: WorldMutation = {
  id: 'give-way.control-line-controls-major-lane',
  base: GIVE_WAY_T_JUNCTION,
  description: 'Control line anchor claims to control the major eastbound lane although it lies across the minor approach.',
  expectedValidator: 'lane_topology',
  expectedCode: 'lane_topology.control_line_off_lane',
  structurallyDetectable: false,
  apply: () =>
    mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.anchors = draft.anchors.map((a) =>
        a.id === GIVE_WAY_IDS.anchors.controlLine && a.kind === 'control_line' ? { ...a, controlsLaneIds: [GIVE_WAY_IDS.lanes.majorEastbound] } : a,
      );
    }),
};

/**
 * NOT an invalid world: a presentation change (camera preset moved) that must leave every
 * non-camera field byte-identical. `state_invariance` tests compare `stripPresentation(base)` with
 * `stripPresentation(mutated)`.
 */
export const PRESENTATION_ONLY_CAMERA_MOVE: WorldMutation = {
  id: 'presentation.camera-moved',
  base: SIGNALISED_JUNCTION_RIGHT_ARROW,
  description: 'Plan camera moved; traffic, answers, seeds and asset transforms must be unchanged.',
  expectedValidator: 'state_invariance',
  expectedCode: 'state_invariance.non_presentation_field_changed',
  structurallyDetectable: false,
  apply: () =>
    mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.cameraPresets = draft.cameraPresets.map((c) => (c.name === 'plan' ? { ...c, eye: vec3(5, 5, 90), fovOrHalfHeight: 40 } : c));
    }),
};

export function stripPresentation(world: DeepReadonly<World>): Omit<DeepReadonly<World>, 'cameraPresets'> {
  const rest: { -readonly [K in keyof DeepReadonly<World>]?: DeepReadonly<World>[K] } = { ...world };
  delete rest.cameraPresets;
  return rest as Omit<DeepReadonly<World>, 'cameraPresets'>;
}

export const INVALID_WORLD_MUTATIONS: readonly WorldMutation[] = [
  MUTATION_GIVE_WAY_SINGLE_ROW,
  MUTATION_GIVE_WAY_LINE_REMOVED,
  MUTATION_GIVE_WAY_SIGN_REVERSED,
  MUTATION_GIVE_WAY_SIGN_WRONG_APPROACH,
  MUTATION_GIVE_WAY_SIGN_FLOATING,
  MUTATION_GIVE_WAY_SIGN_WRONG_MOUNT_POINT,
  MUTATION_GIVE_WAY_SIGN_HIDDEN,
  MUTATION_STOP_EGO_BEYOND_LINE,
  MUTATION_STOP_LINE_AS_SHOULDER,
  MUTATION_STOP_SIGN_MISSING,
  MUTATION_SIGNAL_LENSES_MISORDERED,
  MUTATION_SIGNAL_RIGHT_PERMITTED_UNDER_RED_ARROW,
  MUTATION_SIGNAL_ARROW_CONTROLS_STRAIGHT,
  MUTATION_SIGNAL_HEAD_NOT_LINKED_TO_STOP_LINE,
  MUTATION_SIGNAL_HEAD_ON_UNKNOWN_SUPPORT,
  MUTATION_LANE_DANGLING_ROAD,
  MUTATION_EVIDENCE_ON_MISSING_ENTITY,
  MUTATION_CONTROL_LINE_ON_WRONG_LANE,
];

export const QUESTION_MUTATION_HYPOTHETICAL_AS_ACTUAL: QuestionMutation = {
  id: 'question.hypothetical-bound-as-actual',
  base: QUESTION_GIVE_WAY,
  world: GIVE_WAY_T_JUNCTION,
  description: 'The "stop line" distractor is bound as an actual entity that does not exist in the Give Way world.',
  expectedValidator: 'question_evidence',
  expectedCode: 'question_evidence.actual_binding_unbound',
  structurallyDetectable: true,
  apply: () => ({
    ...QUESTION_GIVE_WAY,
    options: [
      QUESTION_GIVE_WAY.options[0],
      {
        ...QUESTION_GIVE_WAY.options[1],
        bindings: [{ role: 'actual', text: 'a stop line', termId: null, entityId: entityId('minor.stop-line'), evidenceIds: [] }],
      },
      QUESTION_GIVE_WAY.options[2],
      QUESTION_GIVE_WAY.options[3],
    ],
  }),
};

export const QUESTION_MUTATION_REQUIRED_EVIDENCE_UNKNOWN: QuestionMutation = {
  id: 'question.required-evidence-not-in-world',
  base: QUESTION_STOP,
  world: STOP_DEVELOPMENT_ACCESS,
  description: 'Question requires evidence the world never declares.',
  expectedValidator: 'question_evidence',
  expectedCode: 'question_evidence.required_evidence_missing',
  structurallyDetectable: true,
  apply: () => ({ ...QUESTION_STOP, requiredEvidenceIds: [...QUESTION_STOP.requiredEvidenceIds, 'ev.pedestrian-crossing'] }),
};

export const QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW: QuestionMutation = {
  id: 'question.required-evidence-hidden-in-all-views',
  base: QUESTION_RED_RIGHT_ARROW,
  world: mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
    draft.cameraPresets = draft.cameraPresets.map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((e) => e !== SIGNAL_IDS.evidence.nbHeadState) }));
  }),
  description: 'Head aspect-state evidence is required by the question but no camera preset exposes it.',
  expectedValidator: 'camera_evidence',
  expectedCode: 'camera_evidence.required_evidence_not_exposed',
  structurallyDetectable: false,
  apply: () => QUESTION_RED_RIGHT_ARROW,
};

export const QUESTION_MUTATIONS: readonly QuestionMutation[] = [
  QUESTION_MUTATION_HYPOTHETICAL_AS_ACTUAL,
  QUESTION_MUTATION_REQUIRED_EVIDENCE_UNKNOWN,
  QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW,
];
