import { type Generator } from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH, DEVELOPMENT_TEMPLATES, FIXTURE_SOURCE_PROFILE_ID } from '@ottie/contracts/fixtures';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { createTemplateGenerator } from './generator';

/**
 * Generator wired to the F0 development templates, quarantined development assets and pinned
 * registry hash. Everything it produces is development output: `usesQuarantinedAssets` is true and
 * no approval is granted or implied.
 */
export function createDevelopmentGenerator(): Generator {
  return createTemplateGenerator({
    templates: DEVELOPMENT_TEMPLATES,
    sourceProfileIds: [FIXTURE_SOURCE_PROFILE_ID],
    assets: createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH),
  });
}
