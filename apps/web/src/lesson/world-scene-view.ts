import { type Camera, Color, DirectionalLight, HemisphereLight, Scene, WebGLRenderer } from 'three';
import {
  type CameraPresetName,
  type DeepReadonly,
  type SceneInput,
  type SceneView,
  type ViewChange,
  type ViewFit,
  type Viewport,
  type World,
} from '@ottie/contracts';
import { type EvidenceCameraPort, presetToThreeCamera } from '@ottie/renderer-cameras';
import { type WorldRenderer } from '@ottie/renderer-geometry';

/** Where the fitted frame is painted. Presentation only: it never reads back into the world. */
export interface RenderSurface {
  readonly element: HTMLElement;
  resize(viewport: Viewport): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

/** Returns null when the host cannot paint (no WebGL); the view then reports fits without pixels. */
export type SurfaceFactory = (container: HTMLElement) => RenderSurface | null;

export interface WorldSceneViewOptions {
  readonly renderer: WorldRenderer;
  readonly camera: EvidenceCameraPort;
  readonly surface?: SurfaceFactory;
}

const SKY = 0xf4f1ea;

export function canRenderWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

export const createWebGLSurface: SurfaceFactory = (container) => {
  const canvas = document.createElement('canvas');
  if (!canRenderWebGL(canvas)) return null;
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.setClearColor(new Color(SKY), 1);
  container.append(canvas);
  return {
    element: canvas,
    resize(viewport) {
      gl.setPixelRatio(viewport.devicePixelRatio);
      gl.setSize(viewport.widthPx, viewport.heightPx, false);
    },
    render(scene, camera) {
      gl.render(scene, camera);
    },
    dispose() {
      gl.dispose();
      canvas.remove();
    },
  };
};

function sameViewport(a: Viewport, b: Viewport): boolean {
  return (
    a.widthPx === b.widthPx &&
    a.heightPx === b.heightPx &&
    a.devicePixelRatio === b.devicePixelRatio &&
    a.safeInsetsPx.top === b.safeInsetsPx.top &&
    a.safeInsetsPx.right === b.safeInsetsPx.right &&
    a.safeInsetsPx.bottom === b.safeInsetsPx.bottom &&
    a.safeInsetsPx.left === b.safeInsetsPx.left
  );
}

/** SceneView plus the serialised R1 loader, so hosts never race the view for the same renderer. */
export interface WorldSceneView extends SceneView {
  ensureLoaded(world: DeepReadonly<World>): Promise<void>;
}

/**
 * R2 judges a preset against every requirement the world lists for it, so the fit runs over the
 * whole world's evidence; the lesson then reads back only the requirements this question needs.
 */
export function fitForQuestion(camera: EvidenceCameraPort, input: SceneInput): ViewFit {
  const fit = camera.fit({ ...input, evidence: input.world.evidence });
  const wanted = new Set(input.evidence.map((e) => e.id));
  return {
    camera: fit.camera,
    visibleEvidenceIds: fit.visibleEvidenceIds.filter((id) => wanted.has(id)),
    hiddenEvidenceIds: fit.hiddenEvidenceIds.filter((id) => wanted.has(id)),
    linkedDetailEntityIds: fit.linkedDetailEntityIds,
  };
}

/**
 * The real `SceneView`: R1 geometry (`WorldRenderer`) framed by R2 evidence-aware cameras, painted
 * onto a WebGL canvas. Every input change re-fits and repaints; nothing here writes to the world,
 * and a camera change can never turn a sign or shift a lens because R1 owns the physical graph and
 * only ever receives presentation updates.
 */
export function createWorldSceneView(options: WorldSceneViewOptions): WorldSceneView {
  const { renderer, camera } = options;
  const makeSurface = options.surface ?? createWebGLSurface;
  const three = new Scene();
  three.name = 'lesson-scene';
  three.add(new HemisphereLight(0xffffff, 0x8a8a7a, 1.1));
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(-30, -40, 60);
  three.add(sun);
  three.add(renderer.root);

  let container: HTMLElement | null = null;
  let surface: RenderSurface | null = null;
  let note: HTMLElement | null = null;
  let input: SceneInput | null = null;
  let lastFit: ViewFit | null = null;
  let queue: Promise<void> = Promise.resolve();
  let wantedWorldId: string | null = null;
  const listeners = new Set<(change: ViewChange) => void>();

  /** Serialises R1 loads so a fast world switch never paints a stale scene under a newer input. */
  const ensureLoaded = (world: DeepReadonly<World>): Promise<void> => {
    if (wantedWorldId === world.id) return queue;
    wantedWorldId = world.id;
    const next = queue
      .catch(() => undefined)
      .then(() => renderer.load(world))
      .then(
        () => undefined,
        (error: unknown) => {
          if (wantedWorldId === world.id) wantedWorldId = null;
          throw error;
        },
      );
    queue = next;
    return next;
  };

  const emit = (change: ViewChange) => {
    for (const listener of listeners) listener(change);
  };

  const paint = (current: SceneInput, reason: 'mount' | 'update' | 'preset') => {
    if (renderer.scene?.worldId !== current.world.id) return;
    const fit = fitForQuestion(camera, current);
    renderer.update(current, fit.camera);
    if (surface) {
      surface.resize(current.viewport);
      surface.render(three, presetToThreeCamera(fit.camera, current.viewport));
    }
    const unchanged =
      reason === 'update' &&
      lastFit !== null &&
      lastFit.camera.name === fit.camera.name &&
      lastFit.hiddenEvidenceIds.join() === fit.hiddenEvidenceIds.join() &&
      lastFit.visibleEvidenceIds.join() === fit.visibleEvidenceIds.join();
    lastFit = fit;
    if (!unchanged) emit({ preset: current.preset, fit });
  };

  /** Loads `world` (if needed) and then paints whatever input is current for that world. */
  const settle = async (world: DeepReadonly<World>): Promise<void> => {
    await ensureLoaded(world);
    if (container && input?.world.id === world.id) paint(input, 'mount');
  };

  const showNote = (testId: string, text: string) => {
    if (!container) return;
    note?.remove();
    note = document.createElement('p');
    note.className = 'ottie-type-metadata ottie-scene-host__note';
    note.dataset.testid = testId;
    note.textContent = text;
    container.append(note);
  };

  return {
    ensureLoaded,
    async mount(target, initial) {
      surface?.dispose();
      note?.remove();
      note = null;
      container = target;
      input = initial;
      lastFit = null;
      surface = makeSurface(target);
      if (!surface) {
        showNote(
          'scene-no-webgl',
          'This browser cannot draw the 3D scene (no WebGL). Evidence visibility below is still computed from the real geometry.',
        );
      }
      await settle(initial.world);
    },
    update(next) {
      const previous = input;
      input = next;
      if (!container) return;
      if (renderer.scene?.worldId !== next.world.id) {
        settle(next.world).catch((error: unknown) => {
          if (input === next) showNote('scene-load-failed', `The scene could not be drawn: ${describe(error)}`);
        });
        return;
      }
      const presetChanged = previous?.preset !== next.preset;
      if (
        previous &&
        !presetChanged &&
        previous.highlightEntityId === next.highlightEntityId &&
        sameViewport(previous.viewport, next.viewport) &&
        previous.evidence === next.evidence &&
        lastFit
      ) {
        return;
      }
      paint(next, presetChanged ? 'preset' : 'update');
    },
    setPreset(preset: CameraPresetName) {
      if (!input || input.preset === preset) return;
      input = { ...input, preset };
      if (renderer.scene?.worldId === input.world.id) paint(input, 'preset');
    },
    onViewChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unmount() {
      surface?.dispose();
      surface = null;
      note?.remove();
      note = null;
      container = null;
      input = null;
      lastFit = null;
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
