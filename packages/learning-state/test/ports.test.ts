import { describe, expect, it } from 'vitest';
import { createFixedClock, createLocalStorageAdapter, createMemoryStorage } from '@ottie/learning-state';

describe('learning-state ports', () => {
  it('memory storage round-trips and filters keys by prefix', async () => {
    const storage = createMemoryStorage();
    await storage.set('run:1', 'a');
    await storage.set('pref:theme', 'b');
    expect(await storage.get('run:1')).toBe('a');
    expect(await storage.keys('run:')).toEqual(['run:1']);
    await storage.remove('run:1');
    expect(await storage.get('run:1')).toBeNull();
  });

  it('fixed clock only moves when advanced', () => {
    const clock = createFixedClock(1_700_000_000_000);
    expect(clock.now()).toBe(1_700_000_000_000);
    clock.advanceBy(5000);
    expect(clock.now()).toBe(1_700_000_005_000);
    expect(clock.timeZone).toBe('Asia/Singapore');
  });

  it('local storage adapter namespaces keys', async () => {
    const backing = new Map<string, string>();
    const storage = createLocalStorageAdapter({
      get length() {
        return backing.size;
      },
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
      key: (i) => [...backing.keys()][i] ?? null,
    });
    await storage.set('run:1', 'x');
    expect(backing.has('ottie:run:1')).toBe(true);
    expect(await storage.keys('run:')).toEqual(['run:1']);
  });
});
