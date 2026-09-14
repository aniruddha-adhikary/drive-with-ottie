import {
  type CameraPreset,
  type CompassDirection,
  type Diagnostic,
  type EvidenceRequirement,
  type Movement,
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
  ASSET_DEV_SIGN_POST,
  ASSET_STOP_FACE,
  ASSET_STOP_LINE_J,
  LOC_RMS2_J,
  LOC_TFM1_STOP,
  LOC_TP_GIVE_WAY_STOP_MEANING,
  STOP_IDS,
  controlLineAnchorId,
  movementIdOf,
  ref,
} from '@ottie/contracts/fixtures';
import { buildStraightRoad, quarterTurnsBetween, turnPath } from '../geometry';
import { enumParameter } from '../parameters';
import {
  CONTROL_LINE_SETBACK_M,
  JUNCTION_CLEARANCE_M,
  type LayoutInput,
  type LayoutResult,
  type TemplateLayout,
  conditionsFor,
  placeActor,
  pruneEvidence,
  toCanonicalCompass,
  turnIndicator,
  withOutgoing,
} from './shared';

/**
 * STOP at a development access: a development access road meets a north–south local road.
 * Canonical orientation has the access arriving from the EAST; `accessApproach: 'west'` is the
 * half-turn rotation of the same semantic world. Every access movement is stop_then_yield to every
 * conflicting local-road movement regardless of whether a crossing vehicle is present.
 */

const LANE_W = 3.25;
const LOCAL_LENGTH = 100;
const LOCAL_HALF = LOCAL_LENGTH / 2;
const ACCESS_LENGTH = 36.75; // ends at the local road's eastern edge (x = 3.25)
const CONTROL_LINE_X = LANE_W + CONTROL_LINE_SETBACK_M; // 4.25
const EGO_PROGRESS_M = 29; // centre at x = 11, front at x = 8.75, upstream of the line
const EGO_SPEED_KMH = 10;
const VEHICLE_SPEED_KMH = 40;
const SIGN_HEIGHT_M = 2.1;

const ACCESS_APPROACHES: readonly ('east' | 'west')[] = ['east', 'west'];
const EGO_TURNS: readonly ('left' | 'right')[] = ['left', 'right'];
const CROSSING_APPROACHES: readonly ('north' | 'south' | 'none')[] = ['north', 'south', 'none'];

const CONDITIONS = {
  date: '2026-03-12',
  weekday: 'thu',
  publicHoliday: false,
  weather: 'clear',
  visibility: 'clear',
  surface: 'dry',
  egoVehicleClass: 'car',
  timeByDaylight: { day: '17:30:00', dusk: '19:00:00', night: '21:00:00' },
} as const;

