import { type Millimetres, type UnitVec3, millimetres } from './units';
import {
  type AssemblyDefinitionId,
  type AssetId,
  type AssetRef,
  type Sha256,
  assetId,
  sha256,
  sourceId,
} from './ids';
import { type Measurement, type ReviewState, type SourceLocator, type SourceRef } from './source';
import {
  type ExtractionAsset,
  type ExtractionFamily,
  type ExtractionLocator,
  type ExtractionSource,
  type JsonValue,
  FLAT_DIMENSION_METADATA_KEYS,
  extractionMeasurementObjectSchema,
} from './extraction-manifest';

/**
 * Semantic role of an asset. Roles are distinct even when geometry looks alike: the RMS "J" 300 mm
 * line is a `stop_line` at a STOP control and a `shoulder_boundary` elsewhere; a validator must be
 * able to reject the wrong role without inspecting paint geometry.
 */
export type MarkingRole =
  | 'give_way_line' // RMS2 D — two rows of broken transverse line
  | 'stop_line' // RMS2 J — continuous transverse line at a STOP/signal control
  | 'shoulder_boundary' // longitudinal J use; never a stop line
  | 'centre_line_two_way' // RMS E
  | 'lane_line_same_direction' // RMS B
  | 'edge_line'
  | 'crossing_bound'
  | 'pedestrian_crossing'
  | 'zigzag_warning'
  | 'yellow_box'
  | 'direction_arrow'
  | 'bus_lane_line'
  | 'kerb_restriction'
  | 'other_marking';

export type SignRole =
  | 'give_way_sign'
  | 'stop_sign'
  | 'mandatory_sign'
  | 'prohibitory_sign'
  | 'warning_sign'
  | 'informatory_sign';

export type SignalRole = 'vehicle_signal_head' | 'pedestrian_signal_head' | 'bus_priority_aspect';

export type SupportRole = 'sign_post' | 'signal_pole' | 'signal_mast_arm' | 'gantry' | 'wall_bracket';

export type AssetRole = MarkingRole | SignRole | SignalRole | SupportRole | 'vehicle' | 'person';

/** Shape category of a sign face; a triangle pointing down is a designed orientation, not a flip. */
export type FaceShape = 'circle' | 'triangle_point_down' | 'triangle_point_up' | 'octagon' | 'rectangle' | 'diamond';

export type AssetRepresentation = 'source_reference' | 'cleaned_vector' | 'parametric_geometry';

export type AssetFileRole = 'reference_png' | 'reference_svg' | 'renderer_svg' | 'geometry_json';

export interface AssetFile {
  readonly role: AssetFileRole;
  /** Repository-relative path, e.g. `assets/sg/mandatory/give-way.svg`. */
  readonly path: string;
  readonly sha256: Sha256 | null;
}

/** Where an asset may legitimately appear; validators reject other contexts (`marking_context`). */
export interface AllowedContext {
  readonly controlRegimes: readonly ControlRegime[];
  readonly roadClasses: readonly RoadClass[];
  readonly notes?: readonly string[];
}

export type ControlRegime = 'uncontrolled' | 'give_way' | 'stop' | 'signalised' | 'zebra_crossing';
export type RoadClass = 'minor_access' | 'local' | 'major' | 'expressway' | 'development_access';

/** Physical face description in the asset's own frame: +front toward the intended observer, +up. */
export interface FaceProfile {
  readonly shape: FaceShape;
  readonly widthMm: Millimetres | null;
  readonly heightMm: Millimetres | null;
  /** Face frame: normal points out of the readable side. Never mirrored (no negative scale). */
  readonly front: UnitVec3;
  readonly up: UnitVec3;
  readonly mirrorAllowed: false;
}

