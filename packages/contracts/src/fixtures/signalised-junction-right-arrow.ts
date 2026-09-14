import { type DeepReadonly, freezeDeep } from '../immutable';
import { anchorId, entityId, seed, templateId, worldId } from '../ids';
import { FROZEN_WORLD_CONVENTIONS, HEADING, degreesToRadians, metres, unitVec3, vec3 } from '../units';
import { WORLD_SCHEMA_VERSION } from '../version';
import { type Movement, type SignalAspect, type World } from '../world';
import { ASSET_DEV_CAR, ASSET_DEV_SIGNAL_POLE, ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED, ASSET_STOP_LINE_J, ref } from './assets';
import { controlLineAnchorId, movementIdOf, straightRoad, turnPath, withOutgoing } from './build';
import { DEVELOPMENT_ASSET_REGISTRY_HASH, FIXTURE_GENERATOR_VERSION, FIXTURE_SOURCE_PROFILE_ID } from './registry-hash';
import { LOC_RMS2_J, LOC_RULE11_PAIRED_ARROWS, LOC_RULE11_RED_ARROW_PROHIBITS, LOC_RULE11_VERTICAL_ORDER, LOC_TP_SIGNAL_GREEN_RIGHT_RED } from './sources';

/**
 * DEVELOPMENT FIXTURE — signalised crossroads, circular green with red right-turn arrow.
 *
 * North–south local road crosses an east–west local road. The ego car approaches northbound and
 * wants to turn right. Its primary head (vertical circular R/A/G with a paired right-arrow column)
 * shows circular GREEN lit and right-arrow RED lit: straight and left may proceed, right must stop
 * behind the J stop line (Rule 11 red arrow). A symmetric southbound head shows the same state.
 * East–west approach heads are not modelled (no other signal asset exists in the extraction set);
 * their permissions are asserted by the phase plan and flagged in provenance notes.
 * Uses quarantined assets (release_ready=false).
 */

const LANE_W = 3.5;
const ns = straightRoad({
  id: 'ns',
  name: 'North–south road (development fixture)',
  roadClass: 'local',
  start: vec3(0, -70),
  reference: 'north',
  lengthM: 140,
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 50,
});
const ew = straightRoad({
  id: 'ew',
  name: 'East–west road (development fixture)',
  roadClass: 'local',
  start: vec3(-70, 0),
  reference: 'east',
  lengthM: 140,
  laneWidthM: LANE_W,
  lanesWith: 1,
  lanesAgainst: 1,
  speedLimitKmh: 50,
});

const NS_NB = ns.lane('with', 0); // northbound, x = -1.75
const NS_SB = ns.lane('against', 0); // southbound, x = +1.75
const EW_EB = ew.lane('with', 0); // eastbound, y = +1.75
const EW_WB = ew.lane('against', 0); // westbound, y = -1.75

const MV_NB_STRAIGHT = movementIdOf(NS_NB, 'straight');
const MV_NB_LEFT = movementIdOf(NS_NB, 'left'); // to EW_WB
const MV_NB_RIGHT = movementIdOf(NS_NB, 'right'); // to EW_EB, across the southbound lane
const MV_SB_STRAIGHT = movementIdOf(NS_SB, 'straight');
const MV_SB_RIGHT = movementIdOf(NS_SB, 'right'); // to EW_WB, across the northbound lane
const MV_EB_STRAIGHT = movementIdOf(EW_EB, 'straight');
const MV_WB_STRAIGHT = movementIdOf(EW_WB, 'straight');

