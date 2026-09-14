import { type Metres, type Pose, type Radians, type RoadFramePosition, type UnitVec3, type Vec3, type WorldConventions } from './units';
import {
  type AnchorId,
  type AssetRef,
  type EntityId,
  type LaneId,
  type MovementId,
  type ReproducibilityKey,
  type RoadId,
  type RuleId,
  type Sha256,
  type WorldId,
} from './ids';
import { type AnchorKind, type ControlRegime, type MarkingRole, type RoadClass, type SignalAspectColour, type SignalAspectShape } from './asset';
import { type SourceLocator } from './source';

/* ------------------------------------------------------------------------------------------------
 * Roads, lanes and anchors
 * ---------------------------------------------------------------------------------------------- */

/**
 * A road with an authored reference direction. `centreline` is the s-axis polyline in world
 * space; `t` is positive to the LEFT of travel along increasing `s`.
 */
export interface Road {
  readonly id: RoadId;
  readonly name: string;
  readonly roadClass: RoadClass;
  readonly centreline: readonly Vec3[];
  /** Total paved width including all lanes (metres). */
  readonly widthM: Metres;
  readonly speedLimitKmh: number | null;
}

export type LaneDirectionRelativeToRoad = 'with_reference' | 'against_reference';

/**
 * A directed lane. Travel direction is intrinsic: `heading` is the tangent at `centreline[0]` and
 * `centreline` is ordered in the direction of travel. Reversing a lane produces a different lane.
 * With LEFT traffic the lane's local left is the kerb side for the outermost lane.
 */
export interface Lane {
  readonly id: LaneId;
  readonly roadId: RoadId;
  readonly directionRelativeToRoad: LaneDirectionRelativeToRoad;
  /** 0 = nearest the kerb on the travelling side (leftmost when driving on the LEFT). */
  readonly indexFromKerb: number;
  readonly centreline: readonly Vec3[];
  readonly widthM: Metres;
  /** Heading of travel at the lane start, radians in the world frame. */
  readonly heading: Radians;
  readonly allowedVehicleClasses: readonly ('car' | 'bus' | 'lorry' | 'motorcycle' | 'bicycle')[];
  /** Movements permitted from this lane at its downstream end. */
  readonly outgoingMovementIds: readonly MovementId[];
}

export type MovementTurn = 'straight' | 'left' | 'right' | 'u_turn';
export type MovementPriority = 'protected' | 'permissive' | 'yield' | 'stop_then_yield';

/**
 * A legal/reviewed movement through a junction: from an inbound lane to an outbound lane along a
 * swept path. `conflictsWith` lists movements that geometrically cross; `priority` says who gives
 * way, so validators can accept legitimate permissive conflicts instead of rejecting all crossings.
 */
export interface Movement {
  readonly id: MovementId;
  readonly fromLaneId: LaneId;
  readonly toLaneId: LaneId;
  readonly turn: MovementTurn;
  readonly path: readonly Vec3[];
  readonly priority: MovementPriority;
  readonly conflictsWith: readonly MovementId[];
  /** Movements this one must give way to (subset of conflictsWith). */
  readonly yieldsTo: readonly MovementId[];
}