export const STOP_DEVELOPMENT_ACCESS_LAYOUT: TemplateLayout = {
  templateId: templateId('sg.t-junction.stop'),
  templateVersion: 1,
  build(input: LayoutInput): LayoutResult {
    const accessApproach = enumParameter(input.parameters, 'accessApproach', ACCESS_APPROACHES);
    const egoTurn = enumParameter(input.parameters, 'egoMovement', EGO_TURNS);
    const crossingApproachWorld = enumParameter(input.parameters, 'crossingVehicle.approach', CROSSING_APPROACHES);
    const turns = quarterTurnsBetween('east', accessApproach);

    const local = buildStraightRoad({
      id: 'local',
      name: 'Local road (development fixture)',
      roadClass: 'local',
      start: vec3(0, LOCAL_HALF),
      reference: 'south',
      lengthM: LOCAL_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 50,
    });
    const access = buildStraightRoad({
      id: 'access',
      name: 'Development access (development fixture)',
      roadClass: 'development_access',
      start: vec3(40, 0),
      reference: 'west',
      lengthM: ACCESS_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 30,
    });

    const LOCAL_SB = local.lane('with', 0); // southbound; LEFT of south is east, so x = +1.625
    const LOCAL_NB = local.lane('against', 0); // northbound, x = -1.625
    const ACCESS_WB = access.lane('with', 0); // westbound toward the junction; LEFT of west is south: y = -1.625
    const ACCESS_EB = access.lane('against', 0); // eastbound away; y = +1.625
    const h = LANE_W / 2;
    const c = JUNCTION_CLEARANCE_M;

    const MV_ACCESS_LEFT = movementIdOf(ACCESS_WB.id, 'left'); // to LOCAL_SB
    const MV_ACCESS_RIGHT = movementIdOf(ACCESS_WB.id, 'right'); // to LOCAL_NB
    const MV_LOCAL_SB_STRAIGHT = movementIdOf(LOCAL_SB.id, 'straight');
    const MV_LOCAL_SB_LEFT = movementIdOf(LOCAL_SB.id, 'left'); // to ACCESS_EB
    const MV_LOCAL_NB_STRAIGHT = movementIdOf(LOCAL_NB.id, 'straight');
    const MV_LOCAL_NB_RIGHT = movementIdOf(LOCAL_NB.id, 'right'); // to ACCESS_EB

    const movements: readonly Movement[] = [
      {
        id: MV_ACCESS_LEFT,
        fromLaneId: ACCESS_WB.id,
        toLaneId: LOCAL_SB.id,
        turn: 'left',
        path: turnPath(vec3(LANE_W, -h), vec3(h, -h), vec3(h, -c)),
        priority: 'stop_then_yield',
        conflictsWith: [MV_LOCAL_SB_STRAIGHT],
        yieldsTo: [MV_LOCAL_SB_STRAIGHT],
      },
      {
        id: MV_ACCESS_RIGHT,
        fromLaneId: ACCESS_WB.id,
        toLaneId: LOCAL_NB.id,
        turn: 'right',
        path: turnPath(vec3(LANE_W, -h), vec3(-h, -h), vec3(-h, c)),
        priority: 'stop_then_yield',
        conflictsWith: [MV_LOCAL_SB_STRAIGHT, MV_LOCAL_NB_STRAIGHT, MV_LOCAL_SB_LEFT],
        yieldsTo: [MV_LOCAL_SB_STRAIGHT, MV_LOCAL_NB_STRAIGHT, MV_LOCAL_SB_LEFT],
      },
      {
        id: MV_LOCAL_SB_STRAIGHT,
        fromLaneId: LOCAL_SB.id,
        toLaneId: LOCAL_SB.id,
        turn: 'straight',
        path: [vec3(h, c), vec3(h, -c)],
        priority: 'protected',
        conflictsWith: [MV_ACCESS_LEFT, MV_ACCESS_RIGHT, MV_LOCAL_NB_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_LOCAL_SB_LEFT,
        fromLaneId: LOCAL_SB.id,
        toLaneId: ACCESS_EB.id,
        turn: 'left',
        path: turnPath(vec3(h, c), vec3(h, h), vec3(c, h)),
        priority: 'protected',
        conflictsWith: [MV_ACCESS_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_LOCAL_NB_STRAIGHT,
        fromLaneId: LOCAL_NB.id,
        toLaneId: LOCAL_NB.id,
        turn: 'straight',
        path: [vec3(-h, -c), vec3(-h, c)],
        priority: 'protected',
        conflictsWith: [MV_ACCESS_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_LOCAL_NB_RIGHT,
        fromLaneId: LOCAL_NB.id,
        toLaneId: ACCESS_EB.id,
        turn: 'right',
        path: turnPath(vec3(-h, -c), vec3(-h, h), vec3(c, h)),
        priority: 'permissive',
        conflictsWith: [MV_LOCAL_SB_STRAIGHT],
        yieldsTo: [MV_LOCAL_SB_STRAIGHT],
      },
    ];

    const CONTROL_LINE = controlLineAnchorId('access.approach');
    const SIGN_BASE = anchorId('access.approach.sign-base');
    const STOP_LINE = entityId('access.stop-line');
    const STOP_POST = entityId('access.stop-post');
    const STOP_SIGN = entityId('access.stop-sign');
    const EGO = entityId('ego.car');
    const CROSSING_CAR = entityId('local.car');
    const EV = STOP_IDS.evidence;

    const egoMovementId = egoTurn === 'left' ? MV_ACCESS_LEFT : MV_ACCESS_RIGHT;
    const signPosition = vec3(7.5, -LANE_W - 0.6, 0);
    const diagnostics: Diagnostic[] = [];
    const notes: string[] = [
      'Generated by @ottie/scenario-core from template sg.t-junction.stop@1; development status, quarantined assets, not reviewed, not release content.',
      'J is used here in its stop_line role; the same geometry as a paved-shoulder boundary is a different role and must not be confused.',
      'Sign mounting height 2.1 m, post, vehicle sizes and the 1 m line setback are schematic teaching choices, not source values.',
      'STOP meaning: Traffic Police handbook PDF page 11 (printed 10): "Stop before the white line. Give way to traffic from the right and left."',
      'Priority, conflict and yield relationships are authored from the stop control regime and movement topology, not inferred from rendered geometry.',
    ];

    let crossing = null;
    if (crossingApproachWorld !== 'none') {
      const canonical: CompassDirection = toCanonicalCompass(crossingApproachWorld, turns);
      const fromNorth = canonical === 'north';
      const distanceM = input.variation.nonEgoProgressM ?? 20;
      crossing = placeActor({
        id: CROSSING_CAR,
        category: 'car',
        isEgo: false,
        lane: fromNorth ? LOCAL_SB : LOCAL_NB,
        movementId: fromNorth ? MV_LOCAL_SB_STRAIGHT : MV_LOCAL_NB_STRAIGHT,
        progressM: LOCAL_HALF - distanceM,
        intention: 'straight',
        indicator: 'none',
        speedKmh: VEHICLE_SPEED_KMH,
      });
    }

    const ego = placeActor({
      id: EGO,
      category: 'car',
      isEgo: true,
      lane: ACCESS_WB,
      movementId: egoMovementId,
      progressM: EGO_PROGRESS_M,
      intention: egoTurn,
      indicator: turnIndicator(egoTurn),
      speedKmh: EGO_SPEED_KMH,
    });

    const UP = unitVec3(0, 0, 1);
    const evidence: readonly EvidenceRequirement[] = [
      {
        id: EV.stopLine,
        targetEntityIds: [STOP_LINE],
        requiredDetail: 'presence',
        allowedViews: ['plan', 'study_oblique', 'approach_ego'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.1,
        minProjectedSizePx: 24,
        coVisibleWith: [EV.egoFrontBeforeLine],
        contextAnchorIds: [CONTROL_LINE],
      },
      {
        id: EV.stopSign,
        targetEntityIds: [STOP_SIGN],
        requiredDetail: 'readable_face',
        allowedViews: ['approach_ego', 'entity_detail'],
        mustBeFrontFacing: true,
        maxOcclusionFraction: 0.05,
        minProjectedSizePx: 44,
        coVisibleWith: [],
        contextAnchorIds: [SIGN_BASE],
      },
      {
        id: EV.egoFrontBeforeLine,
        targetEntityIds: [EGO, STOP_LINE],
        requiredDetail: 'relative_position',
        allowedViews: ['plan', 'study_oblique'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.1,
        minProjectedSizePx: 32,
        coVisibleWith: [],
        contextAnchorIds: [CONTROL_LINE],
      },
      {
        id: EV.crossingCar,
        targetEntityIds: [CROSSING_CAR, crossing?.laneId ?? LOCAL_SB.id],
        requiredDetail: 'lane_association',
        allowedViews: ['plan', 'study_oblique'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: 32,
        coVisibleWith: [EV.egoFrontBeforeLine],
        contextAnchorIds: [],
      },
    ];
    const cameraPresets: readonly CameraPreset[] = [
      {
        name: 'plan',
        projection: 'orthographic',
        eye: vec3(8, 4, 80),
        target: vec3(8, 4, 0),
        up: unitVec3(0, 1, 0),
        fovOrHalfHeight: 24,
        linkedEntityId: null,
        evidenceIds: [EV.stopLine, EV.egoFrontBeforeLine, EV.crossingCar],
      },
      {
        name: 'study_oblique',
        projection: 'orthographic',
        eye: vec3(40, -30, 30),
        target: vec3(6, 2, 0),
        up: UP,
        fovOrHalfHeight: 18,
        linkedEntityId: null,
        evidenceIds: [EV.stopLine, EV.egoFrontBeforeLine, EV.crossingCar],
      },
      {
        name: 'approach_ego',
        projection: 'perspective',
        eye: vec3(13, -h, 1.2),
        target: vec3(0, -h, 1.0),
        up: UP,
        fovOrHalfHeight: degreesToRadians(60),
        linkedEntityId: null,
        evidenceIds: [EV.stopSign, EV.stopLine],
      },
      {
        name: 'entity_detail',
        projection: 'perspective',
        eye: vec3(signPosition.x + 3, signPosition.y, SIGN_HEIGHT_M),
        target: vec3(signPosition.x, signPosition.y, SIGN_HEIGHT_M),
        up: UP,
        fovOrHalfHeight: degreesToRadians(30),
        linkedEntityId: STOP_SIGN,
        evidenceIds: [EV.stopSign],
      },
    ];
    const pruned = pruneEvidence(evidence, cameraPresets, crossing ? [] : [EV.crossingCar]);
    if (!crossing) notes.push('No crossing vehicle in this variant; a STOP still requires a full stop, and the crossing-vehicle evidence is omitted.');

    return {
      ok: true,
      turns,
      notes,
      diagnostics,
      body: {
        controlRegime: 'stop',
        roads: [local.road, access.road],
        lanes: withOutgoing([...local.lanes, ...access.lanes], movements),
        movements,
        anchors: [
          ...local.anchors,
          ...access.anchors,
          {
            id: CONTROL_LINE,
            kind: 'control_line',
            controlsLaneIds: [ACCESS_WB.id],
            road: { roadId: access.road.id, s: metres(ACCESS_LENGTH - CONTROL_LINE_SETBACK_M), t: metres(h) },
            // Across the westbound lane: kerb to road centre, 1 m before the local road edge.
            polyline: [vec3(CONTROL_LINE_X, -LANE_W), vec3(CONTROL_LINE_X, 0)],
            approachHeading: HEADING.west,
          },
          {
            id: SIGN_BASE,
            kind: 'support_base',
            position: signPosition,
            roadsideOf: { laneId: ACCESS_WB.id, side: 'left' },
            road: { roadId: access.road.id, s: metres(40 - signPosition.x), t: metres(0 - signPosition.y) },
          },
        ],
        markings: [
          {
            id: STOP_LINE,
            role: 'stop_line',
            asset: ref(ASSET_STOP_LINE_J),
            anchorId: CONTROL_LINE,
            applicableLaneIds: [ACCESS_WB.id],
            applicableMovementIds: [MV_ACCESS_LEFT, MV_ACCESS_RIGHT],
            extentM: null,
            sourceRefs: [LOC_RMS2_J],
          },
        ],
        supports: [
          {
            id: STOP_POST,
            asset: ref(ASSET_DEV_SIGN_POST),
            family: 'post',
            baseAnchorId: SIGN_BASE,
            pose: { position: signPosition, yaw: HEADING.north },
            heightM: null,
            dimensionsStatus: 'schematic_unsourced',
          },
        ],
        signFaces: [
          {
            id: STOP_SIGN,
            asset: ref(ASSET_STOP_FACE),
            attachment: {
              supportId: STOP_POST,
              supportAttachmentName: 'top_face_mount',
              partAttachmentName: 'back_centre',
              heightAboveGroundM: metres(SIGN_HEIGHT_M),
            },
            // Asset front is -Y in its own frame; yaw +90° turns it to face +X (east).
            pose: { position: vec3(signPosition.x, signPosition.y, SIGN_HEIGHT_M), yaw: HEADING.north },
            frontNormal: unitVec3(1, 0, 0), // toward westbound approaching traffic
            up: UP,
            intendedApproach: { laneIds: [ACCESS_WB.id], heading: HEADING.west },
            applicableLaneIds: [ACCESS_WB.id],
            applicableMovementIds: [MV_ACCESS_LEFT, MV_ACCESS_RIGHT],
            linkedControlLineIds: [CONTROL_LINE],
            sourceRefs: [LOC_TFM1_STOP, LOC_TP_GIVE_WAY_STOP_MEANING],
          },
        ],
        signalHeads: [],
        signalControllers: [],
        actors: crossing ? [ego, crossing] : [ego],
        conditions: conditionsFor(CONDITIONS, input.variation.daylight ?? 'day'),
        depictedViolations: [],
        evidence: pruned.evidence,
        cameraPresets: pruned.cameraPresets,
      },
    };
  },
};
