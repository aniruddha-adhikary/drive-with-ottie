import path from 'node:path';
import { createInMemoryResolver } from '@ottie/asset-registry';
import {
  type AssetResolver,
  type CameraPreset,
  type CameraPresetName,
  type DeepReadonly,
  type Viewport,
  type World,
} from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH } from '@ottie/contracts/fixtures';
import { buildWorldScene, loadWorldArtwork, type WorldScene } from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node';

export const repoRoot = path.resolve(import.meta.dirname, '../../../..');

export const VIEWPORT_DESKTOP: Viewport = {
  widthPx: 1280,
  heightPx: 720,
  devicePixelRatio: 1,
  safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
};

/** Narrow phone viewport with a lesson panel inset at the bottom. */
export const VIEWPORT_NARROW: Viewport = {
  widthPx: 360,
  heightPx: 640,
  devicePixelRatio: 3,
  safeInsetsPx: { top: 48, right: 0, bottom: 160, left: 0 },
};

export function developmentResolver(): AssetResolver {
  return createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH);
}

/** Scene without artwork (node environment): faces are blank backing plates. */
export function buildBareScene(world: DeepReadonly<World>): WorldScene {
  return buildWorldScene(world, { resolver: developmentResolver() });
}

/** Scene with hash-verified artwork read from the repository (needs jsdom for DOMParser). */
export async function buildFixtureScene(world: DeepReadonly<World>): Promise<WorldScene> {
  const resolver = developmentResolver();
  const loaded = await loadWorldArtwork(world, resolver, createFileArtworkSource(repoRoot));
  return buildWorldScene(world, {
    resolver,
    artwork: loaded.artwork,
    artworkIssues: loaded.issues,
  });
}

export function authoredPreset(world: DeepReadonly<World>, name: CameraPresetName): CameraPreset {
  const preset = world.cameraPresets.find((c) => c.name === name);
  if (!preset) throw new Error(`fixture ${world.id} has no ${name} preset`);
  return { ...preset, evidenceIds: [...preset.evidenceIds] };
}
