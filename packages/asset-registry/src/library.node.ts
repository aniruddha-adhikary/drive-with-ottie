/**
 * Node-only loading and byte verification of the extraction library. Not re-exported from the
 * package index so the browser bundle never pulls `node:fs`; import via
 * `@ottie/asset-registry/library.node`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  type Diagnostic,
  type ExtractionManifest,
  type MarkingGeometryProfile,
  EXTRACTION_FAMILIES,
  parseExtractionManifest,
  parseMarkingGeometryProfile,
} from '@ottie/contracts';
import { registryDiagnostic } from './diagnostics';
import { type CompiledRegistry, type ExtractionLibrary, parseAssemblyDefinitionsFile } from './records';

export interface LoadedExtractionLibrary extends ExtractionLibrary {
  readonly repoRoot: string;
  /** Files that failed to parse; the library is still returned with the rest. */
  readonly diagnostics: readonly Diagnostic[];
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

/** Reads and schema-parses every `assets/sg/<family>/manifest.json`, marking geometry file and the assembly definitions. */
export function loadExtractionLibrary(repoRoot: string): LoadedExtractionLibrary {
  const diagnostics: Diagnostic[] = [];
  const manifests: ExtractionManifest[] = [];
  for (const family of EXTRACTION_FAMILIES) {
    const file = path.join(repoRoot, 'assets/sg', family, 'manifest.json');
    if (!existsSync(file)) {
      diagnostics.push(registryDiagnostic('manifest_missing', 'warning', `no manifest for ${family}`, [family], { file }));
      continue;
    }
    try {
      manifests.push(parseExtractionManifest(readJson(file)));
    } catch (error) {
      diagnostics.push(registryDiagnostic('manifest_invalid', 'error', `${family}: ${String(error)}`, [family], { file }));
    }
  }

  const markingGeometry: Record<string, MarkingGeometryProfile> = {};
  const geometryDir = path.join(repoRoot, 'assets/sg/markings/geometry');
  if (existsSync(geometryDir)) {
    for (const name of readdirSync(geometryDir).sort()) {
      if (!name.endsWith('.json')) continue;
      const relative = path.posix.join('assets/sg/markings/geometry', name);
      try {
        markingGeometry[relative] = parseMarkingGeometryProfile(readJson(path.join(geometryDir, name)));
      } catch (error) {
        diagnostics.push(registryDiagnostic('geometry_invalid', 'error', `${relative}: ${String(error)}`, [relative]));
      }
    }
  }

  let assemblyDefinitions: ExtractionLibrary['assemblyDefinitions'] = null;
  const definitionsFile = path.join(repoRoot, 'assets/sg/assemblies/assembly-definitions.json');
  if (existsSync(definitionsFile)) {
    try {
      assemblyDefinitions = parseAssemblyDefinitionsFile(readJson(definitionsFile));
    } catch (error) {
      diagnostics.push(registryDiagnostic('definitions_invalid', 'error', String(error), ['assets/sg/assemblies/assembly-definitions.json']));
    }
  }

  return { repoRoot, manifests, markingGeometry, assemblyDefinitions, diagnostics };
}

export function sha256OfFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * Recomputes SHA-256 for every file a compiled asset or reference record declares and compares it
 * with the manifest hash. Missing files and mismatches are errors; the source PDFs themselves are
 * not checked here (they are not in the repository; see `verifySourcePdfs`).
 */
export function verifyFileHashes(registry: CompiledRegistry, repoRoot: string): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const check = (ownerId: string, files: readonly { readonly role: string; readonly path: string; readonly sha256: string | null }[]): void => {
    for (const file of files) {
      const absolute = path.join(repoRoot, file.path);
      if (!existsSync(absolute)) {
        out.push(registryDiagnostic('file_missing', 'error', `${ownerId}: ${file.path} not found`, [ownerId], { role: file.role }));
        continue;
      }
      if (file.sha256 === null) continue;
      const actual = sha256OfFile(absolute);
      if (actual !== file.sha256) {
        out.push(registryDiagnostic('file_hash_mismatch', 'error', `${ownerId}: ${file.path} hashes to ${actual}, manifest says ${file.sha256}`, [ownerId], { role: file.role }));
      }
    }
  };
  for (const asset of registry.assets) check(asset.id, asset.provenance.files);
  for (const reference of registry.references) check(reference.id, reference.files);
  return out;
}

/**
 * Verifies original source PDFs that were downloaded outside Git (`pdfDir/<sourceId>.pdf`).
 * Sources whose PDF is absent are reported as `info`, never fetched here.
 */
export function verifySourcePdfs(registry: CompiledRegistry, pdfDir: string): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const source of registry.sources) {
    const file = path.join(pdfDir, `${source.id}.pdf`);
    if (!existsSync(file)) {
      out.push(registryDiagnostic('source_pdf_absent', 'info', `${source.id}: ${file} not present; download from ${source.url} to verify`, [source.id]));
      continue;
    }
    const actual = sha256OfFile(file);
    if (actual !== source.sha256) {
      out.push(registryDiagnostic('source_hash_mismatch', 'error', `${source.id}: PDF hashes to ${actual}, manifest says ${source.sha256}`, [source.id]));
    }
  }
  return out;
}
