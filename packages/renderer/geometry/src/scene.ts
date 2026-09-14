import { Box3, DirectionalLight, Group, HemisphereLight } from 'three';
import { type AssetResolver, type DeepReadonly, type World } from '@ottie/contracts';
import { buildActors } from './actors';
import { type ArtworkBundle, BuildContext } from './context';
import { buildSignFaces } from './faces';
import { buildMarkings } from './markings';
import { disposeObjectTree } from './materials';
import { buildGround, buildOverlays, buildRoads } from './roads';
import { buildSignalHeads } from './signals';
import { buildSupports } from './supports';
import { type RenderedEntity, type SceneIssue, type WorldScene } from './types';

export interface BuildWorldSceneOptions {
  readonly resolver: AssetResolver;
  /** Hash-verified parsed artwork by asset file path (see `loadWorldArtwork`); faces without it get a flagged blank plate. */
  readonly artwork?: ArtworkBundle;
  /** Issues from the artwork loading step, carried onto the scene report. */
  readonly artworkIssues?: readonly SceneIssue[];
}

/**
 * Build the physical Three.js scene graph for an immutable World. Order matters only for
 * dependencies: supports before the faces and heads that mount on them, roads before the ground
 * that is sized from them. The world is read, never written.
 */
export function buildWorldScene(
  world: DeepReadonly<World>,
  options: BuildWorldSceneOptions,
): WorldScene {
  const ctx = new BuildContext(world, options.resolver, options.artwork ?? new Map());
  for (const issue of options.artworkIssues ?? []) ctx.issues.push(issue);

  buildRoads(ctx);
  buildGround(ctx);
  buildMarkings(ctx);
  buildSupports(ctx);
  buildSignFaces(ctx);
  buildSignalHeads(ctx);
  buildActors(ctx);
  buildOverlays(ctx);

  const root = new Group();
  root.name = `world:${world.id}`;
  root.add(ctx.physical, ctx.overlay, buildLights());
  root.updateMatrixWorld(true);

  const bounds = new Box3();
  for (const entity of ctx.entities.values())
    if (entity.layer === 'physical') bounds.union(entity.bounds);

  const entities: ReadonlyMap<string, RenderedEntity> = ctx.entities;
  let disposed = false;
  return {
    worldId: world.id,
    root,
    entities,
    bounds,
    issues: ctx.issues,
    schematicChoices: ctx.schematicChoices(),
    boundsOf(ids) {
      const box = new Box3();
      for (const id of ids) {
        const entity = entities.get(id);
        if (entity) box.union(entity.bounds);
      }
      return box.isEmpty() ? null : box;
    },
    setOverlayVisible(visible) {
      ctx.overlay.visible = visible;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObjectTree(root, ctx.materials.owned());
      ctx.materials.dispose();
      ctx.entities.clear();
      root.removeFromParent();
    },
  };
}

/** Presentation-only lighting so Lambert bodies read as solids; not part of the world. */
function buildLights(): Group {
  const lights = new Group();
  lights.name = 'lights';
  const sky = new HemisphereLight(0xdfe8f5, 0x4a5240, 1.1);
  sky.position.set(0, 0, 1);
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-40, -30, 60);
  lights.add(sky, sun);
  return lights;
}
