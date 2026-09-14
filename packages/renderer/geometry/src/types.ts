import { type Box3, type Group, type Object3D, type Vector3 } from 'three';
import {
  type AnchorKind,
  type AspectState,
  type EntityId,
  type FaceShape,
  type MarkingRole,
  type MovementId,
  type SignalAspectColour,
  type SignalAspectShape,
  type Support,
} from '@ottie/contracts';

/**
 * Public records the geometry module exposes for camera (R2), evidence (R2) and review (H1)
 * consumers. Everything here is a *fact about the built scene graph* in world space — where a
 * face actually points, where each lens actually is — never an interpretation of what it means.
 */

export type RenderedEntityKind =
  | 'road'
  | 'lane'
  | 'movement'
  | 'anchor'
  | 'marking'
  | 'support'
  | 'sign_face'
  | 'signal_head'
  | 'actor';

/** `physical` geometry is road/paint/poles/faces/heads/vehicles; `overlay` carries invisible bounds for lanes, movements and anchors. */
export type SceneLayer = 'physical' | 'overlay';

interface RenderedBase {
  readonly id: string;
  readonly kind: RenderedEntityKind;
  readonly layer: SceneLayer;
  readonly object: Object3D;
  /** World-space axis-aligned bounds after all transforms are applied. */
  readonly bounds: Box3;
}

export interface RenderedRoad extends RenderedBase {
  readonly kind: 'road';
  readonly widthM: number;
  readonly lengthM: number;
}

export interface RenderedLane extends RenderedBase {
  readonly kind: 'lane';
  readonly widthM: number;
  readonly headingVector: Vector3;
}

export interface RenderedMovement extends RenderedBase {
  readonly kind: 'movement';
}

export interface RenderedAnchor extends RenderedBase {
  readonly kind: 'anchor';
  readonly anchorKind: AnchorKind;
}

export interface PaintSegment {
  readonly from: Vector3;
  readonly to: Vector3;
}

export interface PaintRow {
  readonly index: number;
  /** Offset of the row's paint centreline from the anchor polyline along `offsetDirection`, metres. */
  readonly centreOffsetM: number;
  readonly segments: readonly PaintSegment[];
}

export interface RenderedMarking extends RenderedBase {
  readonly kind: 'marking';
  readonly role: MarkingRole;
  readonly rowWidthM: number;
  readonly continuous: boolean;
  /** Direction rows are stacked in: the approach direction for control lines, the left normal otherwise. */
  readonly offsetDirection: Vector3;
  /** For control lines the anchor polyline is the upstream paint edge; otherwise rows are centred on it. */
  readonly anchorEdge: 'upstream_edge' | 'centred';
  readonly rows: readonly PaintRow[];
}

export interface RenderedSupport extends RenderedBase {
  readonly kind: 'support';
  readonly family: Support['family'];
  readonly base: Vector3;
  readonly top: Vector3;
  readonly heightM: number;
  readonly radiusM: number;
  readonly heightSource: 'world' | 'asset' | 'highest_attachment';
  readonly dimensionsStatus: Support['dimensionsStatus'];
  /** World position of every named attachment point on the support asset. */
  readonly attachmentPoints: ReadonlyMap<string, Vector3>;
}

/** Whether a face/head is physically attached to a support in the built scene. */
export interface MountFacts {
  readonly supportId: string | null;
  readonly mounted: boolean;
  /** World point where the part's attachment coincides with the support's attachment point. */
  readonly attachmentPoint: Vector3 | null;
}

export interface FacingFacts {
  /** World direction the readable side actually faces (from pose × asset front). */
  readonly frontNormal: Vector3;
  readonly up: Vector3;
  /** Observer's right when reading the face: up × front. */
  readonly right: Vector3;
  /** Whether the front normal opposes `intendedApproach.heading` (traffic drives toward the face). */
  readonly facesIntendedApproach: boolean;
}

export type ArtworkStatus = 'vector' | 'backing_only';

