import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { repoRoot, viteAliases } from '../../config/aliases';

/**
 * Single web prototype build. Root is apps/web; source outside it (packages/, content/, assets/sg/)
 * is reachable through the shared root aliases and `server.fs.allow`.
 */
export default defineConfig({
  root: path.join(repoRoot, 'apps/web'),
  plugins: [react()],
  resolve: { alias: viteAliases() },
  server: {
    port: 5173,
    strictPort: false,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: path.join(repoRoot, 'apps/web/dist'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2023',
  },
  define: {
    __OTTIE_BUILD_MODE__: JSON.stringify('development-prototype'),
  },
});
