import { z } from 'zod';
import { EXTRACTION_MANIFEST_SCHEMA_VERSION } from './version';

/**
 * Raw shapes of the JSON produced by tools/asset_extraction (mirrors contract.py). The Python
 * contract uses `extra="allow"`, so every schema here is `.loose()`: family-specific evidence
 * (mandatory `traffic_rule`, assemblies `assembly_context`, markings `vector_selection`, ...) is
 * preserved on the parsed value and must survive adaptation untouched.
 *
 * Nothing here interprets meaning. C1 (packages/asset-registry) compiles these records into
 * runtime AssetDefinitions through `adaptExtractionAsset` and its own family adapters.
 */

export const EXTRACTION_FAMILIES = [
  'mandatory',
  'prohibitory',
  'warning',
  'informatory',
  'markings',
  'assemblies',
] as const;
export type ExtractionFamily = (typeof EXTRACTION_FAMILIES)[number];

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** `JsonValue` from contract.py. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const extractionSourceSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().regex(/^https:\/\//),
    sha256: sha256Schema,
    publisher: z.string().min(1),
    collection_revision: z.string().nullable(),
    retrieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    page_count: z.number().int().positive().nullable().optional(),
    pages: z.number().int().positive().nullable().optional(),
    snapshot_file: z.string().nullable().optional(),
    snapshot_complete: z.boolean().nullable().optional(),
    hash_scope: z.string().optional(),
    edition: z.string().optional(),
    filename: z.string().optional(),
    notes: z.string().optional(),
  })
  .loose();

export const extractionLocatorSchema = z
  .object({
    source_id: z.string(),
    pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable(),
    drawing: z.string().nullable(),
    drawing_revision: z.string().nullable(),
    bbox_pdf_points: bboxSchema,
    bbox_display_pdf_points: bboxSchema.nullable().optional(),
    bbox_coordinate_system: z.string().optional(),
    original_page_rotation_degrees: z.number().optional(),
    image_xref: z.number().int().nullable().optional(),
    drawing_issue_date: z.string().nullable().optional(),
    drawing_revision_date: z.string().nullable().optional(),
  })
  .loose();

export const extractionRecipeSchema = z
  .object({
    method: z.string().min(1),
    tool: z.string().min(1),
    tool_version: z.string().min(1),
    recipe: z.string().min(1),
    recipe_sha256: z.string().nullable().optional(),
    script: z.string().nullable().optional(),
    pixel_size: z.array(z.number().int()).nullable().optional(),
  })
  .loose();

export const extractionReviewSchema = z
  .object({
    status: z.enum([
      'extracted_reference',
      'cleaned_unverified',
      'verified_geometry',
      'blocked',
      'approved',
    ]),
    warnings: z.array(z.string()),
    content_approved: z.boolean().default(false),
    reuse_approved: z.boolean().default(false),
    approval_evidence: z.array(z.string()).default([]),
  })
  .loose();

/**
 * `dimensions_mm` is `dict[str, JsonValue]` in the Python contract and its layout differs by family:
 * markings store bare numbers; mandatory/warning signs store per-dimension measurement objects
 * (`{value, endpoints, evidence_bbox, source_id, pdf_page, drawing, units}`); the warning family also
 * places `endpoints`/`method`/`evidence_bbox_pdf_points`/`geometry_generated` beside the numbers.
 * Every entry is preserved verbatim; the adapter interprets the recognised shapes.
 */
export const extractionMeasurementObjectSchema = z
  .object({
    value: z.number().nullable().optional(),
    endpoints: z.string().optional(),
    evidence_bbox: bboxSchema.optional(),
    source_id: z.string().optional(),
    pdf_page: z.number().int().optional(),
    drawing: z.string().nullable().optional(),
    units: z.string().optional(),
  })
  .loose();
export type ExtractionMeasurementObject = z.infer<typeof extractionMeasurementObjectSchema>;

/** Flat warning-family metadata keys that describe the sibling numeric dimensions. */
export const FLAT_DIMENSION_METADATA_KEYS = Object.freeze(['endpoints', 'method', 'evidence_bbox_pdf_points', 'geometry_generated'] as const);

export const extractionDimensionEntrySchema: z.ZodType<JsonValue> = jsonValueSchema;

export const extractionAssetSchema = z
  .object({
    id: z.string().regex(/^sg\.[a-z]+\.[a-z0-9][a-z0-9.-]*$/),
    name: z.string().min(1),
    kind: z.string().min(1),
    representation: z.enum(['source_reference', 'cleaned_vector', 'parametric_geometry']),
    files: z.record(z.string(), z.string().nullable()),
    file_sha256: z.record(z.string(), sha256Schema.nullable()),
    source: extractionLocatorSchema,
    extraction: extractionRecipeSchema,
    dimensions_mm: z.record(z.string(), extractionDimensionEntrySchema),
    review: extractionReviewSchema,
    license_status: z.string(),
    release_ready: z.boolean(),
    related_assets: z.array(z.string()).default([]),
    assembly_definition_ids: z.array(z.string()).optional(),
  })
  .loose();

