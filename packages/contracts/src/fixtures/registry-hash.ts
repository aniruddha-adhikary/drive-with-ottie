import { type Sha256, sha256 } from '../ids';

/**
 * SHA-256 of `registryHashInput(DEVELOPMENT_ASSETS)`. Pinned as a constant so fixtures stay
 * portable (no crypto at import time); `packages/asset-registry/test/resolver.test.ts` recomputes
 * it and fails when the development asset set changes without this constant being updated
 * (`npx vitest run packages/asset-registry` prints the new value).
 */
export const DEVELOPMENT_ASSET_REGISTRY_HASH: Sha256 = sha256(
  'cf3e151d8016322db6006c13b39a61ed6b03030e97b4bf734530dea38bc499d5',
);

/** Hand-authored fixtures are not produced by a generator; version 0 marks that explicitly. */
export const FIXTURE_GENERATOR_VERSION = 0;

/** Source profile name for the current extraction set (see docs/implementation/CONTRACTS.md). */
export const FIXTURE_SOURCE_PROFILE_ID = 'sg-sources-2026-09';
