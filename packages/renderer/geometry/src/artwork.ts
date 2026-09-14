import { Box2, type ShapePath, Vector2 } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import {
  type AssetDefinition,
  type AssetFile,
  type AssetResolver,
  type DeepReadonly,
  type World,
} from '@ottie/contracts';
import { type SceneIssue } from './types';

/**
 * Sign-face artwork: the extracted `renderer_svg` candidate is loaded as text, hash-checked against
 * the asset's pinned sha256 and parsed into vector paths. Only exact, hash-verified bytes are
 * rendered; anything else falls back to a flagged blank backing plate. Nothing is redrawn,
 * recoloured or substituted.
 */

/** Port for fetching an asset file's text: fetch in the browser, node:fs in tests/CLI (`artwork.node.ts`). */
export interface FaceArtworkSource {
  load(file: AssetFile): Promise<string | null>;
}

export interface SvgViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface ParsedArtwork {
  readonly path: string;
  readonly sha256: string;
  readonly viewBox: SvgViewBox;
  /** Paths in SVG user units (x right, y down). */
  readonly paths: readonly ShapePath[];
}

export function createStaticArtworkSource(
  files: Readonly<Record<string, string>>,
): FaceArtworkSource {
  return { load: (file) => Promise.resolve(files[file.path] ?? null) };
}

/** Browser source: maps a repository-relative asset path to a URL the host serves it from. */
export function createFetchArtworkSource(urlFor: (file: AssetFile) => string): FaceArtworkSource {
  return {
    async load(file) {
      const response = await fetch(urlFor(file));
      return response.ok ? response.text() : null;
    },
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function rendererSvgFile(asset: AssetDefinition): AssetFile | null {
  return asset.provenance.files.find((file) => file.role === 'renderer_svg') ?? null;
}

/** Parse SVG text with Three's SVGLoader. Requires a DOMParser (browser or jsdom). */
export function parseSvgArtwork(path: string, hash: string, text: string): ParsedArtwork {
  const result = new SVGLoader().parse(text);
  // SVGLoader returns the document element here despite its declared type.
  const xml: XMLDocument | Element = result.xml;
  const rootElement = xml instanceof Element ? xml : xml.documentElement;
  const viewBoxAttr = rootElement.getAttribute('viewBox');
  const numbers = viewBoxAttr
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  let viewBox: SvgViewBox;
  if (numbers?.length === 4) {
    viewBox = {
      minX: numbers[0] ?? 0,
      minY: numbers[1] ?? 0,
      width: numbers[2] ?? 0,
      height: numbers[3] ?? 0,
    };
  } else {
    const box = new Box2();
    for (const path of result.paths) {
      for (const sub of path.subPaths) {
        for (const point of sub.getPoints()) box.expandByPoint(point);
      }
    }
    const size = box.getSize(new Vector2());
    viewBox = { minX: box.min.x, minY: box.min.y, width: size.x, height: size.y };
  }
  return { path, sha256: hash, viewBox, paths: result.paths };
}

export interface ArtworkLoadResult {
  readonly artwork: ReadonlyMap<string, ParsedArtwork>;
  readonly issues: readonly SceneIssue[];
}

/**
 * Load, verify and parse the renderer SVG for every sign face in a world. Faces whose artwork is
 * missing, unverifiable or altered are reported and later drawn as blank flagged backings.
 */
export async function loadWorldArtwork(
  world: DeepReadonly<World>,
  resolver: AssetResolver,
  source: FaceArtworkSource,
): Promise<ArtworkLoadResult> {
  const artwork = new Map<string, ParsedArtwork>();
  const issues: SceneIssue[] = [];
  const seen = new Set<string>();
  for (const face of world.signFaces) {
    const resolution = resolver.resolve(face.asset);
    if (!resolution.ok) continue; // reported by the scene builder
    const file = rendererSvgFile(resolution.asset);
    if (!file) {
      issues.push({
        code: 'artwork_unavailable',
        entityId: face.id,
        message: `${resolution.asset.id} has no renderer_svg file`,
      });
      continue;
    }
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    const text = await source.load(file);
    if (text === null) {
      issues.push({
        code: 'artwork_unavailable',
        entityId: face.id,
        message: `${file.path} could not be loaded`,
      });
      continue;
    }
    if (file.sha256 === null) {
      issues.push({
        code: 'artwork_unverified',
        entityId: face.id,
        message: `${file.path} has no pinned sha256; artwork not rendered`,
      });
      continue;
    }
    let actual: string;
    try {
      actual = await sha256Hex(text);
    } catch (error) {
      issues.push({
        code: 'artwork_unverified',
        entityId: face.id,
        message: `${file.path} could not be hashed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (actual !== file.sha256) {
      issues.push({
        code: 'artwork_hash_mismatch',
        entityId: face.id,
        message: `${file.path} sha256 ${actual} != pinned ${file.sha256}`,
      });
      continue;
    }
    try {
      artwork.set(file.path, parseSvgArtwork(file.path, file.sha256, text));
    } catch (error) {
      issues.push({
        code: 'artwork_unavailable',
        entityId: face.id,
        message: `${file.path} failed to parse: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { artwork, issues };
}
