import { type DeepReadonly, freezeDeep } from '../immutable';
import { anchorId, entityId, seed, templateId, worldId } from '../ids';
import { FROZEN_WORLD_CONVENTIONS, HEADING, degreesToRadians, metres, unitVec3, vec3 } from '../units';
import { WORLD_SCHEMA_VERSION } from '../version';
import { type Movement, type World } from '../world';
import { ASSET_DEV_CAR, ASSET_DEV_SIGN_POST, ASSET_STOP_FACE, ASSET_STOP_LINE_J, ref } from './assets';
import { controlLineAnchorId, movementIdOf, straightRoad, turnPath, withOutgoing } from './build';
import { DEVELOPMENT_ASSET_REGISTRY_HASH, FIXTURE_GENERATOR_VERSION, FIXTURE_SOURCE_PROFILE_ID } from './registry-hash';
import { LOC_RMS2_J, LOC_TFM1_STOP, LOC_TP_GIVE_WAY_STOP_MEANING } from './sources';

/**
 * DEVELOPMENT FIXTURE — STOP at a development access.
 *
 * A development access road from the east joins a north–south local road. The ego car approaches
 * westbound, front upstream of the RMS2-J 300 mm continuous transverse stop line (role
 * `stop_line`), with a STOP face on a schematic post facing the approach. A second car travels
 * south on the local road from the ego's right. Uses quarantined assets (release_ready=false).
 */

const LANE_W = 3.25;
const local = straightRoad({
  id: 'local',
  name: 'Local road (development fixture)',
  roadClass: 'local',
  start: vec3(0, 50),
  reference: 'south',
  lengthM: 100,
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 50,
});
const access = straightRoad({
  id: 'access',
  name: 'Development access (development fixture)',
  roadClass: 'development_access',
  start: vec3(40, 0),
  reference: 'west',
  lengthM: 36.75, // ends at the local road's eastern edge (x = 3.25)
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 30,
});

const LOCAL_SB = local.lane('with', 0); // southbound; LEFT of south is east, so x = +1.625
const LOCAL_NB = local.lane('against', 0); // northbound, x = -1.625
const ACCESS_WB = access.lane('with', 0); // westbound toward the junction; LEFT of west is south: y = -1.625
const ACCESS_EB = access.lane('against', 0); // eastbound away; y = +1.625

const MV_ACCESS_LEFT = movementIdOf(ACCESS_WB, 'left'); // to LOCAL_SB
const MV_ACCESS_RIGHT = movementIdOf(ACCESS_WB, 'right'); // to LOCAL_NB
const MV_LOCAL_SB_STRAIGHT = movementIdOf(LOCAL_SB, 'straight');
const MV_LOCAL_SB_LEFT = movementIdOf(LOCAL_SB, 'left'); // to ACCESS_EB
const MV_LOCAL_NB_STRAIGHT = movementIdOf(LOCAL_NB, 'straight');
const MV_LOCAL_NB_RIGHT = movementIdOf(LOCAL_NB, 'right'); // to ACCESS_EB

