import {
  type AssemblyDefinitionId,
  type AssetDefinition,
  type AssetFile,
  type AssetId,
  type AssetRef,
  type Diagnostic,
  type ExtractionFamily,
  type ExtractionManifest,
  type MarkingGeometryProfile,
  type ReviewState,
  type SourceId,
  type SourceLocator,
  type SourceRef,
} from '@ottie/contracts';
import { z } from 'zod';

/**
 * Everything the compiler reads. Produced by `loadExtractionLibrary` (node) or assembled by
 * hand in tests; the compiler itself never touches the filesystem so it can run in the browser.
 */
export interface ExtractionLibrary {
  readonly manifests: readonly ExtractionManifest[];
  /** Parsed `assets/sg/markings/geometry/*.json`, keyed by repository-relative path. */
  readonly markingGeometry: Readonly<Record<string, MarkingGeometryProfile>>;
  /** Parsed `assets/sg/assemblies/assembly-definitions.json`, or null when absent. */
  readonly assemblyDefinitions: AssemblyDefinitionsFile | null;
}

const assemblySourceEvidenceSchema = z
  .object({
    source_id: z.string().min(1),
    pdf_page: z.number().int().positive(),
    printed_page: z.string().nullable().optional(),
    drawing: z.string().nullable().optional(),
    drawing_revision: z.string().nullable().optional(),
    bbox_pdf_points: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().optional(),
    bbox_display_pdf_points: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().optional(),
  })
  .loose();

export const assemblyDefinitionSchema = z
  .object({
    id: z.string().regex(/^sg\.assemblies\.definition\.[a-z0-9][a-z0-9.-]*$/),
    name: z.string().min(1),
    source_assets: z.array(z.string()),
    inherits: z.string().nullable().optional(),
    release_ready: z.boolean(),
    license_status: z.string(),
    warnings: z.array(z.string()).optional(),
    source_evidence: z.array(assemblySourceEvidenceSchema).optional(),
  })
  .loose();

export const assemblyDefinitionsFileSchema = z
  .object({
    schema_version: z.literal(1),
    family: z.literal('assemblies'),
    review_status: z.string(),
    release_ready: z.boolean(),
    definitions: z.array(assemblyDefinitionSchema),
  })
  .loose();

export type AssemblyDefinitionsFile = z.infer<typeof assemblyDefinitionsFileSchema>;
export type RawAssemblyDefinition = z.infer<typeof assemblyDefinitionSchema>;

export function parseAssemblyDefinitionsFile(json: unknown): AssemblyDefinitionsFile {
  return assemblyDefinitionsFileSchema.parse(json);
}

/**
 * Cited-constraint definition (Rule 11 signal arrangements, LTA mount types). A definition depends
 * on its reference illustrations and on the definition it inherits from; a signal head asset that
 * cites a definition therefore transitively depends on all of them. `releaseReady` is copied.
 */
export interface AssemblyDefinitionRecord {
  readonly id: AssemblyDefinitionId;
  readonly name: string;
  readonly sourceAssetIds: readonly AssetId[];
  readonly inherits: AssemblyDefinitionId | null;
  readonly releaseReady: boolean;
  readonly licenseStatus: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly SourceLocator[];
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * A source drawing, layout sheet or assembly illustration that is evidence only. It has hashes and
 * a locator but no runtime role or geometry and can never be placed in a world; the resolver does
 * not know it (`unknown_asset`). Keeping these apart from `AssetDefinition` is what stops a scanned
 * bus-stop layout from being treated as a renderable sign.
 */
export interface ReferenceRecord {
  readonly id: AssetId;
  readonly name: string;
  readonly family: ExtractionFamily;
  /** Manifest `kind`, e.g. `assembly_reference`, `layout_reference`. */
  readonly kind: string;
  readonly files: readonly AssetFile[];
  readonly locator: SourceLocator;
  readonly review: ReviewState;
  readonly relatedAssetIds: readonly AssetId[];
  readonly rawFamilyEvidence: Readonly<Record<string, unknown>>;
}

/** Same source id declared with different bytes in two manifests. Never resolved by code. */
export interface SourceConflict {
  readonly sourceId: SourceId;
  readonly sha256s: readonly string[];
  readonly families: readonly ExtractionFamily[];
}

export interface CompiledRegistry {
  /** Renderer-eligible runtime records (signs, markings, signal heads, runtime supports/vehicles). */
  readonly assets: readonly AssetDefinition[];
  /** Evidence-only records; never resolvable, never renderable. */
  readonly references: readonly ReferenceRecord[];
  readonly sources: readonly SourceRef[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly assemblyDefinitions: readonly AssemblyDefinitionRecord[];
  /** Assembly definitions each signal asset cites (manifest `assembly_definition_ids` ∪ curated head). */
  readonly definitionCitations: Readonly<Partial<Record<AssetId, readonly AssemblyDefinitionId[]>>>;
  /**
   * Assets and definitions whose records carry an unresolved error (bad hash shape, dangling source,
   * duplicate id, conflicted source, renderer file on a reference record, ...). Present in
   * `assets` so development tooling can inspect them, but release export refuses every one.
   */
  readonly conflictedIds: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Files a renderer may consume (`renderer_svg`, `geometry_json`) versus evidence-only files. */
export interface FileClassification {
  readonly reference: readonly AssetFile[];
  readonly rendererCandidates: readonly AssetFile[];
}

export const RENDERER_FILE_ROLES: readonly AssetFile['role'][] = ['renderer_svg', 'geometry_json'];

export function classifyFiles(files: readonly AssetFile[]): FileClassification {
  return {
    reference: files.filter((f) => !RENDERER_FILE_ROLES.includes(f.role)),
    rendererCandidates: files.filter((f) => RENDERER_FILE_ROLES.includes(f.role)),
  };
}

export function refKey(ref: AssetRef): string {
  return `${ref.id}@${ref.version}`;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
