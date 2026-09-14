import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDependencyIndex, compileRegistry, createRegistryResolver, curationFromDefinitions } from '@ottie/asset-registry';
import { computeRegistryHash } from '@ottie/asset-registry/hash.node.js';
import { loadExtractionLibrary } from '@ottie/asset-registry/library.node.js';
import { canonicalJson } from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_TEMPLATES, DEVELOPMENT_WORLDS, EXTRACTED_DEVELOPMENT_ASSETS } from '@ottie/contracts/fixtures';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node.js';
import { cameraMatrices } from '@ottie/renderer-cameras';
import { canonicalWorldJson } from '@ottie/scenario-core';
import { buildReviewPack } from './pack';
import { writeReviewPack } from './write.node.js';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

function inputs() {
  const registry = compileRegistry(loadExtractionLibrary(REPO_ROOT), {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((asset) => asset.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);
  return {
    registry,
    registryHash,
    worlds: DEVELOPMENT_WORLDS,
    templates: DEVELOPMENT_TEMPLATES,
    bundles: [DEVELOPMENT_CONTENT_BUNDLE],
    resolver: createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, registryHash),
    repoRoot: REPO_ROOT,
  };
}

describe('review pack export', () => {
  it('builds deterministic rendered packs and writes hashed files', async () => {
    const source = inputs();
    const options = { artwork: createFileArtworkSource(REPO_ROOT) };
    const first = await buildReviewPack(source, options);
    const second = await buildReviewPack(source, options);
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.packHash).toBe(second.packHash);
    expect(first.worlds).toHaveLength(3);
    for (const world of first.worlds) {
      const fixture = DEVELOPMENT_WORLDS.find((candidate) => candidate.id === world.worldId);
      if (!fixture) throw new Error(`missing fixture ${world.worldId}`);
      expect(world.provenance.canonicalJson).toBe(canonicalWorldJson(fixture));
      expect(world.diagnostics.sceneIssues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'artwork_unavailable' })]));
      expect(world.diagnostics.sceneIssues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'artwork_missing' })]));
      expect(world.provenance.files).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'renderer_svg', matches: true })]));
      expect(world.views.length).toBeGreaterThanOrEqual(4);
      expect(world.views.map((view) => view.presetName)).toEqual(expect.arrayContaining(['plan', 'study_oblique', 'approach_ego', 'entity_detail']));
      for (const view of world.views) {
        expect(view.report.matrices).toEqual(cameraMatrices(view.report.camera, view.viewport));
      }
      for (const sheet of world.contactSheets) {
        expect(sheet.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(sheet.svg).toContain('NOT RELEASE CONTENT');
        expect(sheet.svg).toContain('<path');
        expect(sheet.svg).toContain('viewBox="-640 -400 1280 800"');
        for (const preset of ['plan', 'study_oblique', 'approach_ego', 'entity_detail']) expect(sheet.svg).toContain(preset);
      }
      expect(world.release.ok).toBe(false);
      expect(world.release.rejections.length).toBeGreaterThan(0);
      for (const file of world.provenance.files) {
        if (file.actualSha256 !== null && file.manifestSha256 !== null) {
          expect(file.actualSha256).toBe(file.manifestSha256);
          expect(file.matches).toBe(true);
        }
      }
      for (const sourceRecord of world.provenance.sources) expect(sourceRecord.source?.sha256 ?? 'x'.repeat(64)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('writes byte-identical manifests to temporary directories', async () => {
    const source = inputs();
    const pack = await buildReviewPack(source, { artwork: createFileArtworkSource(REPO_ROOT) });
    const firstDir = mkdtempSync(path.join(os.tmpdir(), 'ottie-h1-'));
    const secondDir = mkdtempSync(path.join(os.tmpdir(), 'ottie-h1-'));
    try {
      const firstManifest = await writeReviewPack(pack, firstDir);
      const secondManifest = await writeReviewPack(pack, secondDir);
      expect(canonicalJson(firstManifest)).toBe(canonicalJson(secondManifest));
      const firstWorldId = pack.worlds[0]?.worldId;
      const firstSheet = pack.worlds[0]?.contactSheets[0];
      if (!firstWorldId || !firstSheet) throw new Error('pack has no first-world contact sheet');
      const sheetName = `contact-sheet.${firstSheet.viewport.widthPx}x${firstSheet.viewport.heightPx}.svg`;
      expect(readFileSync(path.join(firstDir, firstWorldId, sheetName), 'utf8')).toBe(readFileSync(path.join(secondDir, firstWorldId, sheetName), 'utf8'));
      const digest = createHash('sha256').update(readFileSync(path.join(firstDir, 'manifest.json'))).digest('hex');
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(firstDir, { recursive: true, force: true });
      rmSync(secondDir, { recursive: true, force: true });
    }
  });

  it('indexes the same world closure used by packs', () => {
    const source = inputs();
    const index = buildDependencyIndex(source);
    const world = DEVELOPMENT_WORLDS[0];
    if (!world) throw new Error('fixture has no world');
    expect(index.worldClosure(world.id)?.worlds).toContain(world.id);
  });
});
