import { type CameraPreset, type CompassDirection, type Diagnostic, type EvidenceRequirement, type Movement, type MovementId, HEADING, anchorId, degreesToRadians, entityId, metres, templateId, unitVec3, vec3 } from '@ottie/contracts';
import {
  ASSET_DEV_SIGN_POST,
  ASSET_GIVE_WAY_FACE,
  ASSET_GIVE_WAY_LINE_D,
  GIVE_WAY_IDS,
  LOC_RMS2_D,
  LOC_TFM1_GIVE_WAY,
  LOC_TP_GIVE_WAY_STOP_MEANING,
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
  type VehicleCategory,
  actorWithoutAssetDiagnostic,
  conditionsFor,
  placeActor,
  pruneEvidence,
  toCanonicalCompass,
  turnIndicator,
  withOutgoing,
} from './shared';

/**
 * Give Way T junction: a minor access road joins an east–west major road. Canonical orientation
 * has the minor road arriving from the SOUTH; other `minorApproach` values are exact quarter-turn
 * rotations of the same semantic world. Priority is fixed by the control regime: every minor-road
 * movement yields to every conflicting major-road movement, whatever the drawing looks like.
 */

const LANE_W = 3.5;
const MAJOR_LENGTH = 120;
const MINOR_LENGTH = 46.5; // ends at the major road's southern edge (y = -3.5)
const MAJOR_HALF = MAJOR_LENGTH / 2;
const CONTROL_LINE_Y = -LANE_W - CONTROL_LINE_SETBACK_M; // -4.5
const EGO_PROGRESS_M = 38; // centre at y = -12; front at y = -9.75, upstream of the line
const VEHICLE_SPEED_KMH = 40;
const EGO_SPEED_KMH = 15;
const SIGN_HEIGHT_M = 2.1;

const EGO_TURNS: readonly ('left' | 'right')[] = ['left', 'right'];
const VEHICLE_CATEGORIES: readonly VehicleCategory[] = ['car', 'bus', 'lorry', 'motorcycle'];
const VEHICLE_APPROACHES: readonly ('east' | 'west' | 'none')[] = ['east', 'west', 'none'];
const MINOR_APPROACHES: readonly CompassDirection[] = ['south', 'north', 'east', 'west'];

const CONDITIONS = {
  date: '2026-03-10',
  weekday: 'tue',
  publicHoliday: false,
  weather: 'clear',
  visibility: 'clear',
  surface: 'dry',
  egoVehicleClass: 'car',
  timeByDaylight: { day: '10:00:00', dusk: '19:00:00', night: '21:00:00' },
} as const;

