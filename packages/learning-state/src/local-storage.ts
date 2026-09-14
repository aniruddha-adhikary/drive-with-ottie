import { type Storage } from '@ottie/contracts';

/** Minimal Web Storage shape; injected so tests and non-browser code never touch globals. */
export interface WebStorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

export function createLocalStorageAdapter(backing: WebStorageLike, namespace = 'ottie:'): Storage {
  return {
    get: (key) => Promise.resolve(backing.getItem(namespace + key)),
    set: (key, value) => {
      backing.setItem(namespace + key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      backing.removeItem(namespace + key);
      return Promise.resolve();
    },
    keys: (prefix) => {
      const out: string[] = [];
      const full = namespace + prefix;
      for (let i = 0; i < backing.length; i += 1) {
        const key = backing.key(i);
        if (key?.startsWith(full)) out.push(key.slice(namespace.length));
      }
      return Promise.resolve(out);
    },
  };
}
