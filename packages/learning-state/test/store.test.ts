import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { eventId, runId, topicId } from '@ottie/contracts';
import { createFixedClock, createLearningStore, createMemoryStorage } from '@ottie/learning-state';

describe('learning store', () => {
  it('persists, reloads, notifies, and erases', async () => {
    const storage = createMemoryStorage();
    const clock = createFixedClock(100);
    const store = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    const snapshot = await store.apply({
      type: 'run_started',
      id: eventId('e1'),
      at: clock.now(),
      runId: runId('run.store'),
      topicIds: [topicId('junction-priority')],
    });
    expect(snapshot.runs).toHaveLength(1);
    expect(notifications).toBe(1);
    const reloaded = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    expect(await reloaded.load()).toEqual(snapshot);
    await reloaded.erase();
    expect(reloaded.snapshot().runs).toHaveLength(0);
  });

  it('quarantines malformed payloads and reports versions', async () => {
    const clock = createFixedClock(200);
    const storage = createMemoryStorage({ 'learning-state': '{' });
    const store = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await store.load();
    expect(store.loadReport()?.status).toBe('corrupted');
    expect(await storage.get('learning-state')).toBeNull();
    expect((await storage.keys('learning-state.quarantine.')).length).toBe(1);
    await storage.set('learning-state', JSON.stringify({ schemaVersion: 2, savedAt: 1, snapshot: {} }));
    const versioned = createLearningStore({ storage, clock, bundle: DEVELOPMENT_CONTENT_BUNDLE });
    await versioned.load();
    expect(versioned.loadReport()).toMatchObject({ status: 'version_mismatch', found: 2 });
  });
});