/** Anchor kinds carry the payload markings and mounts attach to; shapes derive from anchors. */
export type Anchor =
  | {
      readonly id: AnchorId;
      readonly kind: 'lane_boundary';
      readonly laneId: LaneId;
      readonly side: 'left' | 'right';
      readonly polyline: readonly Vec3[];
    }
  | {
      readonly id: AnchorId;
      readonly kind: 'control_line';
      /** Lanes whose traffic this line controls (inbound lanes of one approach). */
      readonly controlsLaneIds: readonly LaneId[];
      readonly road: RoadFramePosition;
      /** Transverse line from kerb side to the approach's far boundary, in world space. */
      readonly polyline: readonly Vec3[];
      /** Direction of approaching travel that this line faces. */
      readonly approachHeading: Radians;
    }
  | {
      readonly id: AnchorId;
      readonly kind: 'movement_path';
      readonly movementId: MovementId;
      readonly polyline: readonly Vec3[];
    }
  | {
      readonly id: AnchorId;
      readonly kind: 'crossing_bound';
      readonly polyline: readonly Vec3[];
      readonly crossesLaneIds: readonly LaneId[];
    }
  | {
      readonly id: AnchorId;
      readonly kind: 'roadside_edge';
      readonly roadId: RoadId;
      readonly side: 'left' | 'right';
      readonly polyline: readonly Vec3[];
    }
  | {
      readonly id: AnchorId;
      readonly kind: 'support_base';
      /** Ground point where a post/pole meets the verge; z is ground level. */
      readonly position: Vec3;
      readonly roadsideOf: { readonly laneId: LaneId; readonly side: 'left' | 'right' };
      readonly road: RoadFramePosition;
    };

export type AnchorOfKind<K extends AnchorKind> = Extract<Anchor, { kind: K }>;

/* ------------------------------------------------------------------------------------------------
 * Markings
 * ---------------------------------------------------------------------------------------------- */

/**
 * A painted marking. Semantic `role` is authoritative; geometry comes from the resolved asset's
 * MarkingProfile applied along the anchor. Never a bare dash array.
 */
export interface Marking {
  readonly id: EntityId;
  readonly role: MarkingRole;
  readonly asset: AssetRef;
  readonly anchorId: AnchorId;
  readonly applicableLaneIds: readonly LaneId[];
  readonly applicableMovementIds: readonly MovementId[];
  /** Painted extent along the anchor polyline in metres; null = whole anchor. */
  readonly extentM: { readonly from: Metres; readonly to: Metres } | null;
  readonly sourceRefs: readonly SourceLocator[];
}

/* ------------------------------------------------------------------------------------------------
 * Assemblies: supports, faces, signal heads
 * ---------------------------------------------------------------------------------------------- */

export interface Support {
  readonly id: EntityId;
  readonly asset: AssetRef | null;
  readonly family: 'post' | 'pole' | 'mast_arm' | 'gantry' | 'wall' | 'unspecified';
  readonly baseAnchorId: AnchorId;
  readonly pose: Pose;
  readonly heightM: Metres | null;
  /** Whether the physical support dimensions come from a source or are a schematic teaching choice. */
  readonly dimensionsStatus: 'sourced' | 'schematic_unsourced';
}

/** How a face or head is physically attached to its support. */
export interface Attachment {
  readonly supportId: EntityId;
  readonly supportAttachmentName: string;
  readonly partAttachmentName: string;
  /** Height of the attachment point above ground, metres (or null when the source is silent). */
  readonly heightAboveGroundM: Metres | null;
}

/**
 * A mounted sign face. `frontNormal` is the world-space direction the readable side faces and
 * must point toward `intendedApproach` traffic (validator `approach_facing`). `up` is +Z for a
 * conventionally mounted panel; a point-down triangle is designed orientation, not inversion.
 */
export interface SignFace {
  readonly id: EntityId;
  readonly asset: AssetRef;
  readonly attachment: Attachment;
  readonly pose: Pose;
  readonly frontNormal: UnitVec3;
  readonly up: UnitVec3;
  readonly intendedApproach: { readonly laneIds: readonly LaneId[]; readonly heading: Radians };
  readonly applicableLaneIds: readonly LaneId[];
  readonly applicableMovementIds: readonly MovementId[];
  /** Control lines this sign governs (e.g. the D rows for a Give Way sign). */
  readonly linkedControlLineIds: readonly AnchorId[];
  readonly sourceRefs: readonly SourceLocator[];
}

/** One lens on a head, bound to the movements it controls. Circular and arrow aspects are separate. */
export interface SignalAspect {
  readonly slot: string;
  readonly colour: SignalAspectColour;
  readonly shape: SignalAspectShape;
  /** Movements this aspect speaks to. A circular aspect controls every movement not covered by an arrow. */
  readonly controlsMovementIds: readonly MovementId[];
}