/** Parametric transverse/longitudinal paint profile in millimetres; derived from RMS geometry JSON. */
export interface MarkingProfile {
  readonly rows: number;
  readonly widthMm: Millimetres;
  readonly paintedLengthMm: Millimetres | null;
  readonly clearGapMm: Millimetres | null;
  readonly interRowClearGapMm: Millimetres | null;
  readonly continuous: boolean;
  /** Which anchor kinds this marking may attach to. */
  readonly attachesTo: readonly AnchorKind[];
}

export type AnchorKind =
  | 'lane_boundary'
  | 'control_line'
  | 'movement_path'
  | 'crossing_bound'
  | 'roadside_edge'
  | 'support_base';

/** Named attachment point on an asset (face/head/support) in the asset's own frame, millimetres. */
export interface AttachmentPoint {
  readonly name: string;
  readonly offsetMm: { readonly x: Millimetres; readonly y: Millimetres; readonly z: Millimetres };
  /** Kinds of things that may attach here: a face/head accepts a `support`; a support accepts faces/heads/ground. */
  readonly accepts: readonly ('face' | 'signal_head' | 'support' | 'ground')[];
}

export type SignalAspectColour = 'red' | 'amber' | 'green';
export type SignalAspectShape = 'circular' | 'arrow_left' | 'arrow_right' | 'arrow_straight' | 'letter_b';

/** One lens in a signal head; `column`/`row` give the layout so ordering can be validated. */
export interface SignalAspectSlot {
  readonly slot: string;
  readonly colour: SignalAspectColour;
  readonly shape: SignalAspectShape;
  readonly column: number;
  /** 0 = top. Vertical heads must have red above amber above green per Rule 11. */
  readonly row: number;
}

export interface SignalHeadProfile {
  readonly arrangement: 'vertical' | 'horizontal';
  readonly aspects: readonly SignalAspectSlot[];
  readonly lensDiameterMm: Measurement;
  readonly lowestLensCentreAboveGroundMm: Measurement;
  readonly adjacentLensCentreDistanceMm: Measurement;
  readonly front: UnitVec3;
  readonly up: UnitVec3;
  readonly definitionIds: readonly AssemblyDefinitionId[];
}

export interface VehicleProfile {
  readonly category: 'car' | 'bus' | 'lorry' | 'motorcycle' | 'bicycle';
  readonly lengthMm: Millimetres;
  readonly widthMm: Millimetres;
  readonly heightMm: Millimetres;
  /** Distance from the actor's reference point (rear axle or centre) to the front bumper. */
  readonly frontOffsetMm: Millimetres;
}

export type GeometryProfile =
  | { readonly kind: 'face'; readonly face: FaceProfile }
  | { readonly kind: 'marking'; readonly marking: MarkingProfile }
  | { readonly kind: 'signal_head'; readonly head: SignalHeadProfile }
  | { readonly kind: 'support'; readonly heightMm: Millimetres | null; readonly attachments: readonly AttachmentPoint[] }
  | { readonly kind: 'vehicle'; readonly vehicle: VehicleProfile }
  | { readonly kind: 'reference_only' };

/** Provenance kept separately from geometry: extraction status is not content or reuse approval. */
export interface AssetProvenance {
  readonly family: ExtractionFamily | 'runtime';
  readonly representation: AssetRepresentation;
  readonly files: readonly AssetFile[];
  readonly geometrySources: readonly SourceLocator[];
  readonly meaningSources: readonly SourceLocator[];
  readonly measurements: readonly Measurement[];
  /** Untouched `dimensions_mm` from the extraction manifest (family-specific shape). */
  readonly rawDimensionsMm: Readonly<Record<string, unknown>>;
  /** Untouched family-specific evidence (traffic_rule, assembly_context, vector_selection ...). */
  readonly rawFamilyEvidence: Readonly<Record<string, unknown>>;
  readonly extractionRecipe: {
    readonly method: string;
    readonly tool: string;
    readonly toolVersion: string;
    readonly recipe: string;
    readonly recipeSha256: Sha256 | null;
  };
  readonly relatedAssetIds: readonly AssetId[];
}

