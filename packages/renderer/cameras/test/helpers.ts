import path from 'node:path';
import { createInMemoryResolver } from '@ottie/asset-registry';
import {
  type AssetResolver,
  type DeepReadonly,
  type Mutable,
  type Viewport,
  type World,
  cloneMutable,
  freezeDeep,
} from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH } from '@ottie/contracts/fixtures';
import { type WorldScene, buildWorldScene, loadWorldArtwork } from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node';

export const repoRoot = path.resolve(import.meta.dirname, '../../../..');

export const VIEWPORT_DESKTOP: Viewport = {
  widthPx: 1280,
  heightPx: 720,
  devicePixelRatio: 1,
  safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
};

/** Portrait phone: 3x DPR, status bar on top and a lesson panel covering the bottom quarter. */
export const VIEWPORT_NARROW: Viewport = {
  widthPx: 360,
  heightPx: 640,
  devicePixelRatio: 3,
  safeInsetsPx: { top: 48, right: 0, bottom: 160, left: 0 },
};

/** Tiny embedded viewport where a roadside sign cannot reach readable size from the driver's eye. */
export const VIEWPORT_TINY: Viewport = {
  widthPx: 320,
  heightPx: 200,
  devicePixelRatio: 2,
  safeInsetsPx: { top: 0, right: 0, bottom: 40, left: 0 },
};

export function developmentResolver(): AssetResolver {
  return createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH);
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

export function mutate(
  base: DeepReadonly<World>,
  edit: (draft: Mutable<World>) => void,
): DeepReadonly<World> {
  const draft = cloneMutable<World>(base);
  edit(draft);
  return freezeDeep<World>(draft);
}
