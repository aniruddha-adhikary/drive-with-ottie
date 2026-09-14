/** Recursive readonly view. Primitives (including branded `string & {…}` ids) and functions are left as-is. */
export type DeepReadonly<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly unknown[]
      ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/**
 * Recursively freezes plain objects and arrays in place and returns them typed as DeepReadonly.
 * Fixtures and generators call this on their output so consumers cannot mutate shared worlds.
 */
export function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      freezeDeep(child);
    }
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

/** Shallow writable view of a readonly record; used only on explicit clones. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Structural clone that drops frozen-ness so callers can build a mutated copy explicitly.
 * Accepts the DeepReadonly view and returns a top-level-writable copy of the underlying type.
 */
export function cloneMutable<T>(value: T | DeepReadonly<T>): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

/**
 * Deterministic JSON serialisation with sorted keys. Two worlds generated from the same
 * template/version/seed/parameters/asset hash must serialise to byte-identical strings.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        out[key] = sortKeys(child);
      }
    }
    return out;
  }
  return value;
}
