/**
 * Node-only artwork source (tests, review CLI). Not re-exported from the package index so the
 * browser bundle never pulls `node:fs`; import via `@ottie/renderer-geometry/artwork.node`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type FaceArtworkSource } from './artwork';

export function createFileArtworkSource(repoRoot: string): FaceArtworkSource {
  return {
    async load(file) {
      try {
        return await readFile(path.join(repoRoot, file.path), 'utf8');
      } catch {
        return null;
      }
    },
  };
}
