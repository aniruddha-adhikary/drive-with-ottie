import { createRequire } from 'node:module';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { Color, Scene, type Camera, type Object3D } from 'three';
import { type Viewport } from '@ottie/contracts';

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
  'SVGRenderer painter’s-algorithm depth sort (no z-buffer; overlapping faces may mis-order)',
  'flat per-face shading (no lighting model beyond material colour/Lambert approximation)',
  'no text rendering from the scene itself (labels are composed by H1 outside the scene)',
  'no near-plane clipping so approach_ego may show the ego actor body',
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
