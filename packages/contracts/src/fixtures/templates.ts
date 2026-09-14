import { templateId } from '../ids';
import { type Template } from '../template';
import { ASSET_DEV_CAR, ASSET_DEV_SIGN_POST, ASSET_DEV_SIGNAL_POLE, ASSET_GIVE_WAY_FACE, ASSET_GIVE_WAY_LINE_D, ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED, ASSET_STOP_FACE, ASSET_STOP_LINE_J, ref } from './assets';
import { GIVE_WAY_IDS } from './give-way-t-junction';
import { SIGNAL_IDS } from './signalised-junction-right-arrow';
import { STOP_IDS } from './stop-development-access';

/**
 * DEVELOPMENT templates describing the three fixtures as if a generator had produced them. C2
 * implements `Generator.generate` for reviewed templates; these declare the parameter space and
 * invariants the fixtures are meant to exemplify.
 */

const SEMANTIC_INVARIANTS = [
  'source_applicability',
  'lane_topology',
  'marking_context',
  'control_completeness',
  'mount_integrity',
  'approach_facing',
  'question_evidence',
  'camera_evidence',
  'state_invariance',
] as const;

export const TEMPLATE_GIVE_WAY_T: Template = {
  id: templateId('sg.t-junction.give-way'),
  version: 1,
  name: 'Give Way T junction (minor road joins major road)',
  roadClass: 'minor_access',
  topology: 't_junction',
  controlRegime: 'give_way',
  parameters: [
    { name: 'minorApproach', kind: 'enum', allowed: ['south', 'north', 'east', 'west'], default: 'south', answerBearing: false },
    { name: 'egoMovement', kind: 'enum', allowed: ['left', 'right'], default: 'left', answerBearing: false },
    { name: 'majorRoadVehicle.category', kind: 'enum', allowed: ['car', 'bus', 'lorry', 'motorcycle'], default: 'bus', answerBearing: false },
    { name: 'majorRoadVehicle.approach', kind: 'enum', allowed: ['east', 'west', 'none'], default: 'east', answerBearing: true },
  ],
  invariants: SEMANTIC_INVARIANTS,
  safeVariation: [
    { field: 'actors[!ego].progressM', description: 'Major-road vehicle distance from the junction', range: { minM: 15, maxM: 40 } },
    { field: 'conditions.daylight', description: 'Day or dusk lighting', range: { allowed: ['day', 'dusk'] } },
  ],
  requiredAssets: [ref(ASSET_GIVE_WAY_LINE_D), ref(ASSET_GIVE_WAY_FACE), ref(ASSET_DEV_SIGN_POST), ref(ASSET_DEV_CAR)],
  requiredEvidenceIds: [GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.egoLane],
  answerEquivalence: [{ rule: 'ego always yields to any major-road vehicle regardless of its approach side', parameters: ['majorRoadVehicle.approach'] }],
  fixtureWorldIds: [GIVE_WAY_IDS.world],
  reviewStatus: 'development',
};

export const TEMPLATE_STOP_T: Template = {
  id: templateId('sg.t-junction.stop'),
  version: 1,
  name: 'STOP at a development access',
  roadClass: 'development_access',
  topology: 'access_junction',
  controlRegime: 'stop',
  parameters: [
    { name: 'accessApproach', kind: 'enum', allowed: ['east', 'west'], default: 'east', answerBearing: false },
    { name: 'egoMovement', kind: 'enum', allowed: ['left', 'right'], default: 'right', answerBearing: false },
    { name: 'crossingVehicle.approach', kind: 'enum', allowed: ['north', 'south', 'none'], default: 'north', answerBearing: false },
  ],
  invariants: SEMANTIC_INVARIANTS,
  safeVariation: [{ field: 'actors[!ego].progressM', description: 'Crossing vehicle distance', range: { minM: 15, maxM: 40 } }],
  requiredAssets: [ref(ASSET_STOP_LINE_J), ref(ASSET_STOP_FACE), ref(ASSET_DEV_SIGN_POST), ref(ASSET_DEV_CAR)],
  requiredEvidenceIds: [STOP_IDS.evidence.stopSign, STOP_IDS.evidence.stopLine, STOP_IDS.evidence.egoFrontBeforeLine],
  answerEquivalence: [{ rule: 'a STOP requires a full stop whether or not any vehicle is present', parameters: ['crossingVehicle.approach'] }],
  fixtureWorldIds: [STOP_IDS.world],
  reviewStatus: 'development',
};

export const TEMPLATE_SIGNALISED_CROSSROADS: Template = {
  id: templateId('sg.crossroads.signalised'),
  version: 1,
  name: 'Signalised crossroads with paired right-turn arrows',
  roadClass: 'local',
  topology: 'crossroads',
  controlRegime: 'signalised',
  parameters: [
    { name: 'egoApproach', kind: 'enum', allowed: ['south', 'north'], default: 'south', answerBearing: false },
    { name: 'egoMovement', kind: 'enum', allowed: ['straight', 'left', 'right'], default: 'right', answerBearing: true },
    { name: 'nsCircular', kind: 'enum', allowed: ['red', 'amber', 'green'], default: 'green', answerBearing: true },
    { name: 'nsRightArrow', kind: 'enum', allowed: ['red', 'amber', 'green', 'dark'], default: 'red', answerBearing: true },
  ],
  invariants: [...SEMANTIC_INVARIANTS, 'signal_movements'],
  safeVariation: [
    { field: 'actors[!ego].progressM', description: 'Oncoming vehicle distance', range: { minM: 15, maxM: 40 } },
    { field: 'conditions.daylight', description: 'Any lighting; aspects must stay readable', range: { allowed: ['day', 'dusk', 'night'] } },
  ],
  requiredAssets: [ref(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED), ref(ASSET_STOP_LINE_J), ref(ASSET_DEV_SIGNAL_POLE), ref(ASSET_DEV_CAR)],
  requiredEvidenceIds: [SIGNAL_IDS.evidence.nbHeadState, SIGNAL_IDS.evidence.nbStopLine, SIGNAL_IDS.evidence.egoLaneAndIntent],
  answerEquivalence: [{ rule: 'a lit red arrow stops its movement for any circular state', parameters: ['nsCircular'] }],
  fixtureWorldIds: [SIGNAL_IDS.world],
  reviewStatus: 'development',
};

export const DEVELOPMENT_TEMPLATES: readonly Template[] = [TEMPLATE_GIVE_WAY_T, TEMPLATE_STOP_T, TEMPLATE_SIGNALISED_CROSSROADS];