/**
 * Runtime asset. `id`/`version` are stable; a changed file hash or measurement bumps `version`.
 * Geometry and provenance are separate so a renderer never reads review status to decide shape
 * and a release export never reads geometry to decide approval.
 */
export interface AssetDefinition {
  readonly id: AssetId;
  readonly version: number;
  readonly name: string;
  readonly role: AssetRole;
  readonly allowedContexts: AllowedContext;
  readonly geometry: GeometryProfile;
  readonly attachments: readonly AttachmentPoint[];
  readonly provenance: AssetProvenance;
  readonly review: ReviewState;
  /** Unknowns copied from source data (e.g. "site-specific placement"); never filled by code. */
  readonly unknowns: readonly string[];
}

export type ResolutionMode = 'development' | 'release';

export type AssetResolution =
  | { readonly ok: true; readonly asset: AssetDefinition; readonly quarantined: boolean }
  | {
      readonly ok: false;
      readonly ref: AssetRef;
      readonly reason: 'unknown_asset' | 'unknown_version' | 'not_release_ready' | 'retired' | 'blocked';
      readonly detail: string;
    };

/**
 * Resolver port implemented by packages/asset-registry (C1). In `release` mode only
 * `review.releaseReady && contentApproved` assets resolve; `development` mode may return
 * quarantined assets and marks them so review output can display that status.
 */
export interface AssetResolver {
  readonly mode: ResolutionMode;
  readonly registryHash: Sha256;
  resolve(ref: AssetRef): AssetResolution;
  /** Reverse dependency lookup for change-impact reports (H1). */
  dependents(id: AssetId): readonly AssetRef[];
  list(): readonly AssetRef[];
}

/* ---------------------------------------------------------------------------------------------- */
/* Extraction → runtime adapters                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export function adaptExtractionSource(source: ExtractionSource): SourceRef {
  return {
    id: sourceId(source.id),
    url: source.url,
    publisher: source.publisher,
    edition: source.edition ?? null,
    collectionRevision: source.collection_revision,
    publishedOn: null,
    effectiveFrom: null,
    retrievedAt: source.retrieved_at,
    sha256: sha256(source.sha256),
    hashScope: source.hash_scope ?? 'original downloaded PDF bytes',
    pageCount: source.page_count ?? source.pages ?? null,
    verifiedFacts: [],
    unresolved: source.snapshot_complete === false ? ['source snapshot incomplete'] : [],
  };
}

export function adaptExtractionLocator(locator: ExtractionLocator): SourceLocator {
  return {
    sourceId: sourceId(locator.source_id),
    pdfPage: locator.pdf_page,
    printedPage: locator.printed_page,
    drawing: locator.drawing,
    drawingRevision: locator.drawing_revision,
    bboxPdfPoints: locator.bbox_pdf_points,
    bboxDisplayPdfPoints: locator.bbox_display_pdf_points ?? null,
  };
}

function isBbox(value: JsonValue | undefined): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number');
}

/**
 * Lifts `dimensions_mm` into Measurements across the three real manifest layouts:
 * bare numbers (markings), per-dimension objects (mandatory) and numbers with flat sibling
 * metadata `endpoints`/`method`/`evidence_bbox_pdf_points` (warning). Metadata keys are not
 * dimensions and are never emitted as measurements; unknown shapes are skipped, never guessed.
 */
