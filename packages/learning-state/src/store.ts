import {
  LEARNING_STATE_SCHEMA_VERSION,
  type Clock,
  type ContentBundle,
  type LearningEvent,
  type LearningSnapshot,
  type LearningStore,
  type Storage,
} from '@ottie/contracts';
import { EMPTY_SNAPSHOT, applyLearningEvent } from './reducer';
import { learningSnapshotSchema, persistedPayloadSchema, type LoadReport } from './schema';
import { freezeDeep } from '@ottie/contracts';

export class LearningStateError extends Error {
  readonly reason: string;
  readonly event: LearningEvent | null;

  constructor(reason: string, event: LearningEvent | null = null) {
    super(reason);
    this.name = 'LearningStateError';
    this.reason = reason;
    this.event = event;
  }
}

export interface LearningStoreOptions {
  readonly storage: Storage;
  readonly clock: Clock;
  readonly bundle: ContentBundle;
  readonly storageKey?: string;
}

export interface LearningStoreWithPersistence extends LearningStore {
  loadReport(): LoadReport | null;
  erase(): Promise<void>;
  exportJson(): Promise<string>;
  snapshot(): LearningSnapshot;
}

export function createLearningStore(options: LearningStoreOptions): LearningStoreWithPersistence {
  const storageKey = options.storageKey ?? 'learning-state';
  let current = EMPTY_SNAPSHOT;
  let loaded = false;
  let report: LoadReport | null = null;
  let operations = Promise.resolve();
  const listeners = new Set<(snapshot: LearningSnapshot) => void>();

  const notify = (): void => {
    for (const listener of listeners) listener(current);
  };

  const quarantine = async (raw: string, detail: string, mismatch: number | undefined): Promise<LearningSnapshot> => {
    const quarantinedKey = `${storageKey}.quarantine.${options.clock.now()}`;
    await options.storage.set(quarantinedKey, raw);
    await options.storage.remove(storageKey);
    report =
      mismatch === undefined
        ? { status: 'corrupted', detail, quarantinedKey }
        : { status: 'version_mismatch', found: mismatch, expected: LEARNING_STATE_SCHEMA_VERSION, quarantinedKey };
    current = EMPTY_SNAPSHOT;
    loaded = true;
    return current;
  };

  const loadNow = async (): Promise<LearningSnapshot> => {
    const raw = await options.storage.get(storageKey);
    if (raw === null) {
      current = EMPTY_SNAPSHOT;
      report = { status: 'empty' };
      loaded = true;
      return current;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      return quarantine(raw, error instanceof Error ? error.message : String(error), undefined);
    }
    const payload = persistedPayloadSchema.safeParse(parsed);
    if (!payload.success) return quarantine(raw, payload.error.message, undefined);
    if (payload.data.schemaVersion !== LEARNING_STATE_SCHEMA_VERSION) return quarantine(raw, '', payload.data.schemaVersion);
    const snapshotVersion =
      typeof payload.data.snapshot === 'object' &&
      payload.data.snapshot !== null &&
      'schemaVersion' in payload.data.snapshot &&
      typeof payload.data.snapshot.schemaVersion === 'number'
        ? payload.data.snapshot.schemaVersion
        : undefined;
    if (snapshotVersion !== LEARNING_STATE_SCHEMA_VERSION) {
      return quarantine(raw, '', snapshotVersion ?? -1);
    }
    const snapshot = learningSnapshotSchema.safeParse(payload.data.snapshot);
    if (!snapshot.success) return quarantine(raw, snapshot.error.message, undefined);
    current = freezeDeep(snapshot.data) as LearningSnapshot;
    report = { status: 'ok', savedAt: payload.data.savedAt };
    loaded = true;
    return current;
  };

  const ensureLoaded = async (): Promise<void> => {
    if (!loaded) await loadNow();
  };

  const write = async (): Promise<void> => {
    const payload = {
      schemaVersion: LEARNING_STATE_SCHEMA_VERSION,
      savedAt: options.clock.now(),
      snapshot: current,
    };
    await options.storage.set(storageKey, JSON.stringify(payload));
  };

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = operations.then(operation);
    operations = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    load: () =>
      enqueue(async () => {
        if (!loaded) return loadNow();
        return current;
      }),
    apply: (event) =>
      enqueue(async () => {
        await ensureLoaded();
        const outcome = applyLearningEvent(current, event, { bundle: options.bundle });
        if (outcome.kind === 'rejected') throw new LearningStateError(outcome.reason, event);
        if (outcome.kind === 'duplicate') return current;
        current = outcome.snapshot;
        await write();
        notify();
        return current;
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loadReport: () => report,
    erase: () =>
      enqueue(async () => {
        await options.storage.remove(storageKey);
        const quarantinePrefix = `${storageKey}.quarantine.`;
        for (const key of await options.storage.keys(quarantinePrefix)) await options.storage.remove(key);
        current = EMPTY_SNAPSHOT;
        report = { status: 'empty' };
        loaded = true;
        notify();
      }),
    exportJson: () =>
      enqueue(async () => {
        await ensureLoaded();
        return JSON.stringify({
          schemaVersion: LEARNING_STATE_SCHEMA_VERSION,
          savedAt: options.clock.now(),
          snapshot: current,
        });
      }),
    snapshot: () => current,
  };
}
