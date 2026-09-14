import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { repoRoot, viteAliases } from './config/aliases';

/**
 * Test discovery is glob based: any `*.test.ts` / `*.test.tsx` under the module directories below is
 * picked up automatically. Downstream modules add tests next to their code; no registration needed.
 *
 *  - project `contracts`  : node environment  — packages/**, tools/scenario-review/**, tests/**
 *  - project `web`        : jsdom environment — apps/web/** (React component / DOM tests)
 */
export default defineConfig({
  resolve: { alias: viteAliases() },
  test: {
    root: repoRoot,
    globals: true,
    passWithNoTests: false,
    projects: [
      {
        resolve: { alias: viteAliases() },
        test: {
          name: 'contracts',
          root: repoRoot,
          globals: true,
          environment: 'node',
          include: [
            'packages/**/*.test.ts',
            'tools/scenario-review/**/*.test.ts',
            'tests/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: viteAliases() },
        define: { __OTTIE_BUILD_MODE__: JSON.stringify('development-prototype-test') },
        test: {
          name: 'web',
          root: repoRoot,
          globals: true,
          environment: 'jsdom',
          setupFiles: ['apps/web/test/setup.ts'],
          include: ['apps/web/**/*.test.ts', 'apps/web/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**'],
        },
      },
    ],
  },
});
