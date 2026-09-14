import {
  type AssetFile,
  type AssetFileRole,
  type AssetResolver,
  type Term,
} from '@ottie/contracts';
import { type ArtworkChoice, type ArtworkSource } from './types';

/**
 * Preferred file per role for the explainer's large visual. The extracted source vector/raster is
 * the canonical picture of the control; the renderer geometry SVG is a schematic fallback.
 */
const DISPLAY_ROLE_ORDER: readonly AssetFileRole[] = [
  'reference_svg',
  'reference_png',
  'renderer_svg',
];

export function displayFile(files: readonly AssetFile[]): AssetFile | null {
  for (const role of DISPLAY_ROLE_ORDER) {
    const file = files.find(
      (f) => f.role === role && typeof f.path === 'string' && f.path.length > 0,
    );
    if (file) return file;
  }
  return null;
}

/**
 * Picks the artwork for a term from its `illustratedBy` refs through the host's resolver. The first
 * ref that resolves and has a displayable file wins; in release mode the resolver rejects every
 * unapproved asset, so this never displays quarantined artwork outside development. Nothing is
 * invented: an unresolvable ref yields an explicit reason instead of a picture.
 */
export function chooseArtwork(term: Term, resolver: AssetResolver | null): ArtworkChoice {
  if (term.illustratedBy.length === 0) return { kind: 'none' };
  if (!resolver) return { kind: 'unresolved', reason: 'no asset resolver supplied' };
  const reasons: string[] = [];
  for (const ref of term.illustratedBy) {
    const resolution = resolver.resolve(ref);
    if (!resolution.ok) {
      reasons.push(`${ref.id}@${ref.version}: ${resolution.reason}`);
      continue;
    }
    const file = displayFile(resolution.asset.provenance.files);
    if (!file) {
      reasons.push(`${ref.id}@${ref.version}: no displayable file`);
      continue;
    }
    return { kind: 'file', asset: resolution.asset, file, quarantined: resolution.quarantined };
  }
  return { kind: 'unresolved', reason: reasons.join('; ') };
}

const SG_ASSETS_PREFIX = 'assets/sg/';

/**
 * Serves repository asset files through Vite as URLs, loaded lazily per file so the ~40 MB library is
 * never bundled up front. Paths outside `assets/sg/` are refused (nothing else is served).
 */
export function createViteArtworkSource(): ArtworkSource {
  const modules = import.meta.glob<string>('@ottie/sg-assets/**/*.{svg,png}', {
    query: '?url',
    import: 'default',
  });
  const byRelativePath = new Map<string, () => Promise<string>>();
  for (const [key, loader] of Object.entries(modules)) {
    const marker = key.indexOf(SG_ASSETS_PREFIX);
    if (marker >= 0) byRelativePath.set(key.slice(marker), loader);
  }
  return {
    async urlFor(file) {
      if (!file.path.startsWith(SG_ASSETS_PREFIX)) return null;
      const loader = byRelativePath.get(file.path);
      if (!loader) return null;
      try {
        return await loader();
      } catch {
        return null;
      }
    },
  };
}

/** Test/host helper: a source over a fixed map of repository paths to URLs. */
export function createStaticArtworkSource(urls: Readonly<Record<string, string>>): ArtworkSource {
  return {
    urlFor: (file) => Promise.resolve(urls[file.path] ?? null),
  };
}
