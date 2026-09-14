/**
 * @ottie/asset-registry — C1 owns this module.
 *
 * F0 provides only the in-memory resolver over a fixed AssetDefinition list and the canonical
 * registry-hash input the fixtures are pinned to (`computeRegistryHash` lives in `./hash.node` so
 * this index stays browser-safe). C1 adds the manifest → AssetDefinition family adapters
 * (`adaptExtractionAsset` gives the provenance half), file loading and the reverse-dependency index.
 */
export { MODULE_STATUS } from './status';
export { createInMemoryResolver } from './resolver';
export { registryHashInput } from './hash';