export interface SignalHead {
  readonly id: EntityId;
  readonly asset: AssetRef;
  readonly controllerId: EntityId;
  readonly attachment: Attachment;
  readonly pose: Pose;
  readonly frontNormal: UnitVec3;
  readonly up: UnitVec3;
  readonly intendedApproach: { readonly laneIds: readonly LaneId[]; readonly heading: Radians };
  readonly applicableLaneIds: readonly LaneId[];
  readonly aspects: readonly SignalAspect[];
  readonly linkedControlLineIds: readonly AnchorId[];
  readonly sourceRefs: readonly SourceLocator[];
}

export type AspectState = 'lit' | 'dark' | 'flashing';

/** State of one aspect at the frozen instant; keyed by head and slot so no head has a "colour". */
export interface AspectStateEntry {
  readonly headId: EntityId;
  readonly slot: string;
  readonly state: AspectState;
}

/** Permission a movement has at the frozen instant, derived by the generator, checked by validators. */
export interface MovementPermission {
  readonly movementId: MovementId;
  readonly permission: 'proceed_protected' | 'proceed_permissive' | 'prepare_to_stop' | 'stop';
  /** Aspects that determine this permission, in precedence order (a red arrow outranks circular green). */
  readonly governedByAspects: readonly { readonly headId: EntityId; readonly slot: string }[];
}

export interface SignalController {
  readonly id: EntityId;
  readonly phasePlanRef: string;
  readonly currentPhase: string;
  readonly aspectStates: readonly AspectStateEntry[];
  readonly movementPermissions: readonly MovementPermission[];
}

/* ------------------------------------------------------------------------------------------------
 * Actors and conditions
 * ---------------------------------------------------------------------------------------------- */

export interface Actor {
  readonly id: EntityId;
  readonly category: 'car' | 'bus' | 'lorry' | 'motorcycle' | 'bicycle' | 'pedestrian';
  readonly asset: AssetRef | null;
  readonly isEgo: boolean;
  /** Lane (and optionally movement) the actor is on; position derives from progress along it. */
  readonly laneId: LaneId | null;
  readonly movementId: MovementId | null;
  /** Longitudinal progress along the lane/path centreline, metres from its start, to the actor's reference point. */
  readonly progressM: Metres;
  /** Lateral offset from the lane centreline, metres, positive left. */
  readonly lateralOffsetM: Metres;
  readonly dimensionsM: { readonly length: Metres; readonly width: Metres; readonly height: Metres };
  /** Reference point → front bumper distance. "Upstream of the line" is measured with the FRONT. */
  readonly frontOffsetM: Metres;
  readonly pose: Pose;
  readonly intention: MovementTurn | 'stationary' | 'crossing';
  readonly indicator: 'none' | 'left' | 'right' | 'hazard';
  readonly speedKmh: number;
}

export interface Conditions {
  /** ISO local date-time in Asia/Singapore for the scenario, independent of the device clock. */
  readonly localDateTime: string;
  readonly weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  readonly publicHoliday: boolean;
  readonly weather: 'clear' | 'rain' | 'haze';
  readonly visibility: 'clear' | 'reduced';
  readonly surface: 'dry' | 'wet';
  readonly daylight: 'day' | 'dusk' | 'night';
  readonly egoVehicleClass: 'car' | 'motorcycle' | 'bus' | 'lorry';
}

export interface DepictedViolation {
  readonly id: EntityId;
  readonly actorId: EntityId;
  readonly ruleId: RuleId;
  readonly explanationRef: string;
  readonly evidenceIds: readonly string[];
  readonly description: string;
}

/* ------------------------------------------------------------------------------------------------
 * Evidence and cameras
 * ---------------------------------------------------------------------------------------------- */

export type CameraPresetName = 'plan' | 'study_oblique' | 'approach_ego' | 'entity_detail';

