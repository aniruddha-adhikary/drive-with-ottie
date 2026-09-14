/**
 * @ottie/learning-state — U2 owns this module (runs, attempts, preferences, device-local persistence).
 *
 * F0 provides in-memory `Storage`/`Clock` ports for tests and a browser `localStorage` adapter for
 * the web shell. The `LearningStore` itself (events, snapshots, progress) is NOT implemented.
 */
export { MODULE_STATUS } from './status';
export { createMemoryStorage, createFixedClock } from './ports';
export { createLocalStorageAdapter } from './local-storage';
