import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type ReviewPack } from './pack';
import { canonicalJson } from '@ottie/contracts';

export interface ReviewManifest {
  readonly packHash: string;
  readonly registryHash: string;
  readonly worlds: readonly { readonly worldId: string; readonly files: readonly { readonly path: string; readonly sha256: string }[] }[];
}

function digest(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function writeReviewPack(pack: ReviewPack, outDir: string): Promise<ReviewManifest> {
  const files: { worldId: string; files: { path: string; sha256: string }[] }[] = [];
  for (const world of pack.worlds) {
    const dir = path.join(outDir, world.worldId);
    await mkdir(dir, { recursive: true });
    const entries: [string, string][] = [
      ['world.canonical.json', world.provenance.canonicalJson],
      ['provenance.json', canonicalJson(world.provenance)],
      ['validation.json', canonicalJson(world.validation)],
      ['diagnostics.json', canonicalJson({ ...world.diagnostics, views: world.views })],
      ['release.json', canonicalJson(world.release)],
    ];
    for (const sheet of world.contactSheets) entries.push([`contact-sheet.${sheet.viewport.widthPx}x${sheet.viewport.heightPx}.svg`, sheet.svg]);
    const manifestFiles: { path: string; sha256: string }[] = [];
    for (const [name, body] of entries) {
      const bytes = body.endsWith('\n') ? body : `${body}\n`;
      await writeFile(path.join(dir, name), bytes);
      manifestFiles.push({ path: path.posix.join(world.worldId, name), sha256: digest(bytes) });
    }
    files.push({ worldId: world.worldId, files: manifestFiles });
  }
  const manifest: ReviewManifest = { packHash: pack.packHash, registryHash: pack.registryHash, worlds: files };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'manifest.json'), `${canonicalJson(manifest)}\n`);
  return manifest;
}
