import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { attemptId, eventId, runId, seed, topicId, type AttemptState } from '@ottie/contracts';
import { createFixedClock, createLearningStore, createMemoryStorage } from '@ottie/learning-state';

describe('learning store', () => {
  it('persists the full selected-attempt lifecycle and reloads scenario fields', async () => {
    const storage = createMemoryStorage();
    const clock = createFixedClock(100);
    const store = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    await store.apply({
      type: 'run_started',
      id: eventId('e1'),
      at: clock.now(),
      runId: runId('run.store'),
      topicIds: [topicId('junction-priority')],
    });
    const question = DEVELOPMENT_CONTENT_BUNDLE.questions[0];
    if (!question) throw new Error('Fixture has no questions');
    const attempt: AttemptState = {
      id: attemptId('run.store.a1'),
      runId: runId('run.store'),
      questionId: question.id,
      questionVersion: question.version,
      worldId: question.worldId,
      seed: seed('run.store.q1'),
      phase: 'presented',
      selectedOptionId: null,
      gradedCorrect: null,
      presentedAt: clock.now(),
      gradedAt: null,
      helpOpens: 0,
    };
    await store.apply({ type: 'attempt_presented', id: eventId('e2'), at: clock.now(), attempt });
    const snapshot = await store.apply({ type: 'option_selected', id: eventId('e3'), at: clock.now(), attemptId: attempt.id, optionId: 'b' });
    expect(notifications).toBe(3);
    const reloaded = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    const loaded = await reloaded.load();
    expect(loaded).toEqual(snapshot);
    expect(loaded.attempts[0]).toMatchObject({
      seed: attempt.seed,
      worldId: attempt.worldId,
      questionId: attempt.questionId,
      questionVersion: attempt.questionVersion,
      selectedOptionId: 'b',
      phase: 'selected',
    });
    expect(loaded.runs[0]?.currentAttemptId).toBe(loaded.attempts[0]?.id);
    await reloaded.erase();
    expect(reloaded.snapshot().runs).toHaveLength(0);
  });

  it('quarantines malformed payloads and preserves the raw value', async () => {
    const clock = createFixedClock(200);
    const raw = '{';
    const storage = createMemoryStorage({ 'learning-state': raw });
    const store = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await store.load();
    const report = store.loadReport();
    expect(report?.status).toBe('corrupted');
    expect(await storage.get('learning-state')).toBeNull();
    if (report?.status === 'corrupted') expect(await storage.get(report.quarantinedKey)).toBe(raw);
  });

  it('quarantines version mismatches and wrong-shape JSON', async () => {
    const clock = createFixedClock(200);
    const storage = createMemoryStorage({ 'learning-state': '{' });
    const malformed = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await malformed.load();
    await storage.set('learning-state', JSON.stringify({ schemaVersion: 2, savedAt: 1, snapshot: {} }));
    clock.advanceBy(1);
    const versioned = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await versioned.load();
    const versionReport = versioned.loadReport();
    expect(versionReport).toMatchObject({ status: 'version_mismatch', found: 2 });
    expect(await storage.get('learning-state')).toBeNull();
    expect((await storage.keys('learning-state.quarantine.')).length).toBe(2);

    const wrongShapeStorage = createMemoryStorage({
      'learning-state': JSON.stringify({ schemaVersion: 1, savedAt: 1, snapshot: { schemaVersion: 1, runs: 'nope' } }),
    });
    const wrongShape = createLearningStore({ storage: wrongShapeStorage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await wrongShape.load();
    expect(wrongShape.loadReport()?.status).toBe('corrupted');
    expect(await wrongShapeStorage.get('learning-state')).toBeNull();
  });
});
