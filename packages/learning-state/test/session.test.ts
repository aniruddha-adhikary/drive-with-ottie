import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { runId, topicId } from '@ottie/contracts';
import {
  ContentExhaustedError,
  LearningStateError,
  createFixedClock,
  createLearningSession,
  createLearningStore,
  createMemoryStorage,
} from '@ottie/learning-state';

describe('learning session', () => {
  it('keeps check and continue idempotent', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.session');
    await session.startRun([topicId('junction-priority')], run);
    await session.present(run);
    await session.select(run, 'b');
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
    await session.select(run, 'b');
    await session.check(run);
    await session.continue(run, 1);
    const error = await session.present(run).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ContentExhaustedError);
    if (error instanceof ContentExhaustedError) {
      expect(error.step.review).toContain(DEVELOPMENT_CONTENT_BUNDLE.questions[2]?.id);
      expect(error.step.otherTopicIds).toContain(topicId('junction-priority'));
      expect(error.step.coverage).toBe('starter_set');
    }
  });

  it('records help without selecting or grading', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.help');
    await session.startRun([topicId('traffic-signals')], run);
    await session.present(run);
    await session.openHelp(run, 'red-arrow-signal');
    const attempt = store.snapshot().attempts.at(0);
    expect(attempt?.selectedOptionId).toBeNull();
    expect(attempt?.phase).toBe('presented');
    expect(attempt?.helpOpens).toBe(1);
  });

  it('does not derive progress or state from elapsed time', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.clock');
    await session.startRun([topicId('traffic-signals')], run);
    await session.present(run);
    clock.advanceBy(60 * 60 * 1000);
    await session.select(run, 'b');
    await session.check(run);
    const graded = store.snapshot();
    clock.advanceBy(3 * 24 * 60 * 60 * 1000);
    await session.continue(run, 7);
    const final = store.snapshot();
    expect(final.runs).toHaveLength(1);
    expect(final.attempts).toHaveLength(1);
    expect(final.runs[0]?.roadCoveredM).toBe(7);
    expect(final.runs[0]?.questionQueue).toEqual([]);
    expect(final.runs[0]?.startedAt).toBe(1);
    expect(final.runs[0]?.topicIds).toEqual([topicId('traffic-signals')]);
    expect(final.runs[0]?.currentAttemptId).toBeNull();
    expect(final.attempts[0]).toMatchObject({
      runId: run,
      phase: 'continued',
      selectedOptionId: 'b',
      gradedCorrect: false,
      presentedAt: 1,
      helpOpens: 0,
    });
    expect(graded.attempts[0]?.gradedAt).toBe(60 * 60 * 1000 + 1);
    expect(final.runs[0]?.lastActiveAt).toBe(60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000 + 1);
  });

  it('rejects checking before selection and retains the latest selection', async () => {
    const clock = createFixedClock(1);
    const store = createLearningStore({ storage: createMemoryStorage(), clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const session = createLearningSession({ store, bundle: DEVELOPMENT_CONTENT_BUNDLE, clock });
    const run = runId('run.selection');
    await session.startRun([topicId('traffic-signals')], run);
    await session.present(run);
    const checkError = await session.check(run).catch((reason: unknown) => reason);
    expect(checkError).toBeInstanceOf(LearningStateError);
    if (checkError instanceof LearningStateError) expect(checkError.event).toBeNull();
    await session.select(run, 'a');
    await session.select(run, 'b');
    expect(store.snapshot().attempts).toHaveLength(1);
    expect(store.snapshot().attempts[0]?.selectedOptionId).toBe('b');
    expect(store.snapshot().attempts[0]?.phase).toBe('selected');
  });
});