export const GIVE_WAY_T_JUNCTION_LAYOUT: TemplateLayout = {
  templateId: templateId('sg.t-junction.give-way'),
  templateVersion: 1,
  build(input: LayoutInput): LayoutResult {
    const minorApproach = enumParameter(input.parameters, 'minorApproach', MINOR_APPROACHES);
    const egoTurn = enumParameter(input.parameters, 'egoMovement', EGO_TURNS);
    const vehicleCategory = enumParameter(input.parameters, 'majorRoadVehicle.category', VEHICLE_CATEGORIES);
    const vehicleApproachWorld = enumParameter(input.parameters, 'majorRoadVehicle.approach', VEHICLE_APPROACHES);
    const turns = quarterTurnsBetween('south', minorApproach);

    const major = buildStraightRoad({
      id: 'major',
      name: 'Major road (development fixture)',
      roadClass: 'major',
      start: vec3(-MAJOR_HALF, 0),
      reference: 'east',
      lengthM: MAJOR_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 50,
    });
    const minor = buildStraightRoad({
      id: 'minor',
      name: 'Minor access road (development fixture)',
      roadClass: 'minor_access',
      start: vec3(0, -50),
      reference: 'north',
      lengthM: MINOR_LENGTH,
      laneWidthM: LANE_W,
      lanesWith: 1,
      lanesAgainst: 1,
      speedLimitKmh: 40,
    });

    const MAJOR_EB = major.lane('with', 0); // eastbound, y = +1.75
    const MAJOR_WB = major.lane('against', 0); // westbound, y = -1.75
    const MINOR_NB = minor.lane('with', 0); // northbound toward the junction, x = -1.75
    const MINOR_SB = minor.lane('against', 0); // southbound away from the junction, x = +1.75
    const h = LANE_W / 2;
    const c = JUNCTION_CLEARANCE_M;

    const MV_MINOR_LEFT = movementIdOf(MINOR_NB.id, 'left');
    const MV_MINOR_RIGHT = movementIdOf(MINOR_NB.id, 'right');
    const MV_MAJOR_EB_STRAIGHT = movementIdOf(MAJOR_EB.id, 'straight');
    const MV_MAJOR_EB_RIGHT = movementIdOf(MAJOR_EB.id, 'right');
    const MV_MAJOR_WB_STRAIGHT = movementIdOf(MAJOR_WB.id, 'straight');
    const MV_MAJOR_WB_LEFT = movementIdOf(MAJOR_WB.id, 'left');

    // Priority/conflict/yield relationships come from the give_way regime and the movement
    // topology (which paths cross), never from the rendered geometry.
    const movements: readonly Movement[] = [
      {
        id: MV_MINOR_LEFT,
        fromLaneId: MINOR_NB.id,
        toLaneId: MAJOR_WB.id,
        turn: 'left',
        path: turnPath(vec3(-h, -LANE_W), vec3(-h, -h), vec3(-c, -h)),
        priority: 'yield',
        conflictsWith: [MV_MAJOR_WB_STRAIGHT],
        yieldsTo: [MV_MAJOR_WB_STRAIGHT],
      },
      {
        id: MV_MINOR_RIGHT,
        fromLaneId: MINOR_NB.id,
        toLaneId: MAJOR_EB.id,
        turn: 'right',
        path: turnPath(vec3(-h, -LANE_W), vec3(-h, h), vec3(c, h)),
        priority: 'yield',
        conflictsWith: [MV_MAJOR_WB_STRAIGHT, MV_MAJOR_EB_STRAIGHT, MV_MAJOR_EB_RIGHT],
        yieldsTo: [MV_MAJOR_WB_STRAIGHT, MV_MAJOR_EB_STRAIGHT, MV_MAJOR_EB_RIGHT],
      },
      {
        id: MV_MAJOR_EB_STRAIGHT,
        fromLaneId: MAJOR_EB.id,
        toLaneId: MAJOR_EB.id,
        turn: 'straight',
        path: [vec3(-c, h), vec3(c, h)],
        priority: 'protected',
        conflictsWith: [MV_MINOR_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_MAJOR_EB_RIGHT,
        fromLaneId: MAJOR_EB.id,
        toLaneId: MINOR_SB.id,
        turn: 'right',
        path: turnPath(vec3(-c, h), vec3(h, h), vec3(h, -c)),
        priority: 'permissive',
        conflictsWith: [MV_MAJOR_WB_STRAIGHT, MV_MINOR_RIGHT],
        yieldsTo: [MV_MAJOR_WB_STRAIGHT],
      },
      {
        id: MV_MAJOR_WB_STRAIGHT,
        fromLaneId: MAJOR_WB.id,
        toLaneId: MAJOR_WB.id,
        turn: 'straight',
        path: [vec3(c, -h), vec3(-c, -h)],
        priority: 'protected',
        conflictsWith: [MV_MINOR_LEFT, MV_MINOR_RIGHT, MV_MAJOR_EB_RIGHT],
        yieldsTo: [],
      },
      {
        id: MV_MAJOR_WB_LEFT,
        fromLaneId: MAJOR_WB.id,
        toLaneId: MINOR_SB.id,
        turn: 'left',
        path: turnPath(vec3(c, -h), vec3(h, -h), vec3(h, -c)),
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
    const VEHICLE = entityId(`major.${vehicleCategory}`);
    const EV = { ...GIVE_WAY_IDS.evidence, majorVehicle: `ev.major-${vehicleCategory}` };

    const egoMovementId = egoTurn === 'left' ? MV_MINOR_LEFT : MV_MINOR_RIGHT;
    const signPosition = vec3(-LANE_W - 0.6, -8, 0);

    const diagnostics: Diagnostic[] = [];
    const notes: string[] = [
      'Generated by @ottie/scenario-core from template sg.t-junction.give-way@1; development status, quarantined assets, not reviewed, not release content.',
      'Sign mounting height 2.1 m, post, vehicle sizes and the 1 m line setback are schematic teaching choices, not source values.',
      'Give Way meaning: Traffic Police handbook PDF page 11 (printed 10): "Slow down. Stop if necessary. Give way to traffic on major road."',
      'Priority, conflict and yield relationships are authored from the give_way control regime and movement topology, not inferred from rendered geometry.',
    ];

    // The major-road vehicle approach is a world-frame compass direction; when the minor road
    // arrives from the east or west the major road runs north–south and east/west approaches
    // are impossible, which is reported rather than silently reinterpreted.
    let vehicle = null;
    let vehicleMovementId: MovementId | null = null;
    if (vehicleApproachWorld !== 'none') {
      const canonical = toCanonicalCompass(vehicleApproachWorld, turns);
      if (canonical !== 'east' && canonical !== 'west') {
        return {
          ok: false,
          diagnostics: [
            {
              validator: 'structural_integrity',
              severity: 'error',
              code: 'generator.parameter_incompatible',
              message: `majorRoadVehicle.approach=${vehicleApproachWorld} is not a major-road approach when minorApproach=${minorApproach} (major road runs north–south)`,
              entityIds: [],
              data: { minorApproach, 'majorRoadVehicle.approach': vehicleApproachWorld },
            },
          ],
        };
      }
      const lane = canonical === 'east' ? MAJOR_WB : MAJOR_EB; // approaching FROM the east travels west
      const movementId = canonical === 'east' ? MV_MAJOR_WB_STRAIGHT : MV_MAJOR_EB_STRAIGHT;
      vehicleMovementId = movementId;
      const distanceM = input.variation.nonEgoProgressM ?? 25;
      vehicle = placeActor({
        id: VEHICLE,
        category: vehicleCategory,
        isEgo: false,
        lane,
        movementId,
        progressM: MAJOR_HALF - distanceM,
        intention: 'straight',
        indicator: 'none',
        speedKmh: VEHICLE_SPEED_KMH,
      });
      const missing = actorWithoutAssetDiagnostic(vehicle);
      if (missing) diagnostics.push(missing);
    }

    const ego = placeActor({
      id: EGO,
      category: 'car',
      isEgo: true,
      lane: MINOR_NB,
      movementId: egoMovementId,
      progressM: EGO_PROGRESS_M,
      intention: egoTurn,
      indicator: turnIndicator(egoTurn),
      speedKmh: EGO_SPEED_KMH,
    });

    const UP = unitVec3(0, 0, 1);
    const evidence: readonly EvidenceRequirement[] = [
      {
        id: EV.giveWayLine,
        targetEntityIds: [GIVE_WAY_LINE],
        requiredDetail: 'row_count',
        allowedViews: ['plan', 'study_oblique', 'approach_ego'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.1,
        minProjectedSizePx: 24,
        coVisibleWith: [EV.egoLane],
        contextAnchorIds: [CONTROL_LINE],
      },
      {
        id: EV.giveWaySign,
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
        id: EV.majorVehicle,
        targetEntityIds: [VEHICLE],
        requiredDetail: 'relative_position',
        allowedViews: ['plan', 'study_oblique'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: 32,
        coVisibleWith: [EV.egoLane],
        contextAnchorIds: [],
      },
      {
        id: EV.egoLane,
        targetEntityIds: [EGO, MINOR_NB.id],
        requiredDetail: 'lane_association',
        allowedViews: ['plan', 'study_oblique', 'approach_ego'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: 32,
        coVisibleWith: [],
        contextAnchorIds: [],
      },
      {
        id: EV.priority,
        targetEntityIds: vehicleMovementId ? [egoMovementId, vehicleMovementId] : [egoMovementId],
        requiredDetail: 'relative_position',
        allowedViews: ['plan', 'study_oblique'],
        mustBeFrontFacing: false,
        maxOcclusionFraction: 0.2,
        minProjectedSizePx: null,
        coVisibleWith: [EV.giveWayLine, EV.majorVehicle],
        contextAnchorIds: [CONTROL_LINE],
      },
    ];
    const cameraPresets: readonly CameraPreset[] = [
      {
        name: 'plan',
        projection: 'orthographic',
        eye: vec3(0, -8, 80),
        target: vec3(0, -8, 0),
        up: unitVec3(0, 1, 0),
        fovOrHalfHeight: 26,
        linkedEntityId: null,
        evidenceIds: [EV.giveWayLine, EV.majorVehicle, EV.egoLane, EV.priority],
      },
      {
        name: 'study_oblique',
        projection: 'orthographic',
        eye: vec3(-30, -45, 32),
        target: vec3(0, -6, 0),
        up: UP,
        fovOrHalfHeight: 20,
        linkedEntityId: null,
        evidenceIds: [EV.giveWayLine, EV.majorVehicle, EV.egoLane, EV.priority],
      },
      {
        name: 'approach_ego',
        projection: 'perspective',
        eye: vec3(-h, -14, 1.2),
        target: vec3(-h, 0, 1.0),
        up: UP,
        fovOrHalfHeight: degreesToRadians(60),
        linkedEntityId: null,
        evidenceIds: [EV.giveWaySign, EV.giveWayLine, EV.egoLane],
      },
      {
        name: 'entity_detail',
        projection: 'perspective',
        eye: vec3(signPosition.x, -11, SIGN_HEIGHT_M),
        target: vec3(signPosition.x, signPosition.y, SIGN_HEIGHT_M),
        up: UP,
        fovOrHalfHeight: degreesToRadians(30),
        linkedEntityId: GIVE_WAY_SIGN,
        evidenceIds: [EV.giveWaySign],
      },
    ];
    const pruned = pruneEvidence(evidence, cameraPresets, vehicle ? [] : [EV.majorVehicle, EV.priority]);
    if (!vehicle) notes.push('No major-road vehicle in this variant; the vehicle and priority-relationship evidence are omitted.');

    return {
      ok: true,
      turns,
      notes,
      diagnostics,
      body: {
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
            controlsLaneIds: [MINOR_NB.id],
            road: { roadId: minor.road.id, s: metres(MINOR_LENGTH - CONTROL_LINE_SETBACK_M), t: metres(h) },
            // Transverse across the northbound lane only: kerb to road centre, 1 m before the major road edge.
            polyline: [vec3(-LANE_W, CONTROL_LINE_Y), vec3(0, CONTROL_LINE_Y)],
            approachHeading: HEADING.north,
          },
          {
            id: SIGN_BASE,
            kind: 'support_base',
            position: signPosition,
            roadsideOf: { laneId: MINOR_NB.id, side: 'left' },
            road: { roadId: minor.road.id, s: metres(42), t: metres(0 - signPosition.x) },
          },
        ],
        markings: [
          {
            id: GIVE_WAY_LINE,
            role: 'give_way_line',
            asset: ref(ASSET_GIVE_WAY_LINE_D),
            anchorId: CONTROL_LINE,
            applicableLaneIds: [MINOR_NB.id],
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
            pose: { position: signPosition, yaw: HEADING.east },
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
              heightAboveGroundM: metres(SIGN_HEIGHT_M),
            },
            pose: { position: vec3(signPosition.x, signPosition.y, SIGN_HEIGHT_M), yaw: HEADING.east },
            frontNormal: unitVec3(0, -1, 0), // toward northbound approaching traffic
            up: UP,
            intendedApproach: { laneIds: [MINOR_NB.id], heading: HEADING.north },
            applicableLaneIds: [MINOR_NB.id],
            applicableMovementIds: [MV_MINOR_LEFT, MV_MINOR_RIGHT],
            linkedControlLineIds: [CONTROL_LINE],
            sourceRefs: [LOC_TFM1_GIVE_WAY, LOC_TP_GIVE_WAY_STOP_MEANING],
          },
        ],
        signalHeads: [],
        signalControllers: [],
        actors: vehicle ? [ego, vehicle] : [ego],
        conditions: conditionsFor(CONDITIONS, input.variation.daylight ?? 'day'),
        depictedViolations: [],
        evidence: pruned.evidence,
        cameraPresets: pruned.cameraPresets,
      },
    };
  },
};
