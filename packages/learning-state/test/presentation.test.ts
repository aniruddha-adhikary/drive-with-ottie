import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { createFixedClock, createLearningStore, createMemoryStorage, DEFAULT_PRESENTATION, reducePresentation } from '@ottie/learning-state';

describe('presentation state', () => {
  it('does not alter the learning snapshot', () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const before = store.snapshot();
    let state = DEFAULT_PRESENTATION;
    state = reducePresentation(state, { type: 'set_camera', cameraPreset: 'approach_ego' });
    state = reducePresentation(state, { type: 'toggle_enlarged' });
    state = reducePresentation(state, { type: 'open_help', termId: 'term' });
    state = reducePresentation(state, { type: 'open_comparison', comparisonId: 'comparison' });
    state = reducePresentation(state, { type: 'close_comparison' });
    state = reducePresentation(state, { type: 'close_help' });
    expect(state.viewerEnlarged).toBe(true);
    expect(store.snapshot()).toBe(before);
  });
});