export const extractionCoverageSchema = z
  .object({
    source_id: z.string(),
    pdf_page: z.number().int().min(1).nullable(),
    drawing: z.string().nullable(),
    asset_ids: z.array(z.string()),
    status: z.enum(['extracted', 'reference_only', 'not_applicable', 'deferred', 'failed']),
    reason: z.string().min(1),
    extraction_failures: z.array(z.string()).default([]),
  })
  .loose();

export const extractionManifestSchema = z
  .object({
    schema_version: z.literal(EXTRACTION_MANIFEST_SCHEMA_VERSION),
    family: z.enum(EXTRACTION_FAMILIES),
    sources: z.array(extractionSourceSchema).min(1),
    assets: z.array(extractionAssetSchema).min(1),
    coverage: z.array(extractionCoverageSchema).min(1),
  })
  .loose();

const markingMeasurementEvidenceSchema = z
  .object({
    parameter: z.string(),
    value: z.number(),
    unit: z.literal('mm'),
    measurement_endpoints: z.array(z.string()),
    source: extractionLocatorSchema,
    method: z.string(),
  })
  .loose();

const markingGeometryCommonSchema = z.object({
  schema_version: z.literal(1),
  asset_id: z.string(),
  units: z.literal('mm'),
  representation: z.literal('parametric_geometry'),
  parameters_mm: z.record(z.string(), z.number()),
  measurement_evidence: z.array(markingMeasurementEvidenceSchema),
  unknown: z.array(z.string()),
  license_status: z.string(),
  release_ready: z.boolean(),
});

/** Row-based line profile (RMS lines A–N except the A9 dot groups): `rows` × painted/gap parameters. */
export const markingRowGeometryProfileSchema = markingGeometryCommonSchema
  .extend({
    rows: z.number().int().positive(),
    derived_row_centre_spacing_mm: z.number().nullable(),
    row_colors_in_source_order: z.array(z.string()),
    color: z.object({ svg: z.string(), status: z.string() }).loose(),
    display_sample: z
      .object({
        painted_segments_per_row: z.number().int(),
        continuous_sample_length_mm: z.number().nullable(),
        continuous_sample_length_is_engineering_requirement: z.boolean(),
        axis: z.string(),
        attachment: z.string(),
      })
      .loose(),
  })
  .loose();

/** Circle-group profile (RMS A9 intersecting-through guidance dots). */
export const markingCircleGroupGeometryProfileSchema = markingGeometryCommonSchema
  .extend({
    shape: z.literal('circle_groups'),
    dots_per_group: z.number().int().positive(),
    display_sample: z.object({ groups: z.number().int(), axis: z.string() }).loose(),
  })
  .loose();

/**
 * Parametric marking geometry profile (assets/sg/markings/geometry/*.json). Two layouts exist in the
 * extraction output; both are accepted and the discriminating fields (`rows` vs `shape`) are kept.
 */
export const markingGeometryProfileSchema = z.union([markingCircleGroupGeometryProfileSchema, markingRowGeometryProfileSchema]);

/** assets/sg/index.json summary. */
export const extractionIndexSchema = z
  .object({
    schema_version: z.literal(1),
    status: z.string(),
    complete: z.boolean(),
    asset_count: z.number().int(),
    release_ready_count: z.number().int(),
    quarantine_policy: z.string(),
    families: z.record(z.string(), z.unknown()),
  })
  .loose();

export type ExtractionSource = z.infer<typeof extractionSourceSchema>;
export type ExtractionLocator = z.infer<typeof extractionLocatorSchema>;
export type ExtractionRecipe = z.infer<typeof extractionRecipeSchema>;
export type ExtractionReview = z.infer<typeof extractionReviewSchema>;
export type ExtractionAsset = z.infer<typeof extractionAssetSchema>;
export type ExtractionCoverage = z.infer<typeof extractionCoverageSchema>;
export type ExtractionManifest = z.infer<typeof extractionManifestSchema>;
export type MarkingGeometryProfile = z.infer<typeof markingGeometryProfileSchema>;
export type ExtractionIndex = z.infer<typeof extractionIndexSchema>;

export function parseExtractionManifest(json: unknown): ExtractionManifest {
  return extractionManifestSchema.parse(json);
}

export function parseMarkingGeometryProfile(json: unknown): MarkingGeometryProfile {
  return markingGeometryProfileSchema.parse(json);
}

export function parseExtractionIndex(json: unknown): ExtractionIndex {
  return extractionIndexSchema.parse(json);
}
