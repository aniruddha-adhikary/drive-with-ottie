import {
  type Box3,
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';
import {
  type AssetResolver,
  type CameraPreset,
  type DeepReadonly,
  type RendererPort,
  type SceneInput,
  type Viewport,
  type World,
} from '@ottie/contracts';
import { type FaceArtworkSource, loadWorldArtwork } from './artwork';
import { ROAD_MATERIAL_COLOURS } from './materials';
import { buildWorldScene } from './scene';
import { type RenderedEntity, type WorldScene } from './types';

export interface WorldRendererOptions {
  readonly resolver: AssetResolver;
  /** Where sign-face SVGs come from; omit to render blank flagged backings only. */
  readonly artwork?: FaceArtworkSource;
}

/**
 * RendererPort implementation plus the read-only scene facts camera/evidence consumers need.
 * `update` only touches presentation (highlight, overlay); it never moves physical geometry, so a
 * camera change can never rotate a sign or shift a lens.
 */
export interface WorldRenderer extends RendererPort {
  /** Add this to a Three `Scene`. Empty until `load` resolves. */
  readonly root: Group;
  readonly scene: WorldScene | null;
  readonly lastInput: SceneInput | null;
  readonly lastCamera: CameraPreset | null;
  readonly viewport: Viewport | null;
  entity(id: string): RenderedEntity | undefined;
  /** World bounds of the listed entity ids (evidence targets), or null when none are rendered. */
  boundsOf(ids: readonly string[]): Box3 | null;
}

export function createWorldRenderer(options: WorldRendererOptions): WorldRenderer {
  const root = new Group();
  root.name = 'world-renderer';
  const highlightMaterial = new LineBasicMaterial({
    color: ROAD_MATERIAL_COLOURS['overlay.guide'],
  });
  let scene: WorldScene | null = null;
  let lastInput: SceneInput | null = null;
  let lastCamera: CameraPreset | null = null;
  let viewport: Viewport | null = null;
  let highlight: LineSegments | null = null;
  let disposed = false;

  const clearHighlight = () => {
    if (!highlight) return;
    highlight.geometry.dispose();
    highlight.removeFromParent();
    highlight = null;
  };

  const unload = () => {
    clearHighlight();
    scene?.dispose();
    scene = null;
  };

  return {
    root,
    get scene() {
      return scene;
    },
    get lastInput() {
      return lastInput;
    },
    get lastCamera() {
      return lastCamera;
    },
    get viewport() {
      return viewport;
    },
    entity: (id) => scene?.entities.get(id),
    boundsOf: (ids) => scene?.boundsOf(ids) ?? null,

    async load(world: DeepReadonly<World>) {
      if (disposed) throw new Error('WorldRenderer is disposed');
      const loaded = options.artwork
        ? await loadWorldArtwork(world, options.resolver, options.artwork)
        : null;
      if (disposed) return;
      unload();
      scene = buildWorldScene(world, {
        resolver: options.resolver,
        ...(loaded ? { artwork: loaded.artwork, artworkIssues: loaded.issues } : {}),
      });
      root.add(scene.root);
    },

    update(input: SceneInput, camera: CameraPreset) {
      if (disposed) throw new Error('WorldRenderer is disposed');
      if (!scene) throw new Error('WorldRenderer.update called before load');
      if (input.world.id !== scene.worldId) {
        throw new Error(
          `WorldRenderer loaded ${scene.worldId} but update received ${input.world.id}; call load first`,
        );
      }
      lastInput = input;
      lastCamera = camera;
      viewport = input.viewport;
      clearHighlight();
      const target = input.highlightEntityId
        ? scene.entities.get(input.highlightEntityId)
        : undefined;
      if (target) {
        const box = target.bounds.clone().expandByScalar(0.1);
        const size = box.getSize(new Vector3());
        const centre = box.getCenter(new Vector3());
        const box3 = new BoxGeometry(size.x, size.y, size.z);
        highlight = new LineSegments(new EdgesGeometry(box3), highlightMaterial);
        box3.dispose();
        highlight.position.copy(centre);
        highlight.name = `highlight:${target.id}`;
        root.add(highlight);
      }
    },

    resize(next: Viewport) {
      viewport = next;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unload();
      highlightMaterial.dispose();
      lastInput = null;
      lastCamera = null;
      root.removeFromParent();
    },
  };
}
