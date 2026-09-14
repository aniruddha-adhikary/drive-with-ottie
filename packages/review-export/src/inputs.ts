import { type AssetResolver, type ContentBundle, type DeepReadonly, type Sha256, type Template, type Viewport, type World, type WorldId } from '@ottie/contracts';
import { type CompiledRegistry } from '@ottie/asset-registry';
import { type FaceArtworkSource } from '@ottie/renderer-geometry';
import { type ValidationContextOverrides } from '@ottie/scenario-validation';

export interface ReviewInputs {
  readonly registry: CompiledRegistry;
  readonly registryHash: Sha256;
  readonly worlds: readonly DeepReadonly<World>[];
  readonly templates?: readonly Template[];
  readonly bundles?: readonly ContentBundle[];
  readonly resolver: AssetResolver;
  readonly validation?: ValidationContextOverrides;
  readonly repoRoot?: string;
}

export interface ReviewPackOptions {
  readonly viewports?: readonly Viewport[];
  readonly worldIds?: readonly WorldId[];
  readonly artwork?: FaceArtworkSource;
}

export const REVIEW_VIEWPORT: Viewport = {
  widthPx: 1280,
  heightPx: 800,
  devicePixelRatio: 1,
  safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
};
