import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXTRACTION_FAMILIES,
  type ExtractionFamily,
  adaptExtractionAsset,
  adaptExtractionSource,
  parseExtractionIndex,
  parseExtractionManifest,
  parseMarkingGeometryProfile,
} from '@ottie/contracts';
import { repoRoot } from '../../../config/aliases';

const assetsRoot = path.join(repoRoot, 'assets/sg');

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(assetsRoot, relative), 'utf8')) as unknown;
}

const manifests = EXTRACTION_FAMILIES.map((family) => ({ family, manifest: parseExtractionManifest(readJson(`${family}/manifest.json`)) }));

describe('extraction manifests → adapter (real files under assets/sg)', () => {
  it('parses every family manifest and the index with the checked-in schema version', () => {
    const index = parseExtractionIndex(readJson('index.json'));
    expect(index.asset_count).toBe(manifests.reduce((n, m) => n + m.manifest.assets.length, 0));
    expect(index.release_ready_count).toBe(0);
    expect(index.complete).toBe(false);
  });

  it('never promotes release_ready: every adapted asset stays quarantined', () => {
    for (const { family, manifest } of manifests) {
      for (const asset of manifest.assets) {
        const adapted = adaptExtractionAsset(family, asset);
        expect(adapted.review.releaseReady).toBe(asset.release_ready);
        expect(adapted.review.releaseReady).toBe(false);
        expect(adapted.review.runtimeState).toBe('draft');
        expect(adapted.review.extractionStatus).toBe(asset.review.status);
      }
    }
  });

  it('preserves file hashes, locators, dimensions and warnings verbatim', () => {
    for (const { family, manifest } of manifests) {
      for (const asset of manifest.assets) {
        const adapted = adaptExtractionAsset(family, asset);
        expect(adapted.id).toBe(asset.id);
        for (const file of adapted.provenance.files) {
          expect(asset.files[file.role]).toBe(file.path);
          expect(asset.file_sha256[file.role] ?? null).toBe(file.sha256);
        }
        const locator = adapted.provenance.geometrySources[0];
        expect(locator?.sourceId).toBe(asset.source.source_id);
        expect(locator?.pdfPage).toBe(asset.source.pdf_page);
        expect(locator?.drawing).toBe(asset.source.drawing);
        expect(locator?.drawingRevision).toBe(asset.source.drawing_revision);
        expect(adapted.provenance.rawDimensionsMm).toEqual(asset.dimensions_mm);
        expect(adapted.review.warnings).toEqual(asset.review.warnings);
        expect(adapted.review.licenseStatus).toBe(asset.license_status);
      }
    }
  });

  it('preserves official source hashes and revision/effective dates', () => {
    // The same PDF is referenced under different local ids per family manifest (e.g. `tp`,
    // `tp-btt-2026`, `spf-btt-2026`); some entries carry the edition string, others leave it null.
    // The adapter must copy whatever each manifest recorded, never fill gaps from a sibling.
    const sources: ReturnType<typeof adaptExtractionSource>[] = [];
    for (const { manifest } of manifests) {
      for (const source of manifest.sources) sources.push(adaptExtractionSource(source));
    }
    const hashes = sources.map((s) => String(s.sha256));
    const tpHash = '4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa';
    const tp = sources.filter((s) => String(s.sha256) === tpHash);
    const tfm = hashes.includes('8decfe2306c6fb1b738c82a82bc4d657ef6a8a16ba4a0a342522126fd0113af1');
    const rms = hashes.includes('262ec3c439c8101945b7504e09e19c172485c5568cf7ba2f997fefa732d44059');
    expect(tp.length).toBeGreaterThan(0);
    expect(tfm).toBe(true);
    expect(rms).toBe(true);
    expect(tp.some((s) => s.edition === 'Updated 2 January 2026')).toBe(true);
    expect(tp.some((s) => s.edition === null)).toBe(true);
    expect(sources.some((s) => s.collectionRevision === 'I')).toBe(true);
    for (const source of sources) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it('keeps family-specific extra fields in rawFamilyEvidence instead of dropping them', () => {
    const assemblies = manifests.find((m) => m.family === 'assemblies');
    expect(assemblies).toBeDefined();
    if (!assemblies) return;
    const signal = assemblies.manifest.assets.find((a) => a.id === 'sg.assemblies.signal-through-green-right-red');
    expect(signal).toBeDefined();
    if (!signal) return;
    const adapted = adaptExtractionAsset('assemblies', signal);
    const coreKeys = new Set(['id', 'name', 'kind', 'representation', 'files', 'file_sha256', 'dimensions_mm', 'source', 'extraction', 'review', 'related_assets', 'license_status', 'release_ready']);
    const extraKeys = Object.keys(signal).filter((key) => !coreKeys.has(key));
    expect(extraKeys.length).toBeGreaterThan(0);
    for (const key of extraKeys) expect(adapted.provenance.rawFamilyEvidence).toHaveProperty(key);
  });

  it('parses every parametric marking geometry profile', () => {
    const geometryDir = path.join(assetsRoot, 'markings/geometry');
    const profiles = readdirSync(geometryDir).filter((f) => f.endsWith('.json'));
    expect(profiles.length).toBeGreaterThan(0);
    for (const file of profiles) {
      const profile = parseMarkingGeometryProfile(readJson(`markings/geometry/${file}`));
      expect(profile.units).toBe('mm');
      expect(profile.release_ready).toBe(false);
    }
  });

  it('rejects manifests whose schema version is unknown', () => {
    const first: { family: ExtractionFamily; manifest: unknown } | undefined = manifests[0];
    expect(first).toBeDefined();
    if (!first) return;
    const broken = { ...(first.manifest as Record<string, unknown>), schema_version: 99 };
    expect(() => parseExtractionManifest(broken)).toThrow();
  });
});
