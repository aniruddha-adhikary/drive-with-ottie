/**
 * Route registry for feature modules. Each feature (U1/I1) adds ONE entry here with a lazy import of
 * its own `apps/web/src/features/<name>/index.tsx`; nothing else in the shell needs editing.
 * F0 has no features, so this is empty and the App renders the fixture inspector directly.
 */
import { type ComponentType, type LazyExoticComponent } from 'react';

export interface FeatureRoute {
  readonly path: string;
  readonly label: string;
  readonly component: LazyExoticComponent<ComponentType>;
}

export const FEATURE_ROUTES: readonly FeatureRoute[] = [];
