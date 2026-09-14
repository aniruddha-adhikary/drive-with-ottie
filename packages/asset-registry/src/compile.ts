import {
  type AssemblyDefinitionId,
  type AssetDefinition,
  type AssetId,
  type Diagnostic,
  type ExtractionAsset,
  type ExtractionFamily,
  type ExtractionManifest,
  type MarkingGeometryProfile,
  type SourceLocator,
  type SourceRef,
  adaptExtractionAsset,
  adaptExtractionLocator,
  adaptExtractionSource,
  assemblyDefinitionId,
  assetId,
  sourceId,
} from '@ottie/contracts';
import { type AssetCuration, type CurationTable } from './curation';
import { registryDiagnostic } from './diagnostics';
import { markingGeometryFor, markingRoleFor } from './adapters/markings';
import { isSignFamily, signRoleFor } from './adapters/signs';
import {
  type AssemblyDefinitionRecord,
  type CompiledRegistry,
  type ExtractionLibrary,
  type RawAssemblyDefinition,
  type ReferenceRecord,
  type SourceConflict,
  classifyFiles,
  compareStrings,
} from './records';

/** Manifest `kind` values that are evidence only and never become runtime assets. */
export const REFERENCE_KINDS: readonly string[] = ['layout_reference', 'assembly_reference'];

/** Manifest `kind` values the family adapters turn into runtime assets. */
export const RUNTIME_KINDS: readonly string[] = ['sign_face', 'road_marking', 'signal'];

/** Manifest records carry no version field; every compiled record is version 1 until a manifest does. */
export const COMPILED_ASSET_VERSION = 1;

export interface CompileOptions {
  /** Explicit per-asset role/context/geometry input. Never affects hashes or review state. */
  readonly curation?: CurationTable;
  /**
   * Hand-authored runtime assets (schematic supports, vehicles) that have no manifest record. They
   * must declare `provenance.family === 'runtime'` and may not carry renderer files.
   */
  readonly runtimeAssets?: readonly AssetDefinition[];
}

const EMPTY_CONTEXT: AssetDefinition['allowedContexts'] = { controlRegimes: [], roadClasses: [] };

/**
 * Compiles the extraction library into runtime records. Pure and deterministic: no filesystem, no
 * clock, no randomness. Every manifest record ends up in exactly one of `assets`, `references` or
 * `diagnostics` (skipped); nothing is guessed and nothing is promoted.
 */
