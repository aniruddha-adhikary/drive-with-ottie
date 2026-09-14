import { type AssetResolver, type Generator } from '@ottie/contracts';
import { DEVELOPMENT_TEMPLATES, FIXTURE_SOURCE_PROFILE_ID } from '@ottie/contracts/fixtures';
import { createTemplateGenerator } from '@ottie/scenario-core';

/**
 * The C2 template generator wired to the runtime asset resolver instead of the F0 fixture catalogue.
 * The resolver's `registryHash` is pinned into every generated world's provenance, so worlds
 * generated here carry the real compiled-registry hash and reproduce the authored canonical hashes
 * only when registry, templates, layouts and generator version all match the pins.
 */
export function createStarterGenerator(assets: AssetResolver): Generator {
  return createTemplateGenerator({
    templates: DEVELOPMENT_TEMPLATES,
    sourceProfileIds: [FIXTURE_SOURCE_PROFILE_ID],
    assets,
  });
}
