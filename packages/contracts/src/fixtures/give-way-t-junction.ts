import { type DeepReadonly, freezeDeep } from '../immutable';
import { anchorId, entityId, seed, templateId, worldId } from '../ids';
import { FROZEN_WORLD_CONVENTIONS, HEADING, degreesToRadians, metres, unitVec3, vec3 } from '../units';
import { WORLD_SCHEMA_VERSION } from '../version';
import { type Movement, type World } from '../world';
import { ASSET_DEV_BUS, ASSET_DEV_CAR, ASSET_DEV_SIGN_POST, ASSET_GIVE_WAY_FACE, ASSET_GIVE_WAY_LINE_D, ref } from './assets';
import { controlLineAnchorId, movementIdOf, straightRoad, turnPath, withOutgoing } from './build';
import { DEVELOPMENT_ASSET_REGISTRY_HASH, FIXTURE_GENERATOR_VERSION, FIXTURE_SOURCE_PROFILE_ID } from './registry-hash';
import { LOC_RMS2_D, LOC_TFM1_GIVE_WAY, LOC_TP_GIVE_WAY_STOP_MEANING } from './sources';

/**
 * DEVELOPMENT FIXTURE — Give Way T junction.
 *
 * Minor access road from the south meets an east–west major road. The ego car approaches
 * northbound in the left-hand lane, front upstream of the RMS2-D double broken rows, with a
 * Give Way face mounted on a schematic post facing the approach. A bus travels west on the major
 * road. Unsignalised: no heads, no controller. Uses quarantined assets (release_ready=false).
 */

const LANE_W = 3.5;
const major = straightRoad({
  id: 'major',
  name: 'Major road (development fixture)',
  roadClass: 'major',
  start: vec3(-60, 0),
  reference: 'east',
  lengthM: 120,
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 50,
});
const minor = straightRoad({
  id: 'minor',
  name: 'Minor access road (development fixture)',
  roadClass: 'minor_access',
  start: vec3(0, -50),
  reference: 'north',
  lengthM: 46.5, // ends at the major road's southern edge (y = -3.5)
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 40,
});

const MAJOR_EB = major.lane('with', 0); // eastbound, y = +1.75
const MAJOR_WB = major.lane('against', 0); // westbound, y = -1.75
const MINOR_NB = minor.lane('with', 0); // northbound toward the junction, x = -1.75
const MINOR_SB = minor.lane('against', 0); // southbound away from the junction, x = +1.75

const MV_MINOR_LEFT = movementIdOf(MINOR_NB, 'left');
const MV_MINOR_RIGHT = movementIdOf(MINOR_NB, 'right');
const MV_MAJOR_EB_STRAIGHT = movementIdOf(MAJOR_EB, 'straight');
const MV_MAJOR_EB_RIGHT = movementIdOf(MAJOR_EB, 'right');
const MV_MAJOR_WB_STRAIGHT = movementIdOf(MAJOR_WB, 'straight');
const MV_MAJOR_WB_LEFT = movementIdOf(MAJOR_WB, 'left');

