import { createRequire } from 'node:module';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { Color, Scene, Vector3, type Camera, type Object3D } from 'three';
import { type CameraPreset, type Viewport } from '@ottie/contracts';
import { type WorldScene } from '@ottie/renderer-geometry';
import { entitiesContaining } from '@ottie/renderer-evidence';

interface DomWindow {
  readonly document: Document;
  readonly DOMParser: typeof DOMParser;
  readonly Element: typeof Element;
}

interface JSDOMLike {
  readonly window: DomWindow;
}

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { readonly JSDOM: new (html: string) => JSDOMLike };

export const RENDERER_LIMITATIONS: readonly string[] = [
  'SVGRenderer painter’s-algorithm depth sort (no z-buffer); flat surfaces are forced into paint layers ground < road surface < marking < raised geometry, which is only correct for cameras above the ground plane, and raised-vs-raised overlaps (pole behind plate, actor behind pole) remain centroid-sorted and may mis-order',
  'tile labels report R2 evidence visibility computed from world geometry, not from the SVG; tiles flagged "SVG UNRELIABLE" must not be used as rendered proof of visibility',
  'flat per-face shading (no lighting model beyond material colour/Lambert approximation)',
  'no text rendering from the scene itself (labels are composed by H1 outside the scene)',
  'no near-plane clipping; entities whose bounds contain the camera eye (the ego cab in approach_ego) are hidden for that tile and named in its label',
  'rasterisation not performed (SVG only; no PNG delegate available in shell)',
];

export function withDom<T>(fn: () => T): T {
  if (typeof globalThis.document !== 'undefined') return fn();
  const globalScope = globalThis as {
    document?: Document;
    window?: unknown;
    DOMParser?: typeof DOMParser;
    Element?: typeof Element;
  };
  const priorDocument = globalScope.document;
  const priorWindow = globalScope.window;
  const priorDomParser = globalScope.DOMParser;
  const priorElement = globalScope.Element;
  const dom: JSDOMLike = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    DOMParser: dom.window.DOMParser,
    Element: dom.window.Element,
  });
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (priorDocument === undefined) delete globalScope.document;
    else globalScope.document = priorDocument;
    if (priorWindow === undefined) delete globalScope.window;
    else globalScope.window = priorWindow;
    if (priorDomParser === undefined) delete globalScope.DOMParser;
    else globalScope.DOMParser = priorDomParser;
    if (priorElement === undefined) delete globalScope.Element;
    else globalScope.Element = priorElement;
  };
  try {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      return (result as unknown as Promise<unknown>).finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

/**
 * SVG paint layers for flat surfaces. Every flat surface lies on (or 2 cm under) the ground plane, so for a
 * camera above that plane nothing flat can ever be in front of raised geometry; forcing the painter order
 * ground < road surface < marking < everything else removes the large-polygon centroid artefact without
 * moving any world geometry or camera. Raised geometry keeps three's default centroid sort.
 */
export const SVG_PAINT_LAYERS = { ground: -3, roadSurface: -2, marking: -1 } as const;

export interface SvgPaintLayerReport {
  readonly ground: number;
  readonly roadSurface: number;
  readonly marking: number;
}

export function applySvgPaintLayers(root: Object3D): SvgPaintLayerReport {
  let ground = 0;
  let roadSurface = 0;
  let marking = 0;
  root.traverse((object) => {
    if (object.name === 'ground') {
      object.renderOrder = SVG_PAINT_LAYERS.ground;
      ground += 1;
    } else if (object.name.startsWith('road-surface:')) {
      object.renderOrder = SVG_PAINT_LAYERS.roadSurface;
      roadSurface += 1;
    } else if (object.name.startsWith('marking:')) {
      object.renderOrder = SVG_PAINT_LAYERS.marking;
      marking += 1;
    }
  });
  return { ground, roadSurface, marking };
}

export interface SvgTileReliability {
  /** False when the SVG tile cannot be trusted as a rendered proof of what the camera sees. */
  readonly reliable: boolean;
  readonly reasons: readonly string[];
  /** Physical entities whose bounds contain the eye (the ego cab in approach_ego); hidden for this tile only. */
  readonly hiddenEntityIds: readonly string[];
}

/**
 * Decide whether a tile drawn by SVGRenderer for `preset` can be trusted. The layered painter order is
 * only valid for eyes above the ground plane. An eye inside a physical entity (approach_ego sits in the
 * ego cab) would draw that entity's interior faces over the scene because there is no near-plane
 * clipping, so R2's `entitiesContaining` set is hidden for that tile — matching R2, which already excludes
 * the ego from framing — and reported on the tile rather than silently drawn.
 */
export function assessSvgTile(scene: WorldScene, preset: CameraPreset): SvgTileReliability {
  const reasons: string[] = [];
  const groundZ = scene.bounds.min.z;
  if (preset.eye.z <= groundZ) {
    reasons.push(`camera eye z=${preset.eye.z.toFixed(2)} is not above the ground plane z=${groundZ.toFixed(2)}; layered painter order invalid`);
  }
  const hiddenEntityIds = entitiesContaining(scene, new Vector3(preset.eye.x, preset.eye.y, preset.eye.z)).filter((id) => {
    const kind = scene.entities.get(id)?.kind;
    return kind !== 'road' && kind !== 'marking';
  });
  return { reliable: reasons.length === 0, reasons, hiddenEntityIds };
}

export function withEntitiesHidden<T>(scene: WorldScene, ids: readonly string[], fn: () => T): T {
  const objects = ids.map((id) => scene.entities.get(id)?.object).filter((object): object is Object3D => object !== undefined);
  const prior = objects.map((object) => object.visible);
  for (const object of objects) object.visible = false;
  try {
    return fn();
  } finally {
    objects.forEach((object, i) => {
      object.visible = prior[i] ?? true;
    });
  }
}

export interface RenderedSceneTile {
  readonly viewBox: string;
  readonly inner: string;
}

export function renderSceneTileSvg(root: Object3D, camera: Camera, viewport: Viewport): RenderedSceneTile {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('renderSceneTileSvg requires a document; call withDom() in Node');
  }
  const renderer = new SVGRenderer();
  renderer.setSize(viewport.widthPx, viewport.heightPx);
  renderer.setClearColor(new Color(0xffffff), 1);
  const scene = new Scene();
  scene.add(root);
  renderer.render(scene, camera);
  const viewBox = renderer.domElement.getAttribute('viewBox') ?? `${-viewport.widthPx / 2} ${-viewport.heightPx / 2} ${viewport.widthPx} ${viewport.heightPx}`;
  const svg = renderer.domElement.outerHTML;
  const open = svg.indexOf('>');
  const close = svg.lastIndexOf('</svg>');
  scene.remove(root);
  return { viewBox, inner: open >= 0 && close > open ? svg.slice(open + 1, close) : svg };
}
