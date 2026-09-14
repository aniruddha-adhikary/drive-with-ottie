import { z } from 'zod';
import {
  type AssetDefinition,
  type AssetResolver,
  type Diagnostic,
  type Sha256,
  type SourceLocator,
  type SourceRef,
  EXTRACTION_FAMILIES,
  VALIDATOR_NAMES,
  assemblyDefinitionId,
  assetId,
  canonicalJson,
  millimetres,
  sha256,
  sourceId,
} from '@ottie/contracts';
import { type CompiledRegistry, type SourceConflict, createInMemoryResolver, registryHashInput } from '@ottie/asset-registry';
import { sha256Hex } from '@ottie/scenario-core';
import { StarterContentError } from './packages';

/**
 * The exact C1 dependency closure the starter worlds place, compiled from the extraction library
 * and written by `npm run review:export -- closure` (content/registry/README.md). The browser never
 * loads the 2.6 MB manifest library or all 339 assets: it loads this file, which carries
 *
 *  - `registryHash`: hash of the FULL compiled registry (every asset, not just the closure), so the
 *    resolver built here reports the same hash the Node CLI computes and the scenario packages pin;
 *  - `closureHash`: hash of the closure records themselves, so a hand edit is detected here even
 *    without the library; the CLI and tests additionally recompile the library and refuse any drift
 *    between this file and the compiled registry.
 *
 * Nothing here decides approval: quarantine flags, review state, unknowns and source conflicts are
 * copied verbatim from the compiled records and the resolver runs in development mode only.
 */

export const STARTER_CLOSURE_SCHEMA = 'ottie.starter-registry-closure/1' as const;

const sha = z.string().regex(/^[a-f0-9]{64}$/).transform(sha256);
const mm = z.number().transform(millimetres);
const unitVec3 = z.object({ x: z.number(), y: z.number(), z: z.number() }).strict();
const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly();

const locatorSchema = z
  .object({
    sourceId: z.string().transform(sourceId),
    pdfPage: z.number().int().positive().nullable(),
    printedPage: z.string().nullable(),
    drawing: z.string().nullable(),
    drawingRevision: z.string().nullable(),
    bboxPdfPoints: bbox.nullable(),
    bboxDisplayPdfPoints: bbox.nullable().optional(),
    section: z.string().nullable().optional(),
    quote: z.string().nullable().optional(),
  })
  .strict()
  .transform(({ bboxDisplayPdfPoints, section, quote, ...rest }): SourceLocator => ({
    ...rest,
    ...(bboxDisplayPdfPoints === undefined ? {} : { bboxDisplayPdfPoints }),
    ...(section === undefined ? {} : { section }),
    ...(quote === undefined ? {} : { quote }),
  }));

const measurementSchema = z
  .object({
    name: z.string(),
    valueMm: mm.nullable(),
    minimumMm: mm.nullable().optional(),
    maximumMm: mm.nullable().optional(),
    endpoints: z.string(),
    method: z.enum(['printed_dimension_label', 'pdf_vector_measurement', 'pixel_measurement', 'statutory_text', 'unknown']),
    locator: locatorSchema,
    notes: z.array(z.string()).readonly().optional(),
  })
  .strict()
  .transform(({ minimumMm, maximumMm, notes, ...rest }) => ({
    ...rest,
    ...(minimumMm === undefined ? {} : { minimumMm }),
    ...(maximumMm === undefined ? {} : { maximumMm }),
    ...(notes === undefined ? {} : { notes }),
  }));

const controlRegime = z.enum(['uncontrolled', 'give_way', 'stop', 'signalised', 'zebra_crossing']);
const roadClass = z.enum(['minor_access', 'local', 'major', 'expressway', 'development_access']);
const anchorKind = z.enum(['lane_boundary', 'control_line', 'movement_path', 'crossing_bound', 'roadside_edge', 'support_base']);

const attachmentPointSchema = z
  .object({
    name: z.string(),
    offsetMm: z.object({ x: mm, y: mm, z: mm }).strict(),
    accepts: z.array(z.enum(['face', 'signal_head', 'support', 'ground'])).readonly(),
  })
  .strict();

const geometrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('face'),
      face: z
        .object({
          shape: z.enum(['circle', 'triangle_point_down', 'triangle_point_up', 'octagon', 'rectangle', 'diamond']),
          widthMm: mm.nullable(),
          heightMm: mm.nullable(),
          front: unitVec3,
          up: unitVec3,
          mirrorAllowed: z.literal(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('marking'),
      marking: z
        .object({
          rows: z.number().int().positive(),
          widthMm: mm,
          paintedLengthMm: mm.nullable(),
          clearGapMm: mm.nullable(),
          interRowClearGapMm: mm.nullable(),
          continuous: z.boolean(),
          attachesTo: z.array(anchorKind).readonly(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('signal_head'),
      head: z
        .object({
          arrangement: z.enum(['vertical', 'horizontal']),
          aspects: z
            .array(
              z
                .object({
                  slot: z.string(),
                  colour: z.enum(['red', 'amber', 'green']),
                  shape: z.enum(['circular', 'arrow_left', 'arrow_right', 'arrow_straight', 'letter_b']),
                  column: z.number().int(),
                  row: z.number().int(),
                })
                .strict(),
            )
            .readonly(),
          lensDiameterMm: measurementSchema,
          lowestLensCentreAboveGroundMm: measurementSchema,
          adjacentLensCentreDistanceMm: measurementSchema,
          front: unitVec3,
          up: unitVec3,
          definitionIds: z.array(z.string().transform(assemblyDefinitionId)).readonly(),
        })
        .strict(),
    })
    .strict(),
  z.object({ kind: z.literal('support'), heightMm: mm.nullable(), attachments: z.array(attachmentPointSchema).readonly() }).strict(),
  z
    .object({
      kind: z.literal('vehicle'),
      vehicle: z
        .object({
          category: z.enum(['car', 'bus', 'lorry', 'motorcycle', 'bicycle']),
          lengthMm: mm,
          widthMm: mm,
          heightMm: mm,
          frontOffsetMm: mm,
        })
        .strict(),
    })
    .strict(),
  z.object({ kind: z.literal('reference_only') }).strict(),
]);

const assetRole = z.enum([
  'give_way_line',
  'stop_line',
  'shoulder_boundary',
  'centre_line_two_way',
  'lane_line_same_direction',
  'edge_line',
  'crossing_bound',
  'pedestrian_crossing',
  'zigzag_warning',
  'yellow_box',
  'direction_arrow',
  'bus_lane_line',
  'kerb_restriction',
  'other_marking',
  'give_way_sign',
  'stop_sign',
  'mandatory_sign',
  'prohibitory_sign',
  'warning_sign',
  'informatory_sign',
  'vehicle_signal_head',
  'pedestrian_signal_head',
  'bus_priority_aspect',
  'sign_post',
  'signal_pole',
  'signal_mast_arm',
  'gantry',
  'wall_bracket',
  'vehicle',
  'person',
]);

const assetDefinitionSchema = z
  .object({
    id: z.string().transform(assetId),
    version: z.number().int().positive(),
    name: z.string(),
    role: assetRole,
    allowedContexts: z
      .object({
        controlRegimes: z.array(controlRegime).readonly(),
        roadClasses: z.array(roadClass).readonly(),
        notes: z.array(z.string()).readonly().optional(),
      })
      .strict()
      .transform(({ notes, ...rest }) => ({ ...rest, ...(notes === undefined ? {} : { notes }) })),
    geometry: geometrySchema,
    attachments: z.array(attachmentPointSchema).readonly(),
    provenance: z
      .object({
        family: z.enum([...EXTRACTION_FAMILIES, 'runtime']),
        representation: z.enum(['source_reference', 'cleaned_vector', 'parametric_geometry']),
        files: z
          .array(
            z
              .object({
                role: z.enum(['reference_png', 'reference_svg', 'renderer_svg', 'geometry_json']),
                path: z.string(),
                sha256: sha.nullable(),
              })
              .strict(),
          )
          .readonly(),
        geometrySources: z.array(locatorSchema).readonly(),
        meaningSources: z.array(locatorSchema).readonly(),
        measurements: z.array(measurementSchema).readonly(),
        rawDimensionsMm: z.record(z.string(), z.unknown()).readonly(),
        rawFamilyEvidence: z.record(z.string(), z.unknown()).readonly(),
        extractionRecipe: z
          .object({
            method: z.string(),
            tool: z.string(),
            toolVersion: z.string(),
            recipe: z.string(),
            recipeSha256: sha.nullable(),
          })
          .strict(),
        relatedAssetIds: z.array(z.string().transform(assetId)).readonly(),
      })
      .strict(),
    review: z
      .object({
        extractionStatus: z.enum(['extracted_reference', 'cleaned_unverified', 'verified_geometry', 'blocked', 'approved']),
        runtimeState: z.enum(['draft', 'source_checked', 'content_reviewed', 'retired']),
        warnings: z.array(z.string()).readonly(),
        contentApproved: z.boolean(),
        reuseApproved: z.boolean(),
        approvalEvidence: z.array(z.string()).readonly(),
        licenseStatus: z.string(),
        releaseReady: z.boolean(),
      })
      .strict(),
    unknowns: z.array(z.string()).readonly(),
  })
  .strict()
  .transform((asset): AssetDefinition => asset);

const sourceRefSchema = z
  .object({
    id: z.string().transform(sourceId),
    url: z.string(),
    publisher: z.string(),
    edition: z.string().nullable(),
    collectionRevision: z.string().nullable(),
    publishedOn: z.string().nullable(),
    effectiveFrom: z.string().nullable(),
    retrievedAt: z.string(),
    sha256: sha,
    hashScope: z.string(),
    pageCount: z.number().int().positive().nullable(),
    verifiedFacts: z.array(z.string()).readonly(),
    unresolved: z.array(z.string()).readonly(),
  })
  .strict()
  .transform((source): SourceRef => source);

const sourceConflictSchema = z
  .object({
    sourceId: z.string().transform(sourceId),
    sha256s: z.array(z.string()).readonly(),
    families: z.array(z.enum(EXTRACTION_FAMILIES)).readonly(),
  })
  .strict()
  .transform((conflict): SourceConflict => conflict);

const diagnosticSchema = z
  .object({
    validator: z.enum(VALIDATOR_NAMES),
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string(),
    message: z.string(),
    entityIds: z.array(z.string()).readonly(),
    sourceRefs: z.array(locatorSchema).readonly().optional(),
    data: z.record(z.string(), z.unknown()).readonly().optional(),
  })
  .strict()
  .transform(({ sourceRefs, data, ...rest }): Diagnostic => ({
    ...rest,
    ...(sourceRefs === undefined ? {} : { sourceRefs }),
    ...(data === undefined ? {} : { data }),
  }));

const closureSchema = z
  .object({
    $comment: z.string(),
    schema: z.literal(STARTER_CLOSURE_SCHEMA),
    generatedBy: z.string().min(1),
    registryHash: sha,
    closureHash: sha,
    registryAssetCount: z.number().int().positive(),
    roots: z.array(z.string()).readonly(),
    assets: z.array(assetDefinitionSchema).min(1).readonly(),
    sources: z.array(sourceRefSchema).readonly(),
    sourceConflicts: z.array(sourceConflictSchema).readonly(),
    conflictedIds: z.array(z.string()).readonly(),
    /** Registry compiler diagnostics whose entity ids intersect the closure. */
    diagnostics: z.array(diagnosticSchema).readonly(),
  })
  .strict();

export type StarterClosure = z.output<typeof closureSchema>;

/** Hash over the closure's asset records only (sorted canonical JSON, same input as the registry hash). */
export function closureHashOf(assets: readonly AssetDefinition[]): Sha256 {
  return sha256(sha256Hex(registryHashInput(assets)));
}

export function parseStarterClosure(input: unknown): StarterClosure {
  const closure = closureSchema.parse(input);
  const actual = closureHashOf(closure.assets);
  if (actual !== closure.closureHash) {
    throw new StarterContentError(
      'registry_hash_mismatch',
      `starter closure records hash ${actual} but the file declares ${closure.closureHash}; regenerate with \`npm run review:export -- closure\``,
      { expected: closure.closureHash, actual },
    );
  }
  return closure;
}

/**
 * Development-mode resolver over the closure, reporting the FULL registry hash so generated
 * provenance matches the Node CLI. Quarantined records resolve (and are marked) because every
 * starter asset is unapproved; there is no release-mode variant of this resolver by design — release
 * export must go through C1 `exportRelease` over the full registry.
 */
export function createClosureResolver(closure: StarterClosure): AssetResolver {
  return createInMemoryResolver(closure.assets, 'development', closure.registryHash);
}

/** The record set the closure file must equal for the given compiled registry; shared by the writer and the drift check. */
export function projectClosure(
  registry: CompiledRegistry,
  registryHash: Sha256,
  closureAssets: readonly AssetDefinition[],
  roots: readonly string[],
  generatedBy: string,
): Omit<StarterClosure, 'closureHash'> & { readonly closureHash: Sha256 } {
  const ids = new Set<string>(closureAssets.map((asset) => asset.id));
  const sorted = [...closureAssets].sort((a, b) => (a.id === b.id ? a.version - b.version : a.id < b.id ? -1 : 1));
  return {
    $comment:
      'GENERATED by `npm run review:export -- closure` from assets/sg/*/manifest.json via @ottie/asset-registry. Do not edit by hand. Development records only: every asset here is quarantined/unapproved and keeps its source locators, hashes, unknowns and review state verbatim.',
    schema: STARTER_CLOSURE_SCHEMA,
    generatedBy,
    registryHash,
    closureHash: closureHashOf(sorted),
    registryAssetCount: registry.assets.length,
    roots: [...roots].sort(),
    assets: sorted,
    sources: [...registry.sources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    sourceConflicts: registry.sourceConflicts,
    conflictedIds: registry.conflictedIds.filter((id) => ids.has(id)),
    diagnostics: registry.diagnostics.filter((d) => d.entityIds.some((id) => ids.has(id))),
  };
}

/** Canonical file bytes for the closure (stable key order, trailing newline). */
export function serialiseClosure(closure: StarterClosure): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(closure)), null, 2)}\n`;
}
