/**
 * Route registry for feature modules. Each feature adds ONE entry here with a lazy import of its own
 * `apps/web/src/features/<name>/index.tsx`; nothing else in the shell needs editing. Routing is by
 * URL hash (`#/inspector`); the first entry is the default.
 */
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';

export interface FeatureRoute {
  readonly path: string;
  readonly label: string;
  readonly component: LazyExoticComponent<ComponentType>;
}

export const FEATURE_ROUTES: readonly FeatureRoute[] = [
  { path: '/', label: 'Lesson', component: lazy(() => import('./features/lesson')) },
  { path: '/inspector', label: 'Fixture inspector', component: lazy(() => import('./features/inspector')) },
];

export function routePathFromHash(hash: string): string {
  const path = hash.replace(/^#/, '');
  return path === '' ? '/' : path;
}

export function findRoute(path: string): FeatureRoute {
  const found = FEATURE_ROUTES.find((route) => route.path === path);
  const first = FEATURE_ROUTES[0];
  if (!first) throw new Error('no feature routes registered');
  return found ?? first;
}
