import {
  type CameraPreset,
  type Diagnostic,
  type EvidenceRequirement,
  type Movement,
  type MovementPermission,
  type MovementTurn,
  type SignalAspect,
  HEADING,
  anchorId,
  degreesToRadians,
  entityId,
  metres,
  templateId,
  unitVec3,
  vec3,
} from '@ottie/contracts';
import {
  ASSET_DEV_SIGNAL_POLE,
  ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED,
  ASSET_STOP_LINE_J,
  LOC_RMS2_J,
  LOC_RULE11_PAIRED_ARROWS,
  LOC_RULE11_RED_ARROW_PROHIBITS,
  LOC_RULE11_VERTICAL_ORDER,
  LOC_TP_SIGNAL_GREEN_RIGHT_RED,
  SIGNAL_IDS,
  SIGNAL_SLOTS,
  controlLineAnchorId,
  movementIdOf,
  ref,
} from '@ottie/contracts/fixtures';
import { buildStraightRoad, quarterTurnsBetween, turnPath } from '../geometry';
import { enumParameter } from '../parameters';
import { type ArrowState, type CircularState, deriveHeadSignalState } from '../signals';
import {
  CONTROL_LINE_SETBACK_M,
  JUNCTION_CLEARANCE_M,
  type LayoutInput,
  type LayoutResult,
  type TemplateLayout,
  conditionsFor,
  placeActor,
  pruneEvidence,
  turnIndicator,
  withOutgoing,
} from './shared';

/**
 * Signalised crossroads with paired right-turn arrows. Canonical orientation has the ego
 * approaching NORTHBOUND (from the south); `egoApproach: 'north'` is the half-turn rotation. Both
 * north–south heads show the same state, derived from `nsCircular` / `nsRightArrow` through the
 * aspect → movement bindings (a lit arrow governs the movements bound to it; Rule 11). East–west
 * heads are not modelled because the extraction set holds one signal-head reference; their
 * permissions are asserted by the phase plan.
 */

const LANE_W = 3.5;
const ROAD_LENGTH = 140;
const ROAD_HALF = ROAD_LENGTH / 2;
const CONTROL_LINE_OFFSET = LANE_W + CONTROL_LINE_SETBACK_M; // 4.5 m from the junction centre
const EGO_PROGRESS_M = 58; // centre at y = -12, front at y = -9.75, upstream of the line at y = -4.5
const EGO_SPEED_KMH = 20;
const ONCOMING_SPEED_KMH = 45;
const HEAD_HEIGHT_M = 2.29; // Rule 11 nominal lowest lens centre; not a site measurement

const EGO_APPROACHES: readonly ('south' | 'north')[] = ['south', 'north'];
const EGO_TURNS: readonly ('straight' | 'left' | 'right')[] = ['straight', 'left', 'right'];
const CIRCULAR_STATES: readonly CircularState[] = ['red', 'amber', 'green'];
const ARROW_STATES: readonly ArrowState[] = ['red', 'amber', 'green', 'dark'];

const CONDITIONS = {
  date: '2026-03-14',
  weekday: 'sat',
  publicHoliday: false,
  weather: 'clear',
  visibility: 'clear',
  surface: 'dry',
  egoVehicleClass: 'car',
  timeByDaylight: { day: '10:15:00', dusk: '19:00:00', night: '20:15:00' },
} as const;

function aspectsFor(circular: readonly Movement['id'][], arrow: readonly Movement['id'][]): readonly SignalAspect[] {
  return [
    { slot: SIGNAL_SLOTS.circularRed, colour: 'red', shape: 'circular', controlsMovementIds: circular },
    { slot: SIGNAL_SLOTS.circularAmber, colour: 'amber', shape: 'circular', controlsMovementIds: circular },
    { slot: SIGNAL_SLOTS.circularGreen, colour: 'green', shape: 'circular', controlsMovementIds: circular },
    { slot: SIGNAL_SLOTS.rightArrowRed, colour: 'red', shape: 'arrow_right', controlsMovementIds: arrow },
    { slot: SIGNAL_SLOTS.rightArrowAmber, colour: 'amber', shape: 'arrow_right', controlsMovementIds: arrow },
    { slot: SIGNAL_SLOTS.rightArrowGreen, colour: 'green', shape: 'arrow_right', controlsMovementIds: arrow },
  ];
}

