import { type Clock, type EpochMs, type Storage } from '@ottie/contracts';

export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(map.get(key) ?? null),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    keys: (prefix) => Promise.resolve([...map.keys()].filter((k) => k.startsWith(prefix))),
  };
}

/** Clock that returns a fixed instant; tests advance it explicitly. */
export function createFixedClock(startMs: EpochMs, timeZone = 'Asia/Singapore'): Clock & { advanceBy(ms: number): void } {
  let now = startMs;
  return {
    timeZone,
    now: () => now,
    advanceBy: (ms) => {
      now += ms;
    },
  };
}