export function compileRegistry(library: ExtractionLibrary, options: CompileOptions = {}): CompiledRegistry {
  const diagnostics: Diagnostic[] = [];
  const conflicted = new Set<string>();
  const curation = options.curation ?? {};

  const sources = collectSources(library.manifests, diagnostics);
  const conflictedSourceIds = new Set<string>(sources.conflicts.map((c) => c.sourceId));

  const seenIds = new Map<string, ExtractionFamily>();
  const citations = new Map<AssetId, readonly AssemblyDefinitionId[]>();
  const assets: AssetDefinition[] = [];
  const references: ReferenceRecord[] = [];

  for (const manifest of library.manifests) {
    const manifestSourceIds = new Set(manifest.sources.map((s) => s.id));
    for (const record of manifest.assets) {
      const previous = seenIds.get(record.id);
      if (previous !== undefined) {
        diagnostics.push(registryDiagnostic('duplicate_id', 'error', `${record.id} declared by both ${previous} and ${manifest.family}`, [record.id]));
        conflicted.add(record.id);
        continue;
      }
      seenIds.set(record.id, manifest.family);

      const recordDiagnostics = checkRecordShape(manifest.family, record, manifestSourceIds);
      diagnostics.push(...recordDiagnostics);
      if (recordDiagnostics.some((d) => d.severity === 'error')) conflicted.add(record.id);
      if (conflictedSourceIds.has(record.source.source_id)) {
        diagnostics.push(registryDiagnostic('source_conflict', 'error', `${record.id} cites conflicted source ${record.source.source_id}`, [record.id]));
        conflicted.add(record.id);
      }

      let adapted: ReturnType<typeof adaptExtractionAsset>;
      try {
        adapted = adaptExtractionAsset(manifest.family, record);
      } catch (error) {
        diagnostics.push(registryDiagnostic('malformed_record', 'error', `${record.id}: ${String(error)}; record skipped`, [record.id]));
        conflicted.add(record.id);
        continue;
      }

      if (REFERENCE_KINDS.includes(record.kind)) {
        const renderer = classifyFiles(adapted.provenance.files).rendererCandidates;
        if (renderer.length > 0) {
          diagnostics.push(registryDiagnostic('reference_with_renderer_file', 'error', `${record.id} is ${record.kind} but declares ${renderer.map((f) => f.role).join(', ')}`, [record.id]));
          conflicted.add(record.id);
        }
        references.push({
          id: adapted.id,
          name: adapted.name,
          family: manifest.family,
          kind: record.kind,
          files: adapted.provenance.files,
          locator: adaptExtractionLocator(record.source),
          review: adapted.review,
          relatedAssetIds: adapted.provenance.relatedAssetIds,
          rawFamilyEvidence: adapted.provenance.rawFamilyEvidence,
        });
        continue;
      }

      if (!RUNTIME_KINDS.includes(record.kind)) {
        diagnostics.push(registryDiagnostic('unknown_kind', 'error', `${record.id} has unknown kind ${record.kind}; record skipped`, [record.id]));
        conflicted.add(record.id);
        continue;
      }

      if (record.representation === 'source_reference' && classifyFiles(adapted.provenance.files).rendererCandidates.length > 0) {
        diagnostics.push(registryDiagnostic('source_reference_with_renderer_file', 'error', `${record.id} is a source_reference but declares renderer files`, [record.id]));
        conflicted.add(record.id);
      }

      const curated: AssetCuration = curation[adapted.id] ?? {};
      const built = buildAsset(manifest.family, record, adapted, curated, library.markingGeometry);
      if (built.diagnostics.some((d) => d.severity === 'error')) conflicted.add(record.id);
      diagnostics.push(...built.diagnostics);
      assets.push(built.asset);
      if (built.citedDefinitions.length > 0) citations.set(built.asset.id, built.citedDefinitions);
    }
  }

  const assemblyDefinitions = compileAssemblyDefinitions(library.assemblyDefinitions, seenIds, references, diagnostics, conflicted);
  const definitionIds = new Set(assemblyDefinitions.map((d) => d.id));

  for (const asset of assets) {
    const cited = citations.get(asset.id) ?? [];
    const fromGeometry = asset.geometry.kind === 'signal_head' ? asset.geometry.head.definitionIds : [];
    const all = [...new Set([...cited, ...fromGeometry])].sort(compareStrings);
    if (all.length > 0) citations.set(asset.id, all);
    for (const definitionId of all) {
      if (!definitionIds.has(definitionId)) {
        diagnostics.push(registryDiagnostic('unknown_definition', 'error', `${asset.id} cites unknown assembly definition ${definitionId}`, [asset.id, definitionId]));
        conflicted.add(asset.id);
      }
    }
  }
  for (const asset of assets) {
    for (const related of asset.provenance.relatedAssetIds) {
      if (!seenIds.has(related)) {
        diagnostics.push(registryDiagnostic('dangling_related_asset', 'warning', `${asset.id} relates to unknown ${related}`, [asset.id, related]));
      }
    }
  }

  for (const runtime of options.runtimeAssets ?? []) {
    if (seenIds.has(runtime.id)) {
      diagnostics.push(registryDiagnostic('duplicate_id', 'error', `${runtime.id} is both a manifest record and a runtime asset`, [runtime.id]));
      conflicted.add(runtime.id);
      continue;
    }
    seenIds.set(runtime.id, 'assemblies');
    if (runtime.provenance.family !== 'runtime') {
      diagnostics.push(registryDiagnostic('runtime_asset_claims_extraction', 'error', `${runtime.id} is not manifest-backed but claims family ${runtime.provenance.family}`, [runtime.id]));
      conflicted.add(runtime.id);
    }
    if (classifyFiles(runtime.provenance.files).rendererCandidates.length > 0) {
      diagnostics.push(registryDiagnostic('runtime_asset_with_renderer_file', 'error', `${runtime.id} declares renderer files without a manifest hash`, [runtime.id]));
      conflicted.add(runtime.id);
    }
    if (runtime.review.releaseReady || runtime.review.contentApproved || runtime.review.reuseApproved) {
      diagnostics.push(registryDiagnostic('runtime_asset_self_approved', 'error', `${runtime.id} carries approval flags without a manifest record`, [runtime.id]));
      conflicted.add(runtime.id);
    }
    assets.push(runtime);
  }

  assets.sort((a, b) => compareStrings(a.id, b.id) || a.version - b.version);
  references.sort((a, b) => compareStrings(a.id, b.id));

  return {
    assets,
    references,
    sources: sources.refs,
    sourceConflicts: sources.conflicts,
    assemblyDefinitions,
    definitionCitations: Object.fromEntries([...citations.entries()].sort(([a], [b]) => compareStrings(a, b))),
    conflictedIds: [...conflicted].sort(compareStrings),
    diagnostics,
  };
}