/** Phase name for the north–south state; east–west is held on stop throughout this development plan. */
function phaseFor(circular: CircularState, arrow: ArrowState): string {
  if (circular === 'green' || circular === 'amber') return arrow === 'green' ? 'ns_through_with_right' : 'ns_through';
  return arrow === 'green' || arrow === 'amber' ? 'ns_right_protected' : 'all_red';
}

export const SIGNALISED_CROSSROADS_LAYOUT: TemplateLayout = {
  templateId: templateId('sg.crossroads.signalised'),
  templateVersion: 1,
  build(input: LayoutInput): LayoutResult {
    const egoApproach = enumParameter(input.parameters, 'egoApproach', EGO_APPROACHES);
    const egoTurn: MovementTurn = enumParameter(input.parameters, 'egoMovement', EGO_TURNS);
    const circular = enumParameter(input.parameters, 'nsCircular', CIRCULAR_STATES);
    const rightArrow = enumParameter(input.parameters, 'nsRightArrow', ARROW_STATES);
    const turns = quarterTurnsBetween('south', egoApproach);

    const ns = buildStraightRoad({
      id: 'ns',
      name: 'North–south road (development fixture)',
      roadClass: 'local',
      start: vec3(0, -ROAD_HALF),
      reference: 'north',
      lengthM: ROAD_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 50,
    });
    const ew = buildStraightRoad({
      id: 'ew',
      name: 'East–west road (development fixture)',
      roadClass: 'local',
      start: vec3(-ROAD_HALF, 0),
      reference: 'east',
      lengthM: ROAD_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 50,
    });

    const NS_NB = ns.lane('with', 0); // northbound, x = -1.75
    const NS_SB = ns.lane('against', 0); // southbound, x = +1.75
    const EW_EB = ew.lane('with', 0); // eastbound, y = +1.75
    const EW_WB = ew.lane('against', 0); // westbound, y = -1.75
    const h = LANE_W / 2;
    const c = JUNCTION_CLEARANCE_M;

    const MV_NB_STRAIGHT = movementIdOf(NS_NB.id, 'straight');
    const MV_NB_LEFT = movementIdOf(NS_NB.id, 'left'); // to EW_WB
    const MV_NB_RIGHT = movementIdOf(NS_NB.id, 'right'); // to EW_EB, across the southbound lane
    const MV_SB_STRAIGHT = movementIdOf(NS_SB.id, 'straight');
    const MV_SB_RIGHT = movementIdOf(NS_SB.id, 'right'); // to EW_WB, across the northbound lane
    const MV_EB_STRAIGHT = movementIdOf(EW_EB.id, 'straight');
    const MV_WB_STRAIGHT = movementIdOf(EW_WB.id, 'straight');

    // Movement priorities describe the junction independent of the current signal state: a right
    // turn is permissive against opposing through traffic; the controller then says which movements
    // may proceed right now.
    const movements: readonly Movement[] = [
      {
        id: MV_NB_STRAIGHT,
        fromLaneId: NS_NB.id,
        toLaneId: NS_NB.id,
        turn: 'straight',
        path: [vec3(-h, -c), vec3(-h, c)],
        priority: 'protected',
        conflictsWith: [MV_EB_STRAIGHT, MV_WB_STRAIGHT, MV_SB_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_NB_LEFT,
        fromLaneId: NS_NB.id,
        toLaneId: EW_WB.id,
        turn: 'left',
        path: turnPath(vec3(-h, -c), vec3(-h, -h), vec3(-c, -h)),
        priority: 'protected',
        conflictsWith: [MV_WB_STRAIGHT],
        yieldsTo: [],
      },
      {
        id: MV_NB_RIGHT,
        fromLaneId: NS_NB.id,
        toLaneId: EW_EB.id,
        turn: 'right',
        path: turnPath(vec3(-h, -c), vec3(-h, h), vec3(c, h)),
        priority: 'permissive',
        conflictsWith: [MV_SB_STRAIGHT, MV_EB_STRAIGHT, MV_WB_STRAIGHT],
        yieldsTo: [MV_SB_STRAIGHT],
      },
      {
        id: MV_SB_STRAIGHT,
        fromLaneId: NS_SB.id,
        toLaneId: NS_SB.id,
        turn: 'straight',
        path: [vec3(h, c), vec3(h, -c)],
        priority: 'protected',
        conflictsWith: [MV_EB_STRAIGHT, MV_WB_STRAIGHT, MV_NB_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_SB_RIGHT,
        fromLaneId: NS_SB.id,
        toLaneId: EW_WB.id,
        turn: 'right',
        path: turnPath(vec3(h, c), vec3(h, -h), vec3(-c, -h)),
        priority: 'permissive',
        conflictsWith: [MV_NB_STRAIGHT, MV_EB_STRAIGHT, MV_WB_STRAIGHT],
        yieldsTo: [MV_NB_STRAIGHT],
      },
      {
        id: MV_EB_STRAIGHT,
        fromLaneId: EW_EB.id,
        toLaneId: EW_EB.id,
        turn: 'straight',
        path: [vec3(-c, h), vec3(c, h)],
        priority: 'protected',
        conflictsWith: [MV_NB_STRAIGHT, MV_NB_RIGHT, MV_SB_STRAIGHT, MV_SB_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_WB_STRAIGHT,
        fromLaneId: EW_WB.id,
        toLaneId: EW_WB.id,
        turn: 'straight',
        path: [vec3(c, -h), vec3(-c, -h)],
        priority: 'protected',
        conflictsWith: [MV_NB_STRAIGHT, MV_NB_LEFT, MV_NB_RIGHT, MV_SB_STRAIGHT, MV_SB_RIGHT],
        yieldsTo: [],
      },
    ];

    const NB_STOP_LINE_ANCHOR = controlLineAnchorId('ns.nb.approach');
    const SB_STOP_LINE_ANCHOR = controlLineAnchorId('ns.sb.approach');
    const NB_POLE_BASE = anchorId('ns.nb.approach.pole-base');
    const SB_POLE_BASE = anchorId('ns.sb.approach.pole-base');
    const NB_STOP_LINE = entityId('ns.nb.stop-line');
    const SB_STOP_LINE = entityId('ns.sb.stop-line');
    const NB_POLE = entityId('ns.nb.pole');
    const SB_POLE = entityId('ns.sb.pole');
    const NB_HEAD = entityId('ns.nb.head.primary');
    const SB_HEAD = entityId('ns.sb.head.primary');
    const CONTROLLER = entityId('junction.controller');
    const EGO = entityId('ego.car');
    const ONCOMING = entityId('ns.sb.car');
    const EV = SIGNAL_IDS.evidence;

    const egoMovementId = egoTurn === 'straight' ? MV_NB_STRAIGHT : egoTurn === 'left' ? MV_NB_LEFT : MV_NB_RIGHT;
    const nbAspects = aspectsFor([MV_NB_STRAIGHT, MV_NB_LEFT], [MV_NB_RIGHT]);
    const sbAspects = aspectsFor([MV_SB_STRAIGHT], [MV_SB_RIGHT]);
    const nbState = deriveHeadSignalState({ headId: NB_HEAD, aspects: nbAspects, circular, rightArrow });
    const sbState = deriveHeadSignalState({ headId: SB_HEAD, aspects: sbAspects, circular, rightArrow });
    // East–west heads are not modelled; the phase plan asserts stop for these approaches.
    const eastWestPermissions: readonly MovementPermission[] = [
      { movementId: MV_EB_STRAIGHT, permission: 'stop', governedByAspects: [] },
      { movementId: MV_WB_STRAIGHT, permission: 'stop', governedByAspects: [] },
    ];

    const nbPolePosition = vec3(-LANE_W - 0.6, -(LANE_W + 2), 0); // (-4.1, -5.5)
    const sbPolePosition = vec3(LANE_W + 0.6, LANE_W + 2, 0); // (4.1, 5.5)
    const UP = unitVec3(0, 0, 1);
    const SIGNAL_SOURCES = [LOC_TP_SIGNAL_GREEN_RIGHT_RED, LOC_RULE11_VERTICAL_ORDER, LOC_RULE11_PAIRED_ARROWS, LOC_RULE11_RED_ARROW_PROHIBITS];

    const diagnostics: Diagnostic[] = [];
    const notes: string[] = [
      'Generated by @ottie/scenario-core from template sg.crossroads.signalised@1; development status, quarantined assets, not reviewed, not release content.',
      'Signal head housing, column spacing, pole height and mount are unknown in the source (assembly-definitions.json); poles are schematic and the 2.29 m lens height is the Rule 11 nominal, not a site value.',
      'Only the north–south approach heads are modelled because the extraction set holds one signal head reference; east–west permissions are asserted by the phase plan with empty governedByAspects.',
      'The source illustration is the Traffic Police handbook PDF page 47 (printed 46): circular green retained while the right-arrow is red.',
      'Aspect states and movement permissions are derived from the nsCircular/nsRightArrow parameters through aspect-to-movement bindings, never from lens position or artwork.',
    ];

    const distanceM = input.variation.nonEgoProgressM ?? 25;
    const oncoming = placeActor({
      id: ONCOMING,
      category: 'car',
      isEgo: false,
      lane: NS_SB,
      movementId: MV_SB_STRAIGHT,
      progressM: ROAD_HALF - distanceM,
      intention: 'straight',
      indicator: 'none',
      speedKmh: ONCOMING_SPEED_KMH,
    });
    const ego = placeActor({
      id: EGO,
      category: 'car',
      isEgo: true,
      lane: NS_NB,
      movementId: egoMovementId,
      progressM: EGO_PROGRESS_M,
      intention: egoTurn,
      indicator: turnIndicator(egoTurn),
      speedKmh: EGO_SPEED_KMH,
    });

    const evidence: readonly EvidenceRequirement[] = [
      {
        id: EV.nbHeadState,
        targetEntityIds: [NB_HEAD],
        requiredDetail: 'aspect_state',
        allowedViews: ['approach_ego', 'entity_detail'],
        mustBeFrontFacing: true,
        maxOcclusionFraction: 0.0,
        minProjectedSizePx: 44,
        coVisibleWith: [],
        contextAnchorIds: [NB_POLE_BASE],
      },
      {
        id: EV.nbStopLine,
        targetEntityIds: [NB_STOP_LINE],
        requiredDetail: 'presence',
        allowedViews: ['plan', 'study_oblique', 'approach_ego'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.1,
        minProjectedSizePx: 24,
        coVisibleWith: [EV.egoLaneAndIntent],
        contextAnchorIds: [NB_STOP_LINE_ANCHOR],
      },
      {
        id: EV.egoLaneAndIntent,
        targetEntityIds: [EGO, NS_NB.id, egoMovementId],
        requiredDetail: 'lane_association',
        allowedViews: ['plan', 'study_oblique', 'approach_ego'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: 32,
        coVisibleWith: [],
        contextAnchorIds: [],
      },
      {
        id: EV.oncoming,
        targetEntityIds: [ONCOMING, NS_SB.id],
        requiredDetail: 'relative_position',
        allowedViews: ['plan', 'study_oblique'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: 32,
        coVisibleWith: [EV.egoLaneAndIntent],
        contextAnchorIds: [],
      },
    ];
    const cameraPresets: readonly CameraPreset[] = [
      {
        name: 'plan',
        projection: 'orthographic',
        eye: vec3(0, 0, 80),
        target: vec3(0, 0, 0),
        up: unitVec3(0, 1, 0),
        fovOrHalfHeight: 30,
        linkedEntityId: null,
        evidenceIds: [EV.nbStopLine, EV.egoLaneAndIntent, EV.oncoming],
      },
      {
        name: 'study_oblique',
        projection: 'orthographic',
        eye: vec3(-35, -45, 35),
        target: vec3(0, 0, 0),
        up: UP,
        fovOrHalfHeight: 22,
        linkedEntityId: null,
        evidenceIds: [EV.nbStopLine, EV.egoLaneAndIntent, EV.oncoming],
      },
      {
        name: 'approach_ego',
        projection: 'perspective',
        eye: vec3(-h, -14, 1.2),
        target: vec3(-2.5, 0, 1.6),
        up: UP,
        fovOrHalfHeight: degreesToRadians(60),
        linkedEntityId: null,
        evidenceIds: [EV.nbHeadState, EV.nbStopLine, EV.egoLaneAndIntent],
      },
      {
        name: 'entity_detail',
        projection: 'perspective',
        eye: vec3(nbPolePosition.x, nbPolePosition.y - 4, HEAD_HEIGHT_M),
        target: vec3(nbPolePosition.x, nbPolePosition.y, HEAD_HEIGHT_M),
        up: UP,
        fovOrHalfHeight: degreesToRadians(30),
        linkedEntityId: NB_HEAD,
        evidenceIds: [EV.nbHeadState],
      },
    ];
    const pruned = pruneEvidence(evidence, cameraPresets, []);

    return {
      ok: true,
      turns,
      notes,
      diagnostics,
      body: {
        controlRegime: 'signalised',
        roads: [ns.road, ew.road],
        lanes: withOutgoing([...ns.lanes, ...ew.lanes], movements),
        movements,
        anchors: [
          ...ns.anchors,
          ...ew.anchors,
          {
            id: NB_STOP_LINE_ANCHOR,
            kind: 'control_line',
            controlsLaneIds: [NS_NB.id],
            road: { roadId: ns.road.id, s: metres(ROAD_HALF - CONTROL_LINE_OFFSET), t: metres(h) },
            polyline: [vec3(-LANE_W, -CONTROL_LINE_OFFSET), vec3(0, -CONTROL_LINE_OFFSET)],
            approachHeading: HEADING.north,
          },
          {
            id: SB_STOP_LINE_ANCHOR,
            kind: 'control_line',
            controlsLaneIds: [NS_SB.id],
            road: { roadId: ns.road.id, s: metres(ROAD_HALF + CONTROL_LINE_OFFSET), t: metres(-h) },
            polyline: [vec3(LANE_W, CONTROL_LINE_OFFSET), vec3(0, CONTROL_LINE_OFFSET)],
            approachHeading: HEADING.south,
          },
          {
            id: NB_POLE_BASE,
            kind: 'support_base',
            position: nbPolePosition,
            roadsideOf: { laneId: NS_NB.id, side: 'left' },
            road: { roadId: ns.road.id, s: metres(ROAD_HALF + nbPolePosition.y), t: metres(0 - nbPolePosition.x) },
          },
          {
            id: SB_POLE_BASE,
            kind: 'support_base',
            position: sbPolePosition,
            roadsideOf: { laneId: NS_SB.id, side: 'left' },
            road: { roadId: ns.road.id, s: metres(ROAD_HALF + sbPolePosition.y), t: metres(0 - sbPolePosition.x) },
          },
        ],
        markings: [
          {
            id: NB_STOP_LINE,
            role: 'stop_line',
            asset: ref(ASSET_STOP_LINE_J),
            anchorId: NB_STOP_LINE_ANCHOR,
            applicableLaneIds: [NS_NB.id],
            applicableMovementIds: [MV_NB_STRAIGHT, MV_NB_LEFT, MV_NB_RIGHT],
            extentM: null,
            sourceRefs: [LOC_RMS2_J],
          },
          {
            id: SB_STOP_LINE,
            role: 'stop_line',
            asset: ref(ASSET_STOP_LINE_J),
            anchorId: SB_STOP_LINE_ANCHOR,
            applicableLaneIds: [NS_SB.id],
            applicableMovementIds: [MV_SB_STRAIGHT, MV_SB_RIGHT],
            extentM: null,
            sourceRefs: [LOC_RMS2_J],
          },
        ],
        supports: [
          {
            id: NB_POLE,
            asset: ref(ASSET_DEV_SIGNAL_POLE),
            family: 'pole',
            baseAnchorId: NB_POLE_BASE,
            pose: { position: nbPolePosition, yaw: HEADING.east },
            heightM: null,
            dimensionsStatus: 'schematic_unsourced',
          },
          {
            id: SB_POLE,
            asset: ref(ASSET_DEV_SIGNAL_POLE),
            family: 'pole',
            baseAnchorId: SB_POLE_BASE,
            pose: { position: sbPolePosition, yaw: HEADING.east },
            heightM: null,
            dimensionsStatus: 'schematic_unsourced',
          },
        ],
        signFaces: [],
        signalHeads: [
          {
            id: NB_HEAD,
            asset: ref(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED),
            controllerId: CONTROLLER,
            attachment: { supportId: NB_POLE, supportAttachmentName: 'head_mount', partAttachmentName: 'back_centre', heightAboveGroundM: metres(HEAD_HEIGHT_M) },
            pose: { position: vec3(nbPolePosition.x, nbPolePosition.y, HEAD_HEIGHT_M), yaw: HEADING.east },
            frontNormal: unitVec3(0, -1, 0), // faces northbound approaching traffic
            up: UP,
            intendedApproach: { laneIds: [NS_NB.id], heading: HEADING.north },
            applicableLaneIds: [NS_NB.id],
            aspects: nbAspects,
            linkedControlLineIds: [NB_STOP_LINE_ANCHOR],
            sourceRefs: SIGNAL_SOURCES,
          },
          {
            id: SB_HEAD,
            asset: ref(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED),
            controllerId: CONTROLLER,
            attachment: { supportId: SB_POLE, supportAttachmentName: 'head_mount', partAttachmentName: 'back_centre', heightAboveGroundM: metres(HEAD_HEIGHT_M) },
            // Asset front is -Y; yaw 180° turns it to face +Y toward southbound approaching traffic.
            pose: { position: vec3(sbPolePosition.x, sbPolePosition.y, HEAD_HEIGHT_M), yaw: HEADING.west },
            frontNormal: unitVec3(0, 1, 0),
            up: UP,
            intendedApproach: { laneIds: [NS_SB.id], heading: HEADING.south },
            applicableLaneIds: [NS_SB.id],
            aspects: sbAspects,
            linkedControlLineIds: [SB_STOP_LINE_ANCHOR],
            sourceRefs: SIGNAL_SOURCES,
          },
        ],
        signalControllers: [
          {
            id: CONTROLLER,
            phasePlanRef: 'dev.ns-through-with-right-held',
            currentPhase: phaseFor(circular, rightArrow),
            aspectStates: [...nbState.aspectStates, ...sbState.aspectStates],
            movementPermissions: [...nbState.movementPermissions, ...sbState.movementPermissions, ...eastWestPermissions],
          },
        ],
        actors: [ego, oncoming],
        conditions: conditionsFor(CONDITIONS, input.variation.daylight ?? 'night'),
        depictedViolations: [],
        evidence: pruned.evidence,
        cameraPresets: pruned.cameraPresets,
      },
    };
  },
};