export interface RenderedSignFace extends RenderedBase, FacingFacts {
  readonly kind: 'sign_face';
  readonly shape: FaceShape;
  readonly widthM: number;
  readonly heightM: number;
  readonly panelCentre: Vector3;
  readonly mount: MountFacts;
  readonly artwork: ArtworkStatus;
  /** World directions the SVG +x (reading direction) and SVG +y (down the page) were mapped onto. */
  readonly artworkAxes: { readonly svgX: Vector3; readonly svgY: Vector3 } | null;
}

export interface RenderedLens {
  readonly slot: string;
  readonly colour: SignalAspectColour;
  readonly shape: SignalAspectShape;
  readonly row: number;
  readonly column: number;
  /** State from the controller; null when the controller has no entry for this slot. */
  readonly state: AspectState | null;
  readonly centre: Vector3;
  readonly diameterM: number;
  readonly controlsMovementIds: readonly MovementId[];
  /** World direction an arrow glyph points, null for circular/letter lenses. */
  readonly glyphDirection: Vector3 | null;
}

export interface RenderedSignalHead extends RenderedBase, FacingFacts {
  readonly kind: 'signal_head';
  readonly arrangement: 'vertical' | 'horizontal';
  readonly mount: MountFacts;
  readonly controllerId: EntityId;
  readonly controllerFound: boolean;
  /** Lenses ordered by column then row (row 0 = top). */
  readonly lenses: readonly RenderedLens[];
  readonly lensDiameterSource: MeasurementSource;
  readonly lensSpacingSource: MeasurementSource;
  readonly lowestLensCentreAboveGroundM: number;
}

export type MeasurementSource = 'value' | 'minimum_bound' | 'maximum_bound';

export interface RenderedActor extends RenderedBase {
  readonly kind: 'actor';
  readonly category: string;
  readonly isEgo: boolean;
  /** World point of the front bumper centre (reference point + frontOffset along heading). */
  readonly front: Vector3;
  readonly headingVector: Vector3;
  readonly dimensionsM: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  };
  readonly indicator: 'none' | 'left' | 'right' | 'hazard';
}

export type RenderedEntity =
  | RenderedRoad
  | RenderedLane
  | RenderedMovement
  | RenderedAnchor
  | RenderedMarking
  | RenderedSupport
  | RenderedSignFace
  | RenderedSignalHead
  | RenderedActor;

export type SceneIssueCode =
  | 'unresolved_asset'
  | 'asset_geometry_mismatch'
  | 'missing_anchor'
  | 'missing_support'
  | 'missing_attachment_point'
  | 'pose_attachment_mismatch'
  | 'front_normal_mismatch'
  | 'up_mismatch'
  | 'missing_controller'
  | 'missing_aspect_state'
  | 'artwork_unavailable'
  | 'artwork_hash_mismatch'
  | 'artwork_unverified'
  | 'unknown_dimension'
  | 'unsupported_geometry';

/**
 * Something the renderer could not draw exactly as the world describes. Issues are reported, never
 * silently repaired: a floating face stays floating and is flagged; nothing is moved or added.
 */
export interface SceneIssue {
  readonly code: SceneIssueCode;
  readonly entityId: string | null;
  readonly message: string;
}

/** A teaching-layout choice the renderer had to make because the world/asset is silent. */
export interface SchematicChoice {
  readonly key: string;
  readonly description: string;
  readonly value: number;
  readonly unit: 'm';
}

export interface WorldScene {
  readonly worldId: string;
  readonly root: Group;
  /** Every rendered entity by id (entity, lane, movement, anchor or road id). */
  readonly entities: ReadonlyMap<string, RenderedEntity>;
  /** Union of physical-layer bounds. */
  readonly bounds: Box3;
  readonly issues: readonly SceneIssue[];
  /** Schematic choices actually used while building this scene. */
  readonly schematicChoices: readonly SchematicChoice[];
  boundsOf(ids: readonly string[]): Box3 | null;
  /** Show or hide the invisible teaching-overlay layer (lane/movement/anchor guides). */
  setOverlayVisible(visible: boolean): void;
  dispose(): void;
}