function collectSources(manifests: readonly ExtractionManifest[], diagnostics: Diagnostic[]): { refs: SourceRef[]; conflicts: SourceConflict[] } {
  const byId = new Map<string, { ref: SourceRef; shas: Set<string>; families: Set<ExtractionFamily> }>();
  for (const manifest of manifests) {
    for (const source of manifest.sources) {
      const entry = byId.get(source.id);
      if (entry) {
        entry.shas.add(source.sha256);
        entry.families.add(manifest.family);
      } else {
        try {
          byId.set(source.id, { ref: adaptExtractionSource(source), shas: new Set([source.sha256]), families: new Set([manifest.family]) });
        } catch (error) {
          diagnostics.push(registryDiagnostic('malformed_source', 'error', `${manifest.family}: ${String(error)}`, [source.id]));
        }
      }
    }
  }
  const refs: SourceRef[] = [];
  const conflicts: SourceConflict[] = [];
  for (const [id, entry] of [...byId.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    refs.push(entry.ref);
    if (entry.shas.size > 1) {
      const conflict: SourceConflict = { sourceId: sourceId(id), sha256s: [...entry.shas].sort(compareStrings), families: [...entry.families].sort(compareStrings) };
      conflicts.push(conflict);
      diagnostics.push(registryDiagnostic('source_conflict', 'error', `source ${id} has ${entry.shas.size} different hashes across ${conflict.families.join(', ')}`, [id], { sha256s: conflict.sha256s }));
    }
  }
  return { refs, conflicts };
}

/** Structural checks the Zod schema cannot express (cross-field and cross-record). */
function checkRecordShape(family: ExtractionFamily, record: ExtractionAsset, manifestSourceIds: ReadonlySet<string>): Diagnostic[] {
  const out: Diagnostic[] = [];
  try {
    assetId(record.id);
  } catch (error) {
    out.push(registryDiagnostic('malformed_id', 'error', String(error), [record.id]));
  }
  if (!record.id.startsWith(`sg.${family}.`)) {
    out.push(registryDiagnostic('id_family_mismatch', 'error', `${record.id} is declared in the ${family} manifest`, [record.id]));
  }
  if (!manifestSourceIds.has(record.source.source_id)) {
    out.push(registryDiagnostic('dangling_source', 'error', `${record.id} cites ${record.source.source_id}, not declared in the ${family} manifest sources`, [record.id]));
  }
  for (const [role, filePath] of Object.entries(record.files)) {
    if (filePath === null) continue;
    if (record.file_sha256[role] === undefined || record.file_sha256[role] === null) {
      out.push(registryDiagnostic('missing_file_hash', 'error', `${record.id} declares ${role} without a sha256`, [record.id], { role, path: filePath }));
    }
    if (filePath.startsWith('/') || filePath.includes('..')) {
      out.push(registryDiagnostic('unsafe_file_path', 'error', `${record.id} ${role} path escapes the repository`, [record.id], { path: filePath }));
    }
  }
  for (const role of Object.keys(record.file_sha256)) {
    if (record.files[role] === undefined || record.files[role] === null) {
      out.push(registryDiagnostic('orphan_file_hash', 'warning', `${record.id} hashes ${role} but declares no file`, [record.id]));
    }
  }
  if (record.release_ready && !(record.review.content_approved && record.review.reuse_approved && record.review.approval_evidence.length > 0)) {
    out.push(registryDiagnostic('release_ready_without_approval', 'error', `${record.id} is release_ready without content/reuse approval evidence`, [record.id]));
  }
  if (record.review.status === 'blocked' && record.release_ready) {
    out.push(registryDiagnostic('blocked_release_ready', 'error', `${record.id} is blocked and release_ready`, [record.id]));
  }
  return out;
}

interface BuiltAsset {
  readonly asset: AssetDefinition;
  readonly citedDefinitions: readonly AssemblyDefinitionId[];
  readonly diagnostics: readonly Diagnostic[];
}

function buildAsset(
  family: ExtractionFamily,
  record: ExtractionAsset,
  adapted: ReturnType<typeof adaptExtractionAsset>,
  curated: AssetCuration,
  geometryFiles: Readonly<Record<string, MarkingGeometryProfile>>,
): BuiltAsset {
  const out: Diagnostic[] = [];
  const citedDefinitions: AssemblyDefinitionId[] = [];
  let role: AssetDefinition['role'];
  let geometry: AssetDefinition['geometry'] = { kind: 'reference_only' };
  const unknowns: string[] = [...adapted.unknowns];

  if (record.kind === 'sign_face' && isSignFamily(family)) {
    role = signRoleFor(family, record);
  } else if (record.kind === 'road_marking' && family === 'markings') {
    role = markingRoleFor(adapted.id);
    const geometryFile = adapted.provenance.files.find((f) => f.role === 'geometry_json');
    if (geometryFile) {
      const profile = geometryFiles[geometryFile.path];
      if (profile === undefined) {
        out.push(registryDiagnostic('missing_geometry_file', 'error', `${record.id} declares ${geometryFile.path} but it was not loaded`, [record.id]));
      } else if (profile.asset_id !== record.id) {
        out.push(registryDiagnostic('geometry_asset_mismatch', 'error', `${geometryFile.path} belongs to ${profile.asset_id}, not ${record.id}`, [record.id, profile.asset_id]));
      } else {
        if (profile.release_ready !== record.release_ready) {
          out.push(registryDiagnostic('geometry_release_flag_mismatch', 'error', `${record.id}: geometry release_ready=${String(profile.release_ready)} but manifest says ${String(record.release_ready)}`, [record.id]));
        }
        const lifted = markingGeometryFor(adapted.id, role, profile);
        out.push(...lifted.diagnostics);
        geometry = lifted.geometry;
        unknowns.push(...profile.unknown);
      }
    }
  } else if (record.kind === 'signal' && family === 'assemblies') {
    role = 'vehicle_signal_head';
    for (const cited of record.assembly_definition_ids ?? []) {
      try {
        citedDefinitions.push(assemblyDefinitionId(cited));
      } catch (error) {
        out.push(registryDiagnostic('malformed_id', 'error', `${record.id}: ${String(error)}`, [record.id]));
      }
    }
  } else {
    out.push(registryDiagnostic('kind_family_mismatch', 'error', `${record.id}: kind ${record.kind} is not valid in the ${family} manifest`, [record.id]));
    role = curated.role ?? 'other_marking';
  }

  if (curated.role !== undefined && curated.role !== role) {
    if (isCompatibleRoleOverride(role, curated.role)) {
      role = curated.role;
    } else {
      out.push(registryDiagnostic('curation_role_conflict', 'error', `${record.id}: curation role ${curated.role} contradicts manifest-derived ${role}`, [record.id]));
    }
  }
  if (curated.geometry !== undefined) {
    if (geometry.kind !== 'reference_only' && curated.geometry.kind !== geometry.kind) {
      out.push(registryDiagnostic('curation_geometry_conflict', 'error', `${record.id}: curation geometry ${curated.geometry.kind} contradicts manifest-derived ${geometry.kind}`, [record.id]));
    } else {
      geometry = curated.geometry;
    }
  }

  const meaningSources: readonly SourceLocator[] = curated.meaningSources ?? [];
  const asset: AssetDefinition = {
    id: adapted.id,
    version: COMPILED_ASSET_VERSION,
    name: adapted.name,
    role,
    allowedContexts: curated.allowedContexts ?? EMPTY_CONTEXT,
    geometry,
    attachments: curated.attachments ?? [],
    provenance: { ...adapted.provenance, meaningSources },
    review: adapted.review,
    unknowns: [...new Set([...unknowns, ...(curated.unknowns ?? [])])],
  };
  return { asset, citedDefinitions, diagnostics: out };
}

/** Curation may refine a family role to a member of the same group, never cross groups. */
function isCompatibleRoleOverride(derived: AssetDefinition['role'], curated: AssetDefinition['role']): boolean {
  const groups: readonly (readonly AssetDefinition['role'][])[] = [
    ['mandatory_sign', 'give_way_sign', 'stop_sign'],
    ['prohibitory_sign'],
    ['warning_sign'],
    ['informatory_sign'],
    ['vehicle_signal_head', 'pedestrian_signal_head', 'bus_priority_aspect'],
  ];
  if (derived === 'other_marking') return isMarkingRole(curated);
  return groups.some((g) => g.includes(derived) && g.includes(curated));
}

function isMarkingRole(role: AssetDefinition['role']): boolean {
  return (
    [
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
    ] as readonly string[]
  ).includes(role);
}

function compileAssemblyDefinitions(
  file: ExtractionLibrary['assemblyDefinitions'],
  knownIds: ReadonlyMap<string, ExtractionFamily>,
  references: readonly ReferenceRecord[],
  diagnostics: Diagnostic[],
  conflicted: Set<string>,
): AssemblyDefinitionRecord[] {
  if (file === null) return [];
  const referenceIds = new Set(references.map((r) => r.id));
  const out: AssemblyDefinitionRecord[] = [];
  const seen = new Set<string>();
  for (const raw of file.definitions) {
    const record = liftDefinition(raw, file.release_ready, diagnostics, conflicted);
    if (record === null) continue;
    if (seen.has(record.id)) {
      diagnostics.push(registryDiagnostic('duplicate_id', 'error', `assembly definition ${record.id} declared twice`, [record.id]));
      conflicted.add(record.id);
      continue;
    }
    seen.add(record.id);
    for (const sourceAsset of record.sourceAssetIds) {
      if (!knownIds.has(sourceAsset)) {
        diagnostics.push(registryDiagnostic('dangling_definition_source', 'error', `${record.id} cites unknown asset ${sourceAsset}`, [record.id, sourceAsset]));
        conflicted.add(record.id);
      } else if (!referenceIds.has(sourceAsset) && !sourceAsset.startsWith('sg.assemblies.signal-')) {
        diagnostics.push(registryDiagnostic('definition_source_not_reference', 'warning', `${record.id} cites runtime asset ${sourceAsset} as evidence`, [record.id, sourceAsset]));
      }
    }
    out.push(record);
  }
  const ids = new Set(out.map((d) => d.id));
  for (const record of out) {
    if (record.inherits !== null && !ids.has(record.inherits)) {
      diagnostics.push(registryDiagnostic('dangling_definition_parent', 'error', `${record.id} inherits unknown ${record.inherits}`, [record.id, record.inherits]));
      conflicted.add(record.id);
    }
  }
  for (const record of out) {
    const chain = new Set<string>();
    let cursor: AssemblyDefinitionId | null = record.id;
    while (cursor !== null) {
      if (chain.has(cursor)) {
        diagnostics.push(registryDiagnostic('definition_inheritance_cycle', 'error', `${record.id} has an inheritance cycle via ${cursor}`, [record.id]));
        conflicted.add(record.id);
        break;
      }
      chain.add(cursor);
      cursor = out.find((d) => d.id === cursor)?.inherits ?? null;
    }
  }
  out.sort((a, b) => compareStrings(a.id, b.id));
  return out;
}

const DEFINITION_CORE_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'source_assets', 'inherits', 'release_ready', 'license_status', 'warnings', 'source_evidence']);

