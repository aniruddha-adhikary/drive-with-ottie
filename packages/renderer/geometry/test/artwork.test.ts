// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_ASSETS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  STOP_DEVELOPMENT_ACCESS,
} from '@ottie/contracts/fixtures';
import {
  buildWorldScene,
  createStaticArtworkSource,
  loadWorldArtwork,
  rendererSvgFile,
  sha256Hex,
} from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '../src/artwork.node';
import { developmentResolver, entityOfKind, repoRoot } from './helpers';

const svgFiles = DEVELOPMENT_ASSETS.filter((a) => a.geometry.kind === 'face')
  .map(rendererSvgFile)
  .filter((f) => f !== null);

describe('sign artwork loading', () => {
  it('pins a sha256 for every development sign SVG and the repository files match it', async () => {
    expect(svgFiles.map((f) => f.path).sort()).toEqual([
      'assets/sg/mandatory/give-way.svg',
      'assets/sg/mandatory/stop.svg',
    ]);
    for (const file of svgFiles) {
      expect(file.sha256).not.toBeNull();
      const text = await readFile(path.join(repoRoot, file.path), 'utf8');
      expect(await sha256Hex(text)).toBe(file.sha256);
    }
  });

  it('parses verified files into shapes with the authored viewBox and no issues', async () => {
    const loaded = await loadWorldArtwork(
      GIVE_WAY_T_JUNCTION,
      developmentResolver(),
      createFileArtworkSource(repoRoot),
    );
    expect(loaded.issues).toEqual([]);
    const art = loaded.artwork.get('assets/sg/mandatory/give-way.svg');
    expect(art).toBeDefined();
    if (!art) return;
    expect(art.paths.length).toBeGreaterThan(0);
    expect(art.paths.flatMap((p) => p.toShapes()).length).toBeGreaterThan(0);
    expect(art.viewBox.width).toBeGreaterThan(0);
    expect(art.viewBox.height).toBeGreaterThan(0);
    expect(art.sha256).toBe(svgFiles.find((f) => f.path === art.path)?.sha256);
  });

  it('rejects altered artwork and reports it, and the face falls back to a flagged blank backing', async () => {
    const original = await readFile(path.join(repoRoot, 'assets/sg/mandatory/stop.svg'), 'utf8');
    const tampered = original.replace('</svg>', '<rect width="1" height="1"/></svg>');
    expect(tampered).not.toBe(original);
    const loaded = await loadWorldArtwork(
      STOP_DEVELOPMENT_ACCESS,
      developmentResolver(),
      createStaticArtworkSource({ 'assets/sg/mandatory/stop.svg': tampered }),
    );
    expect(loaded.artwork.size).toBe(0);
    expect(loaded.issues.map((i) => i.code)).toEqual(['artwork_hash_mismatch']);
    const scene = buildWorldScene(STOP_DEVELOPMENT_ACCESS, {
      resolver: developmentResolver(),
      artwork: loaded.artwork,
      artworkIssues: loaded.issues,
    });
    const sign = entityOfKind(scene, 'sign_face', STOP_DEVELOPMENT_ACCESS.signFaces[0]?.id ?? '');
    expect(sign.artwork).toBe('backing_only');
    expect(scene.issues.map((i) => i.code)).toContain('artwork_hash_mismatch');
    expect(scene.root.getObjectByName(`sign-plate:${sign.id}`)).toBeDefined();
    scene.dispose();
  });

  it('reports files the source cannot provide', async () => {
    const loaded = await loadWorldArtwork(
      GIVE_WAY_T_JUNCTION,
      developmentResolver(),
      createStaticArtworkSource({}),
    );
    expect(loaded.artwork.size).toBe(0);
    expect(loaded.issues).toEqual([
      expect.objectContaining({
        code: 'artwork_unavailable',
        entityId: GIVE_WAY_IDS.entities.giveWaySign,
      }),
    ]);
  });
});
