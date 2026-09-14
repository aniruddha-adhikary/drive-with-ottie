import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Root import aliases shared by Vite, Vitest and TypeScript (see tsconfig.json `paths`).
 *
 * Each alias points at a module-local `src/index.ts` (or a directory for content/assets).
 * Downstream modules add code inside their own directory; they must not need to edit this file.
 * Adding a NEW module alias is an F0/I1 (root configuration) change — request it in your report.
 */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const rootAliases: Readonly<Record<string, string>> = {
  '@ottie/contracts': path.join(repoRoot, 'packages/contracts/src/index.ts'),
  '@ottie/asset-registry': path.join(repoRoot, 'packages/asset-registry/src/index.ts'),
  '@ottie/scenario-core': path.join(repoRoot, 'packages/scenario-core/src/index.ts'),
  '@ottie/scenario-validation': path.join(repoRoot, 'packages/scenario-validation/src/index.ts'),
  '@ottie/renderer-geometry': path.join(repoRoot, 'packages/renderer/geometry/src/index.ts'),
  '@ottie/renderer-cameras': path.join(repoRoot, 'packages/renderer/cameras/src/index.ts'),
  '@ottie/renderer-evidence': path.join(repoRoot, 'packages/renderer/evidence/src/index.ts'),
  '@ottie/learning-state': path.join(repoRoot, 'packages/learning-state/src/index.ts'),
  '@ottie/review-export': path.join(repoRoot, 'packages/review-export/src/index.ts'),
};

/** Directory aliases: `import x from '@ottie/content/terms/starter/foo.json'`. */
export const directoryAliases: Readonly<Record<string, string>> = {
  '@ottie/content': path.join(repoRoot, 'content'),
  '@ottie/sg-assets': path.join(repoRoot, 'assets/sg'),
  '@ottie/web': path.join(repoRoot, 'apps/web/src'),
};

/**
 * Vite/Vitest `resolve.alias` entries. Exact module aliases are listed before directory aliases
 * so `@ottie/contracts` resolves to the index while `@ottie/contracts/fixtures/...` still works.
 */
export function viteAliases(): { find: string | RegExp; replacement: string }[] {
  const entries: { find: string | RegExp; replacement: string }[] = [];
  for (const [find, indexFile] of Object.entries(rootAliases)) {
    const srcDir = path.dirname(indexFile);
    entries.push({ find: new RegExp(`^${escapeRegExp(find)}$`), replacement: indexFile });
    entries.push({ find: new RegExp(`^${escapeRegExp(find)}/(.*)$`), replacement: `${srcDir}/$1` });
  }
  for (const [find, dir] of Object.entries(directoryAliases)) {
    entries.push({ find: new RegExp(`^${escapeRegExp(find)}/(.*)$`), replacement: `${dir}/$1` });
  }
  return entries;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
