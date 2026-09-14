import {
  type Clock,
  type DeepReadonly,
  type Storage,
  type Viewport,
  type World,
} from '@ottie/contracts';
import {
  createLearningSession,
  createLearningStore,
  createLocalStorageAdapter,
  type LearningSession,
  type LearningStoreWithPersistence,
} from '@ottie/learning-state';
import { type EvidenceCameraPort, createCameraPort } from '@ottie/renderer-cameras';
import {
  type FaceArtworkSource,
  type WorldRenderer,
  createFetchArtworkSource,
  createWorldRenderer,
} from '@ottie/renderer-geometry';
import { type ComparisonOutcome, type StarterContentSet, loadStarterContentSet } from '@ottie/starter-content';
import { createViteArtworkSource } from '../glossary/artwork';
import { type SurfaceFactory, type WorldSceneView, createWorldSceneView } from './world-scene-view';

/** One R1 renderer with its R2 port and the SceneView the lesson mounts. Each holds ONE world at a time. */
export interface WorldStage {
  readonly renderer: WorldRenderer;
  readonly camera: EvidenceCameraPort;
  readonly sceneView: WorldSceneView;
  dispose(): void;
}

export interface LessonRuntime {
  readonly content: StarterContentSet;
  readonly clock: Clock;
  readonly store: LearningStoreWithPersistence;
  readonly session: LearningSession;
  /** Stage for the current question's world. */
  readonly stage: WorldStage;
  /** Separate stage for comparison worlds so a comparison can never repaint the question's scene. */
  readonly comparisonStage: WorldStage;
  createStage(): WorldStage;
  comparisonFor(comparisonId: string): ComparisonOutcome | null;
  worldFor(worldId: string): DeepReadonly<World> | null;
  dispose(): void;
}

export interface LessonRuntimeOptions {
  readonly storage: Storage;
  readonly clock: Clock;
  readonly artwork: FaceArtworkSource;
  readonly content?: StarterContentSet;
  readonly surface?: SurfaceFactory;
  readonly storageKey?: string;
}

export const LESSON_STORAGE_KEY = 'learning-state';

/** Browser composition root: the one place wall-clock time enters; everything else takes a Clock. */
export function createSystemClock(): Clock {
  // eslint-disable-next-line no-restricted-syntax -- composition root for the Clock port
  return { now: () => Date.now(), timeZone: 'Asia/Singapore' };
}

/** R1 face artwork served through Vite from the exact `assets/sg/` files the closure pins (hash-checked by R1). */
export function createBrowserFaceArtwork(): FaceArtworkSource {
  const urls = createViteArtworkSource();
  const fetching = createFetchArtworkSource((file) => file.path);
  return {
    async load(file) {
      const url = await urls.urlFor(file);
      if (url === null) return null;
      return fetching.load({ ...file, path: url });
    },
  };
}

export function createLessonRuntime(options: LessonRuntimeOptions): LessonRuntime {
  const content = options.content ?? loadStarterContentSet();
  const store = createLearningStore({
    storage: options.storage,
    clock: options.clock,
    bundle: content.bundle,
    storageKey: options.storageKey ?? LESSON_STORAGE_KEY,
  });
  const session = createLearningSession({ store, bundle: content.bundle, clock: options.clock });
  const stages = new Set<WorldStage>();

  const createStage = (): WorldStage => {
    const renderer = createWorldRenderer({ resolver: content.resolver, artwork: options.artwork });
    const camera = createCameraPort({
      sceneFor: (world) => {
        const scene = renderer.scene;
        if (scene?.worldId !== world.id) {
          throw new Error(`renderer has no scene for ${world.id}; load it first`);
        }
        return scene;
      },
    });
    const sceneView = createWorldSceneView(
      options.surface ? { renderer, camera, surface: options.surface } : { renderer, camera },
    );
    const stage: WorldStage = {
      renderer,
      camera,
      sceneView,
      dispose() {
        sceneView.unmount();
        renderer.dispose();
        stages.delete(stage);
      },
    };
    stages.add(stage);
    return stage;
  };

  const stage = createStage();
  const comparisonStage = createStage();
  const comparisons = new Map<string, ComparisonOutcome>();
  for (const scenario of content.scenarios) {
    for (const outcome of scenario.comparisons) comparisons.set(outcome.comparison.id, outcome);
  }

  return {
    content,
    clock: options.clock,
    store,
    session,
    stage,
    comparisonStage,
    createStage,
    comparisonFor: (id) => comparisons.get(id) ?? null,
    worldFor: (id) => content.worlds.get(id as DeepReadonly<World>['id']) ?? null,
    dispose() {
      for (const s of [...stages]) s.dispose();
    },
  };
}

/** Browser runtime: device-local storage, wall clock, Vite-served hash-checked artwork, WebGL. */
export function createBrowserLessonRuntime(): LessonRuntime {
  return createLessonRuntime({
    storage: createLocalStorageAdapter(window.localStorage),
    clock: createSystemClock(),
    artwork: createBrowserFaceArtwork(),
  });
}

/** The size the compact scene will have once laid out, from the same CSS rule the stylesheet uses. */
export function estimateCompactViewport(): Viewport {
  const rem = 16;
  const contentWidth = Math.max(280, Math.min(window.innerWidth, 44 * rem) - 2 * rem);
  const height = Math.min(22 * rem, Math.max(13.25 * rem, 0.75 * window.innerWidth));
  return {
    widthPx: Math.round(contentWidth),
    heightPx: Math.round(height),
    devicePixelRatio: window.devicePixelRatio || 1,
    safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

/** Compact scene layout tuning; teaching-layout choices, not source values. */
export const COMPACT_SCENE = Object.freeze({
  /** Taller candidates as multiples of the scene width, tried after the stylesheet default. */
  heightSteps: [1, 1.2, 1.45],
  /** The compact scene never takes more than this share of the window height. */
  maxWindowShare: 0.7,
} as const);

/**
 * Candidate compact heights, ascending: the stylesheet default first, then portrait-leaning steps
 * capped at a share of the window so the question stays reachable. Long plan/oblique spreads
 * (ego at the line, a car 30 m up the road) need the extra height on phones to reach their
 * authored minimum pixel sizes without moving anything in the world.
 */
export function compactHeightCandidates(viewport: Viewport): readonly number[] {
  const cap = Math.max(viewport.heightPx, Math.floor(window.innerHeight * COMPACT_SCENE.maxWindowShare));
  const steps = COMPACT_SCENE.heightSteps.map((k) => Math.min(cap, Math.round(viewport.widthPx * k)));
  return [...new Set([viewport.heightPx, ...steps.filter((h) => h > viewport.heightPx)])].sort((a, b) => a - b);
}
