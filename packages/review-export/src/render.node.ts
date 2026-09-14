import { createRequire } from 'node:module';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { Color, Scene, type Camera, type Object3D } from 'three';
import { type Viewport } from '@ottie/contracts';

interface DomWindow {
  readonly document: Document;
}

interface JSDOMLike {
  readonly window: DomWindow;
}

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { readonly JSDOM: new (html: string) => JSDOMLike };

export const RENDERER_LIMITATIONS: readonly string[] = [
  'SVGRenderer painter’s-algorithm depth sort (no z-buffer; overlapping faces may mis-order)',
  'flat per-face shading (no lighting model beyond material colour/Lambert approximation)',
  'no text rendering from the scene itself (labels are composed by H1 outside the scene)',
  'no near-plane clipping so approach_ego may show the ego actor body',
  'rasterisation not performed (SVG only; no PNG delegate available in shell)',
];

export function createDomForArtwork(): () => void {
  if (typeof globalThis.document !== 'undefined') return () => undefined;
  const dom: JSDOMLike = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, { document: dom.window.document, window: dom.window });
  return () => {
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: unknown }).window;
  };
}

export function renderSceneTileSvg(root: Object3D, camera: Camera, viewport: Viewport): string {
  const priorDocument = globalThis.document;
  const priorWindow = (globalThis as { window?: unknown }).window;
  let dom: JSDOMLike | null = null;
  if (typeof globalThis.document === 'undefined') {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    Object.assign(globalThis, { document: dom.window.document, window: dom.window });
  }
  try {
    const renderer = new SVGRenderer();
    renderer.setSize(viewport.widthPx, viewport.heightPx);
    renderer.setClearColor(new Color(0xffffff), 1);
    const scene = new Scene();
    scene.add(root);
    renderer.render(scene, camera);
    const svg = renderer.domElement.outerHTML;
    const open = svg.indexOf('>');
    const close = svg.lastIndexOf('</svg>');
    scene.remove(root);
    return open >= 0 && close > open ? svg.slice(open + 1, close) : svg;
  } finally {
    if (dom) {
      if (priorDocument === undefined) delete (globalThis as { document?: Document }).document;
      else Object.assign(globalThis, { document: priorDocument });
      if (priorWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else Object.assign(globalThis, { window: priorWindow });
    }
  }
}