const movements: readonly Movement[] = [
  {
    id: MV_NB_STRAIGHT,
    fromLaneId: NS_NB,
    toLaneId: NS_NB,
    turn: 'straight',
    path: [vec3(-1.75, -6), vec3(-1.75, 6)],
    priority: 'protected',
    conflictsWith: [MV_EB_STRAIGHT, MV_WB_STRAIGHT, MV_SB_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_NB_LEFT,
    fromLaneId: NS_NB,
    toLaneId: EW_WB,
    turn: 'left',
    path: turnPath(vec3(-1.75, -6), vec3(-1.75, -1.75), vec3(-6, -1.75)),
    priority: 'protected',
    conflictsWith: [MV_WB_STRAIGHT],
    yieldsTo: [],
  },
  {
    id: MV_NB_RIGHT,
    fromLaneId: NS_NB,
    toLaneId: EW_EB,
    turn: 'right',
    path: turnPath(vec3(-1.75, -6), vec3(-1.75, 1.75), vec3(6, 1.75)),
    priority: 'permissive',
    conflictsWith: [MV_SB_STRAIGHT, MV_EB_STRAIGHT, MV_WB_STRAIGHT],
    yieldsTo: [MV_SB_STRAIGHT],
  },
  {
    id: MV_SB_STRAIGHT,
    fromLaneId: NS_SB,
    toLaneId: NS_SB,
    turn: 'straight',
    path: [vec3(1.75, 6), vec3(1.75, -6)],
    priority: 'protected',
    conflictsWith: [MV_EB_STRAIGHT, MV_WB_STRAIGHT, MV_NB_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_SB_RIGHT,
    fromLaneId: NS_SB,
    toLaneId: EW_WB,
    turn: 'right',
    path: turnPath(vec3(1.75, 6), vec3(1.75, -1.75), vec3(-6, -1.75)),
    priority: 'permissive',
    conflictsWith: [MV_NB_STRAIGHT, MV_EB_STRAIGHT, MV_WB_STRAIGHT],
    yieldsTo: [MV_NB_STRAIGHT],
  },
  {
    id: MV_EB_STRAIGHT,
    fromLaneId: EW_EB,
    toLaneId: EW_EB,
    turn: 'straight',
    path: [vec3(-6, 1.75), vec3(6, 1.75)],
    priority: 'protected',
    conflictsWith: [MV_NB_STRAIGHT, MV_NB_RIGHT, MV_SB_STRAIGHT, MV_SB_RIGHT],
    yieldsTo: [],
  },
  {
    id: MV_WB_STRAIGHT,
    fromLaneId: EW_WB,
    toLaneId: EW_WB,
    turn: 'straight',
    path: [vec3(6, -1.75), vec3(-6, -1.75)],
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

export const SIGNAL_SLOTS = Object.freeze({
  circularRed: 'circular_red',
  circularAmber: 'circular_amber',
  circularGreen: 'circular_green',
  rightArrowRed: 'right_arrow_red',
  rightArrowAmber: 'right_arrow_amber',
  rightArrowGreen: 'right_arrow_green',
});

export const SIGNAL_IDS = Object.freeze({
  world: worldId('sg-signal-green-right-red-001'),
  lanes: { nsNorthbound: NS_NB, nsSouthbound: NS_SB, ewEastbound: EW_EB, ewWestbound: EW_WB },
  movements: {
    nbStraight: MV_NB_STRAIGHT,
    nbLeft: MV_NB_LEFT,
    nbRight: MV_NB_RIGHT,
    sbStraight: MV_SB_STRAIGHT,
    sbRight: MV_SB_RIGHT,
    ebStraight: MV_EB_STRAIGHT,
    wbStraight: MV_WB_STRAIGHT,
  },
  anchors: { nbStopLine: NB_STOP_LINE_ANCHOR, sbStopLine: SB_STOP_LINE_ANCHOR, nbPoleBase: NB_POLE_BASE, sbPoleBase: SB_POLE_BASE },
  entities: { nbStopLine: NB_STOP_LINE, sbStopLine: SB_STOP_LINE, nbPole: NB_POLE, sbPole: SB_POLE, nbHead: NB_HEAD, sbHead: SB_HEAD, controller: CONTROLLER, ego: EGO, oncoming: ONCOMING },
  evidence: {
    nbHeadState: 'ev.nb-head-aspects',
    nbStopLine: 'ev.nb-stop-line',
    egoLaneAndIntent: 'ev.ego-lane-intent',
    oncoming: 'ev.oncoming-car',
  },
});

/** Aspects with movement bindings for a northbound-facing head: circular column speaks to straight+left, arrow column to right. */
function aspectsFor(straightAndLeft: readonly Movement['id'][], right: readonly Movement['id'][]): readonly SignalAspect[] {
  return [
    { slot: SIGNAL_SLOTS.circularRed, colour: 'red', shape: 'circular', controlsMovementIds: straightAndLeft },
    { slot: SIGNAL_SLOTS.circularAmber, colour: 'amber', shape: 'circular', controlsMovementIds: straightAndLeft },
    { slot: SIGNAL_SLOTS.circularGreen, colour: 'green', shape: 'circular', controlsMovementIds: straightAndLeft },
    { slot: SIGNAL_SLOTS.rightArrowRed, colour: 'red', shape: 'arrow_right', controlsMovementIds: right },
    { slot: SIGNAL_SLOTS.rightArrowAmber, colour: 'amber', shape: 'arrow_right', controlsMovementIds: right },
    { slot: SIGNAL_SLOTS.rightArrowGreen, colour: 'green', shape: 'arrow_right', controlsMovementIds: right },
  ];
}

const UP = unitVec3(0, 0, 1);
const HEAD_HEIGHT = metres(2.29); // Rule 11 nominal lowest lens centre; not a site measurement
const SIGNAL_SOURCES = [LOC_TP_SIGNAL_GREEN_RIGHT_RED, LOC_RULE11_VERTICAL_ORDER, LOC_RULE11_PAIRED_ARROWS, LOC_RULE11_RED_ARROW_PROHIBITS];

export const SIGNALISED_JUNCTION_RIGHT_ARROW: DeepReadonly<World> = freezeDeep<World>({
  id: SIGNAL_IDS.world,
  schemaVersion: WORLD_SCHEMA_VERSION,
  conventions: FROZEN_WORLD_CONVENTIONS,
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
      controlsLaneIds: [NS_NB],
      road: { roadId: ns.road.id, s: metres(65.5), t: metres(1.75) },
      polyline: [vec3(-3.5, -4.5), vec3(0, -4.5)],
      approachHeading: HEADING.north,
    },
    {
      id: SB_STOP_LINE_ANCHOR,
      kind: 'control_line',
      controlsLaneIds: [NS_SB],
      road: { roadId: ns.road.id, s: metres(74.5), t: metres(-1.75) },
      polyline: [vec3(3.5, 4.5), vec3(0, 4.5)],
      approachHeading: HEADING.south,
    },
    {
      id: NB_POLE_BASE,
      kind: 'support_base',
      position: vec3(-4.1, -5.5, 0),
      roadsideOf: { laneId: NS_NB, side: 'left' },
      road: { roadId: ns.road.id, s: metres(64.5), t: metres(4.1) },
    },
    {
      id: SB_POLE_BASE,
      kind: 'support_base',
      position: vec3(4.1, 5.5, 0),
      roadsideOf: { laneId: NS_SB, side: 'left' },
      road: { roadId: ns.road.id, s: metres(75.5), t: metres(-4.1) },
    },
  ],
  markings: [
    {
      id: NB_STOP_LINE,
      role: 'stop_line',
      asset: ref(ASSET_STOP_LINE_J),
      anchorId: NB_STOP_LINE_ANCHOR,
      applicableLaneIds: [NS_NB],
      applicableMovementIds: [MV_NB_STRAIGHT, MV_NB_LEFT, MV_NB_RIGHT],
      extentM: null,
      sourceRefs: [LOC_RMS2_J],
    },
    {
      id: SB_STOP_LINE,
      role: 'stop_line',
      asset: ref(ASSET_STOP_LINE_J),
      anchorId: SB_STOP_LINE_ANCHOR,
      applicableLaneIds: [NS_SB],
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
      pose: { position: vec3(-4.1, -5.5, 0), yaw: HEADING.east },
      heightM: null,
      dimensionsStatus: 'schematic_unsourced',
    },
    {
      id: SB_POLE,
      asset: ref(ASSET_DEV_SIGNAL_POLE),
      family: 'pole',
      baseAnchorId: SB_POLE_BASE,
      pose: { position: vec3(4.1, 5.5, 0), yaw: HEADING.east },
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
      attachment: { supportId: NB_POLE, supportAttachmentName: 'head_mount', partAttachmentName: 'back_centre', heightAboveGroundM: HEAD_HEIGHT },
      pose: { position: vec3(-4.1, -5.5, 2.29), yaw: HEADING.east },
      frontNormal: unitVec3(0, -1, 0), // faces northbound approaching traffic
      up: UP,
      intendedApproach: { laneIds: [NS_NB], heading: HEADING.north },
      applicableLaneIds: [NS_NB],
      aspects: aspectsFor([MV_NB_STRAIGHT, MV_NB_LEFT], [MV_NB_RIGHT]),
      linkedControlLineIds: [NB_STOP_LINE_ANCHOR],
      sourceRefs: SIGNAL_SOURCES,
    },
    {
      id: SB_HEAD,
      asset: ref(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED),
      controllerId: CONTROLLER,
      attachment: { supportId: SB_POLE, supportAttachmentName: 'head_mount', partAttachmentName: 'back_centre', heightAboveGroundM: HEAD_HEIGHT },
      // Asset front is -Y; yaw 180° turns it to face +Y toward southbound approaching traffic.
      pose: { position: vec3(4.1, 5.5, 2.29), yaw: HEADING.west },
      frontNormal: unitVec3(0, 1, 0),
      up: UP,
      intendedApproach: { laneIds: [NS_SB], heading: HEADING.south },
      applicableLaneIds: [NS_SB],
      aspects: aspectsFor([MV_SB_STRAIGHT], [MV_SB_RIGHT]),
      linkedControlLineIds: [SB_STOP_LINE_ANCHOR],
      sourceRefs: SIGNAL_SOURCES,
    },
  ],
  signalControllers: [
    {
      id: CONTROLLER,
      phasePlanRef: 'dev.ns-through-with-right-held',
      currentPhase: 'ns_through',
      aspectStates: [
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.circularRed, state: 'dark' },
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.circularAmber, state: 'dark' },
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.circularGreen, state: 'lit' },
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.rightArrowRed, state: 'lit' },
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.rightArrowAmber, state: 'dark' },
        { headId: NB_HEAD, slot: SIGNAL_SLOTS.rightArrowGreen, state: 'dark' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.circularRed, state: 'dark' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.circularAmber, state: 'dark' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.circularGreen, state: 'lit' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.rightArrowRed, state: 'lit' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.rightArrowAmber, state: 'dark' },
        { headId: SB_HEAD, slot: SIGNAL_SLOTS.rightArrowGreen, state: 'dark' },
      ],
      movementPermissions: [
        { movementId: MV_NB_STRAIGHT, permission: 'proceed_permissive', governedByAspects: [{ headId: NB_HEAD, slot: SIGNAL_SLOTS.circularGreen }] },
        { movementId: MV_NB_LEFT, permission: 'proceed_permissive', governedByAspects: [{ headId: NB_HEAD, slot: SIGNAL_SLOTS.circularGreen }] },
        {
          movementId: MV_NB_RIGHT,
          permission: 'stop',
          governedByAspects: [
            { headId: NB_HEAD, slot: SIGNAL_SLOTS.rightArrowRed },
            { headId: NB_HEAD, slot: SIGNAL_SLOTS.circularGreen },
          ],
        },
        { movementId: MV_SB_STRAIGHT, permission: 'proceed_permissive', governedByAspects: [{ headId: SB_HEAD, slot: SIGNAL_SLOTS.circularGreen }] },
        {
          movementId: MV_SB_RIGHT,
          permission: 'stop',
          governedByAspects: [
            { headId: SB_HEAD, slot: SIGNAL_SLOTS.rightArrowRed },
            { headId: SB_HEAD, slot: SIGNAL_SLOTS.circularGreen },
          ],
        },
        // East–west heads are not modelled; the phase plan asserts red for these approaches.
        { movementId: MV_EB_STRAIGHT, permission: 'stop', governedByAspects: [] },
        { movementId: MV_WB_STRAIGHT, permission: 'stop', governedByAspects: [] },
      ],
    },
  ],
  actors: [
    {
      id: EGO,
      category: 'car',
      asset: ref(ASSET_DEV_CAR),
      isEgo: true,
      laneId: NS_NB,
      movementId: MV_NB_RIGHT,
      progressM: metres(58), // lane starts at y = -70; centre at y = -12, front at y = -9.75, upstream of the line at y = -4.5
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) },
      frontOffsetM: metres(2.25),
      pose: { position: vec3(-1.75, -12, 0), yaw: HEADING.north },
      intention: 'right',
      indicator: 'right',
      speedKmh: 20,
    },
    {
      id: ONCOMING,
      category: 'car',
      asset: ref(ASSET_DEV_CAR),
      isEgo: false,
      laneId: NS_SB,
      movementId: MV_SB_STRAIGHT,
      progressM: metres(45), // lane starts at y = 70; centre at y = 25
      lateralOffsetM: metres(0),
      dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) },
      frontOffsetM: metres(2.25),
      pose: { position: vec3(1.75, 25, 0), yaw: HEADING.south },
      intention: 'straight',
      indicator: 'none',
      speedKmh: 45,
    },
  ],
  conditions: {
    localDateTime: '2026-03-14T20:15:00',
    weekday: 'sat',
    publicHoliday: false,
    weather: 'clear',
    visibility: 'clear',
    surface: 'dry',
    daylight: 'night',
    egoVehicleClass: 'car',
  },
  depictedViolations: [],
  evidence: [
    {
      id: SIGNAL_IDS.evidence.nbHeadState,
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
      id: SIGNAL_IDS.evidence.nbStopLine,
      targetEntityIds: [NB_STOP_LINE],
      requiredDetail: 'presence',
      allowedViews: ['plan', 'study_oblique', 'approach_ego'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.1,
      minProjectedSizePx: 24,
      coVisibleWith: [SIGNAL_IDS.evidence.egoLaneAndIntent],
      contextAnchorIds: [NB_STOP_LINE_ANCHOR],
    },
    {
      id: SIGNAL_IDS.evidence.egoLaneAndIntent,
      targetEntityIds: [EGO, NS_NB, MV_NB_RIGHT],
      requiredDetail: 'lane_association',
      allowedViews: ['plan', 'study_oblique', 'approach_ego'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: 32,
      coVisibleWith: [],
      contextAnchorIds: [],
    },
    {
      id: SIGNAL_IDS.evidence.oncoming,
      targetEntityIds: [ONCOMING, NS_SB],
      requiredDetail: 'relative_position',
      allowedViews: ['plan', 'study_oblique'],
      mustBeFrontFacing: false,
      maxOcclusionFraction: 0.2,
      minProjectedSizePx: 32,
      coVisibleWith: [SIGNAL_IDS.evidence.egoLaneAndIntent],
      contextAnchorIds: [],
    },
  ],
  cameraPresets: [
    {
      name: 'plan',
      projection: 'orthographic',
      eye: vec3(0, 0, 80),
      target: vec3(0, 0, 0),
      up: unitVec3(0, 1, 0),
      fovOrHalfHeight: 30,
      linkedEntityId: null,
      evidenceIds: [SIGNAL_IDS.evidence.nbStopLine, SIGNAL_IDS.evidence.egoLaneAndIntent, SIGNAL_IDS.evidence.oncoming],
    },
    {
      name: 'study_oblique',
      projection: 'orthographic',
      eye: vec3(-35, -45, 35),
      target: vec3(0, 0, 0),
      up: UP,
      fovOrHalfHeight: 22,
      linkedEntityId: null,
      evidenceIds: [SIGNAL_IDS.evidence.nbStopLine, SIGNAL_IDS.evidence.egoLaneAndIntent, SIGNAL_IDS.evidence.oncoming],
    },
    {
      name: 'approach_ego',
      projection: 'perspective',
      eye: vec3(-1.75, -14, 1.2),
      target: vec3(-2.5, 0, 1.6),
      up: UP,
      fovOrHalfHeight: degreesToRadians(60),
      linkedEntityId: null,
      evidenceIds: [SIGNAL_IDS.evidence.nbHeadState, SIGNAL_IDS.evidence.nbStopLine, SIGNAL_IDS.evidence.egoLaneAndIntent],
    },
    {
      name: 'entity_detail',
      projection: 'perspective',
      eye: vec3(-4.1, -9.5, 2.29),
      target: vec3(-4.1, -5.5, 2.29),
      up: UP,
      fovOrHalfHeight: degreesToRadians(30),
      linkedEntityId: NB_HEAD,
      evidenceIds: [SIGNAL_IDS.evidence.nbHeadState],
    },
  ],
  provenance: {
    key: {
      generatorVersion: FIXTURE_GENERATOR_VERSION,
      worldSchemaVersion: WORLD_SCHEMA_VERSION,
      template: { id: templateId('sg.crossroads.signalised'), version: 1 },
      seed: seed('ottie-signal-fixture-001'),
      assetRegistryHash: DEVELOPMENT_ASSET_REGISTRY_HASH,
      sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
    },
    generatedAt: null,
    parameters: { egoApproach: 'south', egoMovement: 'right', phase: 'ns_through', nsCircular: 'green', nsRightArrow: 'red', oncoming: { category: 'car', movement: 'straight' } },
    canonicalHash: null,
    status: 'development_fixture',
    usesQuarantinedAssets: true,
    notes: [
      'Hand-authored F0 development fixture; not generated, not reviewed, not release content.',
      'Signal head housing, column spacing, pole height and mount are unknown in the source (assembly-definitions.json); poles are schematic and the 2.29 m lens height is the Rule 11 nominal, not a site value.',
      'Only the north–south approach heads are modelled because the extraction set holds one signal head reference; east–west permissions are asserted by the phase plan with empty governedByAspects.',
      'The source illustration is the Traffic Police handbook PDF page 47 (printed 46): circular green retained while the right-arrow is red.',
    ],
  },
});
