/**
 * Node-only registry hashing (tests, CLI, future generators). Not re-exported from the package
 * index so the browser bundle never pulls `node:crypto`; import via `@ottie/asset-registry/hash.node`.
 */
import { createHash } from 'node:crypto';
import { type AssetDefinition, type Sha256, sha256 } from '@ottie/contracts';
import { registryHashInput } from './hash';

export function computeRegistryHash(assets: readonly AssetDefinition[]): Sha256 {
  return sha256(createHash('sha256').update(registryHashInput(assets), 'utf8').digest('hex'));
}
