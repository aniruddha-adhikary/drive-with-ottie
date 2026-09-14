import path from 'node:path';
import { type Vector3 } from 'three';
import { expect } from 'vitest';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { type AssetResolver, type DeepReadonly, type World } from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH } from '@ottie/contracts/fixtures';
import {
  buildWorldScene,
  loadWorldArtwork,
  type RenderedEntity,
  type WorldScene,
} from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '../src/artwork.node';

export const repoRoot = path.resolve(import.meta.dirname, '../../../..');

export function developmentResolver(): AssetResolver {
  return createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH);
}

/** Build a scene with hash-verified artwork read from the repository (needs a DOMParser: jsdom). */
export async function buildFixtureScene(world: DeepReadonly<World>): Promise<WorldScene> {
  const resolver = developmentResolver();
  const loaded = await loadWorldArtwork(world, resolver, createFileArtworkSource(repoRoot));
  return buildWorldScene(world, {
    resolver,
    artwork: loaded.artwork,
    artworkIssues: loaded.issues,
  });
}

/** Build a scene without artwork (node environment, no DOM needed). */
export function buildBareScene(world: DeepReadonly<World>): WorldScene {
  return buildWorldScene(world, { resolver: developmentResolver() });
}

export function entityOfKind<K extends RenderedEntity['kind']>(
  scene: WorldScene,
  kind: K,
  id: string,
): Extract<RenderedEntity, { kind: K }> {
  const entity = scene.entities.get(id);
  if (!entity) throw new Error(`entity ${id} not rendered`);
  if (entity.kind !== kind) throw new Error(`entity ${id} is a ${entity.kind}, expected ${kind}`);
  return entity as Extract<RenderedEntity, { kind: K }>;
}

export function expectVector(
  actual: Vector3,
  expected: readonly [number, number, number],
  precision = 6,
): void {
  expect(actual.x).toBeCloseTo(expected[0], precision);
  expect(actual.y).toBeCloseTo(expected[1], precision);
  expect(actual.z).toBeCloseTo(expected[2], precision);
}
