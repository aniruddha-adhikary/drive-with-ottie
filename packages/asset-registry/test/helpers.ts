import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ExtractionAsset, type ExtractionManifest, parseExtractionManifest } from '@ottie/contracts';
import { type ExtractionLibrary } from '../src/records';
import { type LoadedExtractionLibrary, loadExtractionLibrary } from '../src/library.node';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let cached: LoadedExtractionLibrary | null = null;
export function realLibrary(): LoadedExtractionLibrary {
  cached ??= loadExtractionLibrary(REPO_ROOT);
  return cached;
}

export const HEX_A = 'a'.repeat(64);
export const HEX_B = 'b'.repeat(64);
export const HEX_C = 'c'.repeat(64);

type Json = Record<string, unknown>;

export function rawSource(overrides: Json = {}): Json {
  return {
    id: 'test-source',
    url: 'https://example.invalid/test.pdf',
    sha256: HEX_A,
    publisher: 'Test',
    collection_revision: null,
    page_count: 1,
    retrieved_at: '2026-01-01',
    ...overrides,
  };
}

export function rawSign(id: string, overrides: Json = {}): Json {
  const png = `assets/sg/mandatory/${id.split('.').pop() ?? id}.reference.png`;
  const svg = `assets/sg/mandatory/${id.split('.').pop() ?? id}.svg`;
  return {
    id,
    name: `Sign ${id}`,
    kind: 'sign_face',
    representation: 'cleaned_vector',
    files: { reference_svg: null, reference_png: png, renderer_svg: svg, geometry_json: null },
    file_sha256: { reference_png: HEX_A, renderer_svg: HEX_B },
    source: { source_id: 'test-source', pdf_page: 1, printed_page: null, drawing: null, drawing_revision: null, bbox_pdf_points: [0, 0, 10, 10] },
    extraction: { method: 'test', tool: 'test', tool_version: '0', recipe: 'test' },
    dimensions_mm: {},
    review: { status: 'cleaned_unverified', warnings: [] },
    license_status: 'pending',
    release_ready: false,
    ...overrides,
  };
}

export function rawReference(id: string, overrides: Json = {}): Json {
  const png = `assets/sg/assemblies/${id.split('.').pop() ?? id}.png`;
  return rawSign(id, {
    kind: 'assembly_reference',
    representation: 'source_reference',
    files: { reference_svg: null, reference_png: png, renderer_svg: null, geometry_json: null },
    file_sha256: { reference_png: HEX_A },
    ...overrides,
  });
}

/** Builds and schema-parses a manifest; `family` defaults to mandatory. */
export function rawManifest(overrides: Json = {}): ExtractionManifest {
  const assets = (overrides.assets as Json[] | undefined) ?? [rawSign('sg.mandatory.test-sign')];
  return parseExtractionManifest({
    schema_version: 1,
    family: 'mandatory',
    sources: [rawSource()],
    coverage: [{ source_id: 'test-source', pdf_page: 1, drawing: null, asset_ids: assets.map((a) => a.id), status: 'extracted', reason: 'test' }],
    ...overrides,
    assets,
  });
}

export function libraryOf(...manifests: ExtractionManifest[]): ExtractionLibrary {
  return { manifests, markingGeometry: {}, assemblyDefinitions: null };
}

export interface MutableLibrary {
  manifests: ExtractionManifest[];
  markingGeometry: Record<string, ExtractionLibrary['markingGeometry'][string]>;
  assemblyDefinitions: ExtractionLibrary['assemblyDefinitions'];
}

/** Deep clone of a library so a test can mutate one record without touching the shared cache. */
export function cloneLibrary(library: ExtractionLibrary): MutableLibrary {
  return structuredClone({
    manifests: [...library.manifests],
    markingGeometry: { ...library.markingGeometry },
    assemblyDefinitions: library.assemblyDefinitions,
  });
}

export function findAsset(library: MutableLibrary, id: string): ExtractionAsset {
  for (const manifest of library.manifests) {
    const found = manifest.assets.find((a) => a.id === id);
    if (found) return found;
  }
  throw new Error(`no manifest record ${id}`);
}