export function adaptDimensions(dimensions: Readonly<Record<string, JsonValue>>, source: ExtractionLocator): readonly Measurement[] {
  const flatKeys: readonly string[] = FLAT_DIMENSION_METADATA_KEYS;
  const flatEndpoints = dimensions.endpoints;
  const flatMethod = dimensions.method;
  const flatBbox = dimensions.evidence_bbox_pdf_points;
  const measurements: Measurement[] = [];
  for (const [name, entry] of Object.entries(dimensions)) {
    if (flatKeys.includes(name)) continue;
    if (typeof entry === 'number') {
      measurements.push({
        name,
        valueMm: millimetres(entry),
        endpoints: typeof flatEndpoints === 'string' ? flatEndpoints : 'see geometry_json measurement_evidence',
        method: 'printed_dimension_label',
        locator: { ...adaptExtractionLocator(source), bboxPdfPoints: isBbox(flatBbox) ? flatBbox : source.bbox_pdf_points },
        ...(typeof flatMethod === 'string' ? { notes: [flatMethod] } : {}),
      });
      continue;
    }
    const parsed = extractionMeasurementObjectSchema.safeParse(entry);
    if (!parsed.success) continue;
    const object = parsed.data;
    const value = object.value;
    if (typeof value !== 'number') continue;
    measurements.push({
      name,
      valueMm: millimetres(value),
      endpoints: object.endpoints ?? 'unspecified',
      method: 'printed_dimension_label',
      locator: {
        sourceId: sourceId(object.source_id ?? source.source_id),
        pdfPage: object.pdf_page ?? source.pdf_page,
        printedPage: source.printed_page,
        drawing: object.drawing ?? source.drawing,
        drawingRevision: source.drawing_revision,
        bboxPdfPoints: object.evidence_bbox ?? null,
        bboxDisplayPdfPoints: null,
      },
    });
  }
  return measurements;
}

const ASSET_CORE_KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'kind',
  'representation',
  'files',
  'file_sha256',
  'source',
  'extraction',
  'dimensions_mm',
  'review',
  'license_status',
  'release_ready',
  'related_assets',
]);

const FILE_ROLES: readonly AssetFileRole[] = ['reference_png', 'reference_svg', 'renderer_svg', 'geometry_json'];

function isFileRole(value: string): value is AssetFileRole {
  return (FILE_ROLES as readonly string[]).includes(value);
}

/**
 * Lifts a manifest record into the provenance/review half of an AssetDefinition without deciding
 * its runtime role or geometry (that is C1's family-specific work). Every hash, locator, dimension
 * and warning is preserved; `releaseReady` is copied, never computed.
 */
export function adaptExtractionAsset(
  family: ExtractionFamily,
  asset: ExtractionAsset,
): Pick<AssetDefinition, 'id' | 'name' | 'provenance' | 'review' | 'unknowns'> {
  const files: AssetFile[] = [];
  for (const [role, filePath] of Object.entries(asset.files)) {
    if (filePath === null || !isFileRole(role)) continue;
    const hash = asset.file_sha256[role] ?? null;
    files.push({ role, path: filePath, sha256: hash === null ? null : sha256(hash) });
  }

  const measurements = adaptDimensions(asset.dimensions_mm, asset.source);

  const rawFamilyEvidence: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asset)) {
    if (!ASSET_CORE_KEYS.has(key)) rawFamilyEvidence[key] = value;
  }

  return {
    id: assetId(asset.id),
    name: asset.name,
    provenance: {
      family,
      representation: asset.representation,
      files,
      geometrySources: [adaptExtractionLocator(asset.source)],
      meaningSources: [],
      measurements,
      rawDimensionsMm: asset.dimensions_mm,
      rawFamilyEvidence,
      extractionRecipe: {
        method: asset.extraction.method,
        tool: asset.extraction.tool,
        toolVersion: asset.extraction.tool_version,
        recipe: asset.extraction.recipe,
        recipeSha256: asset.extraction.recipe_sha256 ? sha256(asset.extraction.recipe_sha256) : null,
      },
      relatedAssetIds: asset.related_assets.map(assetId),
    },
    review: {
      extractionStatus: asset.review.status,
      runtimeState: 'draft',
      warnings: asset.review.warnings,
      contentApproved: asset.review.content_approved,
      reuseApproved: asset.review.reuse_approved,
      approvalEvidence: asset.review.approval_evidence,
      licenseStatus: asset.license_status,
      releaseReady: asset.release_ready,
    },
    unknowns: [],
  };
}
