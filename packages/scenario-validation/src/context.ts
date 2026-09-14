import { type AssetResolver, type Rule, type SourceRef, type Term } from '@ottie/contracts';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_ASSET_REGISTRY_HASH } from '@ottie/contracts/fixtures';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { loadStarterContent } from './content-data';

/**
 * Who the validation is for. `development` tolerates explicitly quarantined assets (the world must
 * declare `provenance.usesQuarantinedAssets`); `learner_release` rejects every asset that is not
 * releaseReady + contentApproved + reuseApproved and every unresolved source conflict. Nothing here
 * can approve anything: release validation only passes when the registry already says so.
 */
export type ValidationTarget = 'development' | 'learner_release';

export interface ValidationContext {
  readonly target: ValidationTarget;
  /** C1 resolver; its `mode` must agree with `target` (release target needs a release-mode resolver). */
  readonly assets: AssetResolver;
  /** Official source register every SourceLocator must point into. */
  readonly sources: readonly SourceRef[];
  /** Source-backed rules (A3) that signal and control semantics are checked against. */
  readonly rules: readonly Rule[];
  /** Source-backed terms (A3) used to check question bindings. */
  readonly terms: readonly Term[];
}

export interface ValidationContextOverrides {
  readonly target?: ValidationTarget;
  readonly assets?: AssetResolver;
  readonly sources?: readonly SourceRef[];
  readonly rules?: readonly Rule[];
  readonly terms?: readonly Term[];
}

let developmentResolver: AssetResolver | null = null;

/** Development resolver over the F0 fixture asset catalogue (quarantined, unapproved assets load). */
export function developmentAssetResolver(): AssetResolver {
  developmentResolver ??= createInMemoryResolver(
    DEVELOPMENT_ASSETS,
    'development',
    DEVELOPMENT_ASSET_REGISTRY_HASH,
  );
  return developmentResolver;
}

/** Release resolver over the same catalogue: resolves nothing until assets are actually approved. */
export function releaseAssetResolver(): AssetResolver {
  return createInMemoryResolver(DEVELOPMENT_ASSETS, 'release', DEVELOPMENT_ASSET_REGISTRY_HASH);
}

export function createValidationContext(
  overrides: ValidationContextOverrides = {},
): ValidationContext {
  const content = loadStarterContent();
  const target = overrides.target ?? 'development';
  return {
    target,
    assets:
      overrides.assets ??
      (target === 'learner_release' ? releaseAssetResolver() : developmentAssetResolver()),
    sources: overrides.sources ?? content.sources,
    rules: overrides.rules ?? content.rules,
    terms: overrides.terms ?? content.terms,
  };
}