const movements: readonly Movement[] = [
  {
    id: MV_ACCESS_LEFT,
    fromLaneId: ACCESS_WB,
    toLaneId: LOCAL_SB,
    turn: 'left',
    path: turnPath(vec3(3.25, -1.625), vec3(1.625, -1.625), vec3(1.625, -6)),
    priority: 'stop_then_yield',
    conflictsWith: [MV_LOCAL_SB_STRAIGHT],
    yieldsTo: [MV_LOCAL_SB_STRAIGHT],
  },
  {
    id: MV_ACCESS_RIGHT,
    fromLaneId: ACCESS_WB,
    toLaneId: LOCAL_NB,
    turn: 'right',
    path: turnPath(vec3(3.25, -1.625), vec3(-1.625, -1.625), vec3(-1.625, 6)),
    priority: 'stop_then_yield',
    conflictsWith: [MV_LOCAL_SB_STRAIGHT, MV_LOCAL_NB_STRAIGHT, MV_LOCAL_SB_LEFT],
    yieldsTo: [MV_LOCAL_SB_STRAIGHT, MV_LOCAL_NB_STRAIGHT, MV_LOCAL_SB_LEFT],
  },
  {
    id: MV_LOCAL_SB_STRAIGHT,
    fromLaneId: LOCAL_SB,
    toLaneId: LOCAL_SB,
    turn: 'straight',
    path: [vec3(1.625, 6), vec3(1.625, -6)],
    priority: 'protected',
    conflictsWith: [MV_ACCESS_LEFT, MV_ACCESS_RIGHT, MV_LOCAL_NB_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_LOCAL_SB_LEFT,
    fromLaneId: LOCAL_SB,
    toLaneId: ACCESS_EB,
    turn: 'left',
    path: turnPath(vec3(1.625, 6), vec3(1.625, 1.625), vec3(6, 1.625)),
    priority: 'protected',
    conflictsWith: [MV_ACCESS_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_LOCAL_NB_STRAIGHT,
    fromLaneId: LOCAL_NB,
    toLaneId: LOCAL_NB,
    turn: 'straight',
    path: [vec3(-1.625, -6), vec3(-1.625, 6)],
    priority: 'protected',
    conflictsWith: [MV_ACCESS_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_LOCAL_NB_RIGHT,
    fromLaneId: LOCAL_NB,
    toLaneId: ACCESS_EB,
    turn: 'right',
    path: turnPath(vec3(-1.625, -6), vec3(-1.625, 1.625), vec3(6, 1.625)),
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

export const STOP_IDS = Object.freeze({
  world: worldId('sg-stop-access-001'),
  lanes: { localSouthbound: LOCAL_SB, localNorthbound: LOCAL_NB, accessWestbound: ACCESS_WB, accessEastbound: ACCESS_EB },
  movements: {
    accessLeft: MV_ACCESS_LEFT,
    accessRight: MV_ACCESS_RIGHT,
    localSbStraight: MV_LOCAL_SB_STRAIGHT,
    localSbLeft: MV_LOCAL_SB_LEFT,
    localNbStraight: MV_LOCAL_NB_STRAIGHT,
    localNbRight: MV_LOCAL_NB_RIGHT,
  },
  anchors: { controlLine: CONTROL_LINE, signBase: SIGN_BASE },
  entities: { stopLine: STOP_LINE, stopPost: STOP_POST, stopSign: STOP_SIGN, ego: EGO, crossingCar: CROSSING_CAR },
  evidence: {
    stopLine: 'ev.stop-line',
    stopSign: 'ev.stop-sign',
    egoFrontBeforeLine: 'ev.ego-before-line',
    crossingCar: 'ev.crossing-car',
  },
});

const FACING_EAST = unitVec3(1, 0, 0); // toward westbound approaching traffic
const UP = unitVec3(0, 0, 1);

export const STOP_DEVELOPMENT_ACCESS: DeepReadonly<World> = freezeDeep<World>({
  id: STOP_IDS.world,
  schemaVersion: WORLD_SCHEMA_VERSION,
  conventions: FROZEN_WORLD_CONVENTIONS,
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
      controlsLaneIds: [ACCESS_WB],
      road: { roadId: access.road.id, s: metres(35.75), t: metres(1.625) },
      // Across the westbound lane: kerb (y = -3.25) to road centre (y = 0), 1 m before the local road edge (x = 4.25).
      polyline: [vec3(4.25, -3.25), vec3(4.25, 0)],
      approachHeading: HEADING.west,
    },
    {
      id: SIGN_BASE,
      kind: 'support_base',
      position: vec3(7.5, -3.85, 0),
      roadsideOf: { laneId: ACCESS_WB, side: 'left' },
      road: { roadId: access.road.id, s: metres(32.5), t: metres(3.85) },
    },
  ],
  markings: [
    {
      id: STOP_LINE,
      role: 'stop_line',
      asset: ref(ASSET_STOP_LINE_J),
      anchorId: CONTROL_LINE,
      applicableLaneIds: [ACCESS_WB],
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
      pose: { position: vec3(7.5, -3.85, 0), yaw: HEADING.north },
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
        heightAboveGroundM: metres(2.1),
      },
      // Asset front is -Y in its own frame; yaw +90° turns it to face +X (east).
      pose: { position: vec3(7.5, -3.85, 2.1), yaw: HEADING.north },
      frontNormal: FACING_EAST,
      up: UP,
      intendedApproach: { laneIds: [ACCESS_WB], heading: HEADING.west },
      applicableLaneIds: [ACCESS_WB],
      applicableMovementIds: [MV_ACCESS_LEFT, MV_ACCESS_RIGHT],
      linkedControlLineIds: [CONTROL_LINE],
      sourceRefs: [LOC_TFM1_STOP, LOC_TP_GIVE_WAY_STOP_MEANING],
    },
  ],
  signalHeads: [],
  signalControllers: [],
  actors: [
    {
      id: EGO,
      category: 'car',
      asset: ref(ASSET_DEV_CAR),
      isEgo: true,
      laneId: ACCESS_WB,
      movementId: MV_ACCESS_RIGHT,
      progressM: metres(29), // lane starts at x = 40; centre at x = 11, front at x = 8.75, upstream of the line at x = 4.25
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) },
      frontOffsetM: metres(2.25),
      pose: { position: vec3(11, -1.625, 0), yaw: HEADING.west },
      intention: 'right',
      indicator: 'right',
      speedKmh: 10,
    },
    {
      id: CROSSING_CAR,
      category: 'car',
      asset: ref(ASSET_DEV_CAR),
      isEgo: false,
      laneId: LOCAL_SB,
      movementId: MV_LOCAL_SB_STRAIGHT,
      progressM: metres(30), // lane starts at y = 50; centre at y = 20, approaching from the ego's right
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) },
      frontOffsetM: metres(2.25),
      pose: { position: vec3(1.625, 20, 0), yaw: HEADING.south },
      intention: 'straight',
      indicator: 'none',
      speedKmh: 40,
    },
  ],
  conditions: {
    localDateTime: '2026-03-12T17:30:00',
    weekday: 'thu',
    publicHoliday: false,
    weather: 'clear',
    visibility: 'clear',
    surface: 'dry',
    daylight: 'day',
    egoVehicleClass: 'car',
  },
  depictedViolations: [],
  evidence: [
    {
      id: STOP_IDS.evidence.stopLine,
      targetEntityIds: [STOP_LINE],
      requiredDetail: 'presence',
      allowedViews: ['plan', 'study_oblique', 'approach_ego'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.1,
      minProjectedSizePx: 24,
      coVisibleWith: [STOP_IDS.evidence.egoFrontBeforeLine],
      contextAnchorIds: [CONTROL_LINE],
    },
    {
      id: STOP_IDS.evidence.stopSign,
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
      id: STOP_IDS.evidence.egoFrontBeforeLine,
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
      id: STOP_IDS.evidence.crossingCar,
      targetEntityIds: [CROSSING_CAR, LOCAL_SB],
      requiredDetail: 'lane_association',
      allowedViews: ['plan', 'study_oblique'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: 32,
      coVisibleWith: [STOP_IDS.evidence.egoFrontBeforeLine],
      contextAnchorIds: [],
    },
  ],
  cameraPresets: [
    {
      name: 'plan',
      projection: 'orthographic',
      eye: vec3(8, 4, 80),
      target: vec3(8, 4, 0),
      up: unitVec3(0, 1, 0),
      fovOrHalfHeight: 24,
      linkedEntityId: null,
      evidenceIds: [STOP_IDS.evidence.stopLine, STOP_IDS.evidence.egoFrontBeforeLine, STOP_IDS.evidence.crossingCar],
    },
    {
      name: 'study_oblique',
      projection: 'orthographic',
      eye: vec3(40, -30, 30),
      target: vec3(6, 2, 0),
      up: UP,
      fovOrHalfHeight: 18,
      linkedEntityId: null,
      evidenceIds: [STOP_IDS.evidence.stopLine, STOP_IDS.evidence.egoFrontBeforeLine, STOP_IDS.evidence.crossingCar],
    },
    {
      name: 'approach_ego',
      projection: 'perspective',
      eye: vec3(13, -1.625, 1.2),
      target: vec3(0, -1.625, 1.0),
      up: UP,
      fovOrHalfHeight: degreesToRadians(60),
      linkedEntityId: null,
      evidenceIds: [STOP_IDS.evidence.stopSign, STOP_IDS.evidence.stopLine],
    },
    {
      name: 'entity_detail',
      projection: 'perspective',
      eye: vec3(10.5, -3.85, 2.1),
      target: vec3(7.5, -3.85, 2.1),
      up: UP,
      fovOrHalfHeight: degreesToRadians(30),
      linkedEntityId: STOP_SIGN,
      evidenceIds: [STOP_IDS.evidence.stopSign],
    },
  ],
  provenance: {
    key: {
      generatorVersion: FIXTURE_GENERATOR_VERSION,
      worldSchemaVersion: WORLD_SCHEMA_VERSION,
      template: { id: templateId('sg.t-junction.stop'), version: 1 },
      seed: seed('ottie-stop-fixture-001'),
      assetRegistryHash: DEVELOPMENT_ASSET_REGISTRY_HASH,
      sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
    },
    generatedAt: null,
    parameters: { accessApproach: 'east', egoMovement: 'right', crossingVehicle: { category: 'car', approach: 'north', movement: 'straight' }, control: 'stop' },
    canonicalHash: null,
    status: 'development_fixture',
    usesQuarantinedAssets: true,
    notes: [
      'Hand-authored F0 development fixture; not generated, not reviewed, not release content.',
      'J is used here in its stop_line role; the same geometry as a paved-shoulder boundary is a different role and must not be confused.',
      'Sign mounting height 2.1 m, post, vehicle sizes and the 1 m line setback are schematic teaching choices, not source values.',
      'STOP meaning: Traffic Police handbook PDF page 11 (printed 10): "Stop before the white line. Give way to traffic from the right and left."',
    ],
  },
});