function liftDefinition(raw: RawAssemblyDefinition, fileReleaseReady: boolean, diagnostics: Diagnostic[], conflicted: Set<string>): AssemblyDefinitionRecord | null {
  let id: AssemblyDefinitionId;
  try {
    id = assemblyDefinitionId(raw.id);
  } catch (error) {
    diagnostics.push(registryDiagnostic('malformed_id', 'error', String(error), [raw.id]));
    conflicted.add(raw.id);
    return null;
  }
  const sourceAssetIds: AssetId[] = [];
  for (const source of raw.source_assets) {
    try {
      sourceAssetIds.push(assetId(source));
    } catch (error) {
      diagnostics.push(registryDiagnostic('malformed_id', 'error', `${raw.id}: ${String(error)}`, [raw.id]));
      conflicted.add(raw.id);
    }
  }
  let inherits: AssemblyDefinitionId | null = null;
  if (raw.inherits !== undefined && raw.inherits !== null) {
    try {
      inherits = assemblyDefinitionId(raw.inherits);
    } catch (error) {
      diagnostics.push(registryDiagnostic('malformed_id', 'error', `${raw.id}: ${String(error)}`, [raw.id]));
      conflicted.add(raw.id);
    }
  }
  if (raw.release_ready && !fileReleaseReady) {
    diagnostics.push(registryDiagnostic('release_ready_without_approval', 'error', `${raw.id} is release_ready inside a file that is not`, [raw.id]));
    conflicted.add(raw.id);
  }
  const evidence: SourceLocator[] = [];
  for (const item of raw.source_evidence ?? []) {
    evidence.push({
      sourceId: sourceId(item.source_id),
      pdfPage: item.pdf_page,
      printedPage: item.printed_page ?? null,
      drawing: item.drawing ?? null,
      drawingRevision: item.drawing_revision ?? null,
      bboxPdfPoints: item.bbox_pdf_points ?? null,
      bboxDisplayPdfPoints: item.bbox_display_pdf_points ?? null,
    });
  }
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!DEFINITION_CORE_KEYS.has(key)) rest[key] = value;
  }
  return {
    id,
    name: raw.name,
    sourceAssetIds,
    inherits,
    releaseReady: raw.release_ready,
    licenseStatus: raw.license_status,
    warnings: raw.warnings ?? [],
    evidence,
    raw: rest,
  };
}
