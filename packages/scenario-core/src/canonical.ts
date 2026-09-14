import { type DeepReadonly, type Sha256, type World, canonicalJson, sha256 } from '@ottie/contracts';
import { sha256Hex } from './sha256';

/** Canonical bytes of a world: sorted keys, arrays in authored order, `provenance.canonicalHash` blanked. */
export function canonicalWorldJson(world: World | DeepReadonly<World>): string {
  return canonicalJson({ ...world, provenance: { ...world.provenance, canonicalHash: null } });
}

/** SHA-256 of `canonicalWorldJson`; identical inputs give identical hashes on every platform. */
export function computeCanonicalHash(world: World | DeepReadonly<World>): Sha256 {
  return sha256(sha256Hex(canonicalWorldJson(world)));
}

export function verifyCanonicalHash(world: World | DeepReadonly<World>): boolean {
  return world.provenance.canonicalHash !== null && world.provenance.canonicalHash === computeCanonicalHash(world);
}
