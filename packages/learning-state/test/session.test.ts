import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { runId, topicId } from '@ottie/contracts';
import { ContentExhaustedError, createFixedClock, createLearningSession, createLearningStore, createMemoryStorage } from '@ottie/learning-state';

describe('learning session', () => {
  it('keeps check and continue idempotent', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.session');
    await session.startRun([topicId('junction-priority')], run);
    await session.present(run);
    await session.select(run, 'a');
    await session.check(run);
    const gradedCount = store.snapshot().appliedEventIds.length;
    await session.check(run);
    expect(store.snapshot().appliedEventIds).toHaveLength(gradedCount);
    await session.continue(run, 3);
    await session.continue(run, 3);
    expect(store.snapshot().runs[0]?.roadCoveredM).toBe(3);
  });

  it('returns the same in-flight attempt and throws on exhaustion', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.exhaust');
    await session.startRun([topicId('traffic-signals')], run);
    const first = await session.present(run);
    const second = await session.present(run);
    expect(second).toBe(first);
    await session.select(run, 'a');
    await session.check(run);
    await session.continue(run, 1);
    await expect(session.present(run)).rejects.toBeInstanceOf(ContentExhaustedError);
  });
});