export type RequiredDetail = 'presence' | 'readable_face' | 'lane_association' | 'aspect_state' | 'relative_position' | 'row_count';

/** Anything with a world-unique ID that evidence may point at (see `collectEntityIds`). */
export type EvidenceTargetId = EntityId | LaneId | MovementId | AnchorId | RoadId;

/**
 * What must be visible for a question to be answerable. Consumed by R2 (`camera_evidence`) and
 * V1 (`question_evidence`). Bounding-box overlap alone never satisfies a requirement.
 */
export interface EvidenceRequirement {
  readonly id: string;
  readonly targetEntityIds: readonly EvidenceTargetId[];
  readonly requiredDetail: RequiredDetail;
  readonly allowedViews: readonly CameraPresetName[];
  readonly mustBeFrontFacing: boolean;
  readonly maxOcclusionFraction: number;
  /** Minimum projected readable size in CSS px at the reviewed minimum viewport. */
  readonly minProjectedSizePx: number | null;
  /** Other requirement IDs that must be visible in the SAME view (e.g. sign + its lane). */
  readonly coVisibleWith: readonly string[];
  readonly contextAnchorIds: readonly AnchorId[];
}

export interface CameraPreset {
  readonly name: CameraPresetName;
  readonly projection: 'orthographic' | 'perspective';
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: UnitVec3;
  /** Perspective vertical FOV (radians) or orthographic half-height (metres). */
  readonly fovOrHalfHeight: number;
  /** Entity the detail view is linked to; presence keeps a detail from claiming a floating sign. */
  readonly linkedEntityId: EntityId | null;
  readonly evidenceIds: readonly string[];
}

/* ------------------------------------------------------------------------------------------------
 * World
 * ---------------------------------------------------------------------------------------------- */

export type FixtureStatus = 'development_fixture' | 'reviewed_fixture' | 'generated';

export interface WorldProvenance {
  readonly key: ReproducibilityKey;
  readonly generatedAt: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Hash of the canonical JSON of everything except this field. Null for hand-authored fixtures. */
  readonly canonicalHash: Sha256 | null;
  readonly status: FixtureStatus;
  /** Explicit statement that the fixture uses quarantined (release_ready=false) assets. */
  readonly usesQuarantinedAssets: boolean;
  readonly notes: readonly string[];
}

/**
 * The immutable semantic world. Everything the renderer, validators, question bindings and
 * cameras need is here; nothing here is presentation state. Produced by C2, frozen with
 * `freezeDeep`, never mutated by camera, help, theme or attempt changes (`state_invariance`).
 */
export interface World {
  readonly id: WorldId;
  readonly schemaVersion: number;
  readonly conventions: WorldConventions;
  readonly controlRegime: ControlRegime;
  readonly roads: readonly Road[];
  readonly lanes: readonly Lane[];
  readonly movements: readonly Movement[];
  readonly anchors: readonly Anchor[];
  readonly markings: readonly Marking[];
  readonly supports: readonly Support[];
  readonly signFaces: readonly SignFace[];
  readonly signalHeads: readonly SignalHead[];
  readonly signalControllers: readonly SignalController[];
  readonly actors: readonly Actor[];
  readonly conditions: Conditions;
  readonly depictedViolations: readonly DepictedViolation[];
  readonly evidence: readonly EvidenceRequirement[];
  readonly cameraPresets: readonly CameraPreset[];
  readonly provenance: WorldProvenance;
}

/** Every ID-bearing entity in a world, for referential checks and reverse lookups. */
export function collectEntityIds(world: World): ReadonlySet<string> {
  const ids = new Set<string>();
  const add = (items: readonly { readonly id: string }[]) => {
    for (const item of items) ids.add(item.id);
  };
  add(world.roads);
  add(world.lanes);
  add(world.movements);
  add(world.anchors);
  add(world.markings);
  add(world.supports);
  add(world.signFaces);
  add(world.signalHeads);
  add(world.signalControllers);
  add(world.actors);
  add(world.depictedViolations);
  return ids;
}
