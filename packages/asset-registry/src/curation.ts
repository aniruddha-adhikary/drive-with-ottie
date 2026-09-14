import { type AssetDefinition, type AssetId, type SourceLocator } from '@ottie/contracts';

/**
 * Facts the extraction manifests do not state and the compiler will not guess: semantic role,
 * where an asset may appear, its face/head geometry, attachment points, meaning sources. A curation
 * entry is explicit input authored per asset id; without one the compiler emits the conservative
 * default (family role, empty allowed contexts, `reference_only` geometry).
 *
 * Curation can never touch `review`, `provenance.files` or measurements: approval and hashes come
 * from the manifest alone.
 */
export interface AssetCuration {
  readonly role?: AssetDefinition['role'];
  readonly allowedContexts?: AssetDefinition['allowedContexts'];
  readonly geometry?: AssetDefinition['geometry'];
  readonly attachments?: AssetDefinition['attachments'];
  readonly meaningSources?: readonly SourceLocator[];
  readonly unknowns?: readonly string[];
}

export type CurationTable = Readonly<Partial<Record<AssetId, AssetCuration>>>;

/**
 * Lifts hand-authored definitions (e.g. the F0 development fixtures) into a curation table so the
 * compiled manifest record and the fixture agree on role/geometry while hashes and review state
 * keep coming from the manifest.
 */
export function curationFromDefinitions(definitions: readonly AssetDefinition[]): CurationTable {
  const table: Partial<Record<AssetId, AssetCuration>> = {};
  for (const definition of definitions) {
    table[definition.id] = {
      role: definition.role,
      allowedContexts: definition.allowedContexts,
      geometry: definition.geometry,
      attachments: definition.attachments,
      meaningSources: definition.provenance.meaningSources,
      unknowns: definition.unknowns,
    };
  }
  return table;
}
