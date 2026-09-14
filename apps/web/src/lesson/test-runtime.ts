import path from 'node:path';
import { type Camera, type Scene } from 'three';
import { type Viewport } from '@ottie/contracts';
import { createFixedClock, createMemoryStorage } from '@ottie/learning-state';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node.js';
import { type StarterContentSet, loadStarterContentSet } from '@ottie/starter-content';
import { type LessonRuntime, createLessonRuntime } from './runtime';
import { type RenderSurface, type SurfaceFactory } from './world-scene-view';

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');

let cached: StarterContentSet | null = null;
/** The REAL starter content (closure → generator → pinned worlds → V1), loaded once per test file. */
export function starterContent(): StarterContentSet {
  cached ??= loadStarterContentSet();
  return cached;
}

export interface RecordedFrame {
  readonly cameraName: string;
  readonly viewport: Viewport;
  readonly camera: Camera;
  readonly objectCount: number;
}

export interface FakeSurface {
  readonly factory: SurfaceFactory;
  readonly frames: RecordedFrame[];
  readonly disposed: () => number;
}

/** Records every painted frame instead of needing WebGL (jsdom has none). */
export function createFakeSurface(): FakeSurface {
  const frames: RecordedFrame[] = [];
  let disposed = 0;
  const factory: SurfaceFactory = (container) => {
    const element = document.createElement('div');
    element.dataset.testid = 'fake-surface';
    container.append(element);
    let viewport: Viewport = { widthPx: 0, heightPx: 0, devicePixelRatio: 1, safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 } };
    const surface: RenderSurface = {
      element,
      resize(next) {
        viewport = next;
      },
      render(scene: Scene, camera: Camera) {
        let objectCount = 0;
        scene.traverse(() => {
          objectCount += 1;
        });
        frames.push({ cameraName: camera.name, viewport, camera, objectCount });
      },
      dispose() {
        disposed += 1;
        element.remove();
      },
    };
    return surface;
  };
  return { factory, frames, disposed: () => disposed };
}

export interface TestRuntime {
  readonly runtime: LessonRuntime;
  readonly storage: ReturnType<typeof createMemoryStorage>;
  readonly clock: ReturnType<typeof createFixedClock>;
  readonly surface: FakeSurface;
}

export function createTestRuntime(options: { readonly storage?: ReturnType<typeof createMemoryStorage>; readonly startMs?: number } = {}): TestRuntime {
  const storage = options.storage ?? createMemoryStorage();
  const clock = createFixedClock(options.startMs ?? 1_760_000_000_000);
  const surface = createFakeSurface();
  const runtime = createLessonRuntime({
    storage,
    clock,
    artwork: createFileArtworkSource(REPO_ROOT),
    content: starterContent(),
    surface: surface.factory,
  });
  return { runtime, storage, clock, surface };
}
