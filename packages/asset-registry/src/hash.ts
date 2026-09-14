import { type AssetDefinition, canonicalJson } from '@ottie/contracts';

/** Canonical bytes hashed into `AssetResolver.registryHash`: sorted by id, sorted keys, no whitespace. */
export function registryHashInput(assets: readonly AssetDefinition[]): string {
  const sorted = [...assets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return canonicalJson(sorted);
}