const movements: readonly Movement[] = [
  {
    id: MV_MINOR_LEFT,
    fromLaneId: MINOR_NB,
    toLaneId: MAJOR_WB,
    turn: 'left',
    path: turnPath(vec3(-1.75, -3.5), vec3(-1.75, -1.75), vec3(-6, -1.75)),
    priority: 'yield',
    conflictsWith: [MV_MAJOR_WB_STRAIGHT],
    yieldsTo: [MV_MAJOR_WB_STRAIGHT],
  },
  {
    id: MV_MINOR_RIGHT,
    fromLaneId: MINOR_NB,
    toLaneId: MAJOR_EB,
    turn: 'right',
    path: turnPath(vec3(-1.75, -3.5), vec3(-1.75, 1.75), vec3(6, 1.75)),
    priority: 'yield',
    conflictsWith: [MV_MAJOR_WB_STRAIGHT, MV_MAJOR_EB_STRAIGHT, MV_MAJOR_EB_RIGHT],
    yieldsTo: [MV_MAJOR_WB_STRAIGHT, MV_MAJOR_EB_STRAIGHT, MV_MAJOR_EB_RIGHT],
  },
  {
    id: MV_MAJOR_EB_STRAIGHT,
    fromLaneId: MAJOR_EB,
    toLaneId: MAJOR_EB,
    turn: 'straight',
    path: [vec3(-6, 1.75), vec3(6, 1.75)],
    priority: 'protected',
    conflictsWith: [MV_MINOR_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_MAJOR_EB_RIGHT,
    fromLaneId: MAJOR_EB,
    toLaneId: MINOR_SB,
    turn: 'right',
    path: turnPath(vec3(-6, 1.75), vec3(1.75, 1.75), vec3(1.75, -6)),
    priority: 'permissive',
    conflictsWith: [MV_MAJOR_WB_STRAIGHT, MV_MINOR_RIGHT],
    yieldsTo: [MV_MAJOR_WB_STRAIGHT],
  },
  {
    id: MV_MAJOR_WB_STRAIGHT,
    fromLaneId: MAJOR_WB,
    toLaneId: MAJOR_WB,
    turn: 'straight',
    path: [vec3(6, -1.75), vec3(-6, -1.75)],
    priority: 'protected',
    conflictsWith: [MV_MINOR_LEFT, MV_MINOR_RIGHT, MV_MAJOR_EB_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_MAJOR_WB_LEFT,
    fromLaneId: MAJOR_WB,
    toLaneId: MINOR_SB,
    turn: 'left',
    path: turnPath(vec3(6, -1.75), vec3(1.75, -1.75), vec3(1.75, -6)),
    priority: 'protected',
    conflictsWith: [],
    yieldsTo: [],
  },
];

const CONTROL_LINE = controlLineAnchorId('minor.approach');
const SIGN_BASE = anchorId('minor.approach.sign-base');
const GIVE_WAY_LINE = entityId('minor.give-way-line');
const GIVE_WAY_POST = entityId('minor.give-way-post');
const GIVE_WAY_SIGN = entityId('minor.give-way-sign');
const EGO = entityId('ego.car');
const BUS = entityId('major.bus');

export const GIVE_WAY_IDS = Object.freeze({
  world: worldId('sg-give-way-t-001'),
  lanes: { majorEastbound: MAJOR_EB, majorWestbound: MAJOR_WB, minorNorthbound: MINOR_NB, minorSouthbound: MINOR_SB },
  movements: {
    minorLeft: MV_MINOR_LEFT,
    minorRight: MV_MINOR_RIGHT,
    majorEbStraight: MV_MAJOR_EB_STRAIGHT,
    majorEbRight: MV_MAJOR_EB_RIGHT,
    majorWbStraight: MV_MAJOR_WB_STRAIGHT,
    majorWbLeft: MV_MAJOR_WB_LEFT,
  },
  anchors: { controlLine: CONTROL_LINE, signBase: SIGN_BASE },
  entities: { giveWayLine: GIVE_WAY_LINE, giveWayPost: GIVE_WAY_POST, giveWaySign: GIVE_WAY_SIGN, ego: EGO, bus: BUS },
  evidence: {
    giveWayLine: 'ev.give-way-line',
    giveWaySign: 'ev.give-way-sign',
    majorBus: 'ev.major-bus',
    egoLane: 'ev.ego-lane',
    priority: 'ev.priority-relationship',
  },
});

const FACING_SOUTH = unitVec3(0, -1, 0); // toward northbound approaching traffic
const UP = unitVec3(0, 0, 1);

export const GIVE_WAY_T_JUNCTION: DeepReadonly<World> = freezeDeep<World>({
  id: GIVE_WAY_IDS.world,
  schemaVersion: WORLD_SCHEMA_VERSION,
  conventions: FROZEN_WORLD_CONVENTIONS,
  controlRegime: 'give_way',
  roads: [major.road, minor.road],
  lanes: withOutgoing([...major.lanes, ...minor.lanes], movements),
  movements,
  anchors: [
    ...major.anchors,
    ...minor.anchors,
    {
      id: CONTROL_LINE,
      kind: 'control_line',
      controlsLaneIds: [MINOR_NB],
      road: { roadId: minor.road.id, s: metres(45.5), t: metres(1.75) },
      // Transverse across the northbound lane only: kerb (x=-3.5) to the road centre (x=0), 1 m before the major road edge.
      polyline: [vec3(-3.5, -4.5), vec3(0, -4.5)],
      approachHeading: HEADING.north,
    },
    {
      id: SIGN_BASE,
      kind: 'support_base',
      position: vec3(-4.1, -8, 0),
      roadsideOf: { laneId: MINOR_NB, side: 'left' },
      road: { roadId: minor.road.id, s: metres(42), t: metres(4.1) },
    },
  ],
  markings: [
    {
      id: GIVE_WAY_LINE,
      role: 'give_way_line',
      asset: ref(ASSET_GIVE_WAY_LINE_D),
      anchorId: CONTROL_LINE,
      applicableLaneIds: [MINOR_NB],
      applicableMovementIds: [MV_MINOR_LEFT, MV_MINOR_RIGHT],
      extentM: null,
      sourceRefs: [LOC_RMS2_D],
    },
  ],
  supports: [
    {
      id: GIVE_WAY_POST,
      asset: ref(ASSET_DEV_SIGN_POST),
      family: 'post',
      baseAnchorId: SIGN_BASE,
      pose: { position: vec3(-4.1, -8, 0), yaw: HEADING.east },
      heightM: null,
      dimensionsStatus: 'schematic_unsourced',
    },
  ],
  signFaces: [
    {
      id: GIVE_WAY_SIGN,
      asset: ref(ASSET_GIVE_WAY_FACE),
      attachment: {
        supportId: GIVE_WAY_POST,
        supportAttachmentName: 'top_face_mount',
        partAttachmentName: 'back_centre',
        heightAboveGroundM: metres(2.1),
      },
      pose: { position: vec3(-4.1, -8, 2.1), yaw: HEADING.east },
      frontNormal: FACING_SOUTH,
      up: UP,
      intendedApproach: { laneIds: [MINOR_NB], heading: HEADING.north },
      applicableLaneIds: [MINOR_NB],
      applicableMovementIds: [MV_MINOR_LEFT, MV_MINOR_RIGHT],
      linkedControlLineIds: [CONTROL_LINE],
      sourceRefs: [LOC_TFM1_GIVE_WAY, LOC_TP_GIVE_WAY_STOP_MEANING],
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
      laneId: MINOR_NB,
      movementId: MV_MINOR_LEFT,
      progressM: metres(38), // centre at y = -12; front at y = -9.75, upstream of the line at y = -4.5
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) },
      frontOffsetM: metres(2.25),
      pose: { position: vec3(-1.75, -12, 0), yaw: HEADING.north },
      intention: 'left',
      indicator: 'left',
      speedKmh: 15,
    },
    {
      id: BUS,
      category: 'bus',
      asset: ref(ASSET_DEV_BUS),
      isEgo: false,
      laneId: MAJOR_WB,
      movementId: MV_MAJOR_WB_STRAIGHT,
      progressM: metres(35), // westbound lane starts at x = 60; centre at x = 25
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(12), width: metres(2.5), height: metres(3.2) },
      frontOffsetM: metres(6),
      pose: { position: vec3(25, -1.75, 0), yaw: HEADING.west },
      intention: 'straight',
      indicator: 'none',
      speedKmh: 40,
    },
  ],
  conditions: {
    localDateTime: '2026-03-10T10:00:00',
    weekday: 'tue',
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
      id: GIVE_WAY_IDS.evidence.giveWayLine,
      targetEntityIds: [GIVE_WAY_LINE],
      requiredDetail: 'row_count',
      allowedViews: ['plan', 'study_oblique', 'approach_ego'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.1,
      minProjectedSizePx: 24,
      coVisibleWith: [GIVE_WAY_IDS.evidence.egoLane],
      contextAnchorIds: [CONTROL_LINE],
    },
    {
      id: GIVE_WAY_IDS.evidence.giveWaySign,
      targetEntityIds: [GIVE_WAY_SIGN],
      requiredDetail: 'readable_face',
      allowedViews: ['approach_ego', 'entity_detail'],
      mustBeFrontFacing: true,
      maxOcclusionFraction: 0.05,
      minProjectedSizePx: 44,
      coVisibleWith: [],
      contextAnchorIds: [SIGN_BASE],
    },
    {
      id: GIVE_WAY_IDS.evidence.majorBus,
      targetEntityIds: [BUS],
      requiredDetail: 'relative_position',
      allowedViews: ['plan', 'study_oblique'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: 32,
      coVisibleWith: [GIVE_WAY_IDS.evidence.egoLane],
      contextAnchorIds: [],
    },
    {
      id: GIVE_WAY_IDS.evidence.egoLane,
      targetEntityIds: [EGO, MINOR_NB],
      requiredDetail: 'lane_association',
      allowedViews: ['plan', 'study_oblique', 'approach_ego'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: 32,
      coVisibleWith: [],
      contextAnchorIds: [],
    },
    {
      id: GIVE_WAY_IDS.evidence.priority,
      targetEntityIds: [MV_MINOR_LEFT, MV_MAJOR_WB_STRAIGHT],
      requiredDetail: 'relative_position',
      allowedViews: ['plan', 'study_oblique'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: null,
      coVisibleWith: [GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.majorBus],
      contextAnchorIds: [CONTROL_LINE],
    },
  ],
  cameraPresets: [
    {
      name: 'plan',
      projection: 'orthographic',
      eye: vec3(0, -8, 80),
      target: vec3(0, -8, 0),
      up: unitVec3(0, 1, 0),
      fovOrHalfHeight: 26,
      linkedEntityId: null,
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.majorBus, GIVE_WAY_IDS.evidence.egoLane, GIVE_WAY_IDS.evidence.priority],
    },
    {
      name: 'study_oblique',
      projection: 'orthographic',
      eye: vec3(-30, -45, 32),
      target: vec3(0, -6, 0),
      up: UP,
      fovOrHalfHeight: 20,
      linkedEntityId: null,
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.majorBus, GIVE_WAY_IDS.evidence.egoLane, GIVE_WAY_IDS.evidence.priority],
    },
    {
      name: 'approach_ego',
      projection: 'perspective',
      eye: vec3(-1.75, -14, 1.2),
      target: vec3(-1.75, 0, 1.0),
      up: UP,
      fovOrHalfHeight: degreesToRadians(60),
      linkedEntityId: null,
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWaySign, GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.egoLane],
    },
    {
      name: 'entity_detail',
      projection: 'perspective',
      eye: vec3(-4.1, -11, 2.1),
      target: vec3(-4.1, -8, 2.1),
      up: UP,
      fovOrHalfHeight: degreesToRadians(30),
      linkedEntityId: GIVE_WAY_SIGN,
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWaySign],
    },
  ],
  provenance: {
    key: {
      generatorVersion: FIXTURE_GENERATOR_VERSION,
      worldSchemaVersion: WORLD_SCHEMA_VERSION,
      template: { id: templateId('sg.t-junction.give-way'), version: 1 },
      seed: seed('ottie-give-way-fixture-001'),
      assetRegistryHash: DEVELOPMENT_ASSET_REGISTRY_HASH,
      sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
    },
    generatedAt: null,
    parameters: { minorApproach: 'south', egoMovement: 'left', majorRoadVehicle: { category: 'bus', approach: 'east', movement: 'straight' }, control: 'give_way' },
    canonicalHash: null,
    status: 'development_fixture',
    usesQuarantinedAssets: true,
    notes: [
      'Hand-authored F0 development fixture; not generated, not reviewed, not release content.',
      'Sign mounting height 2.1 m, post, vehicle sizes and the 1 m line setback are schematic teaching choices, not source values.',
      'Give Way meaning: Traffic Police handbook PDF page 11 (printed 10): "Slow down. Stop if necessary. Give way to traffic on major road."',
    ],
  },
});
