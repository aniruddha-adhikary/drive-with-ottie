import { OrthographicCamera, type PerspectiveCamera, Vector3, Vector4 } from 'three';
import { type Viewport } from '@ottie/contracts';

/**
 * Pure projection helpers. A camera here is a concrete Three.js camera built from a CameraPreset;
 * points are world metres (X east, Y north, Z up); screen positions are CSS pixels measured from
 * the viewport's top-left corner. Nothing in this file touches the scene graph.
 */

export type SceneCamera = PerspectiveCamera | OrthographicCamera;

/** Screen rectangle (CSS px) left free by the lesson UI insets. */
export interface SafeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export function safeRect(viewport: Viewport): SafeRect {
  const { top, right, bottom, left } = viewport.safeInsetsPx;
  const safeRight = Math.max(left, viewport.widthPx - right);
  const safeBottom = Math.max(top, viewport.heightPx - bottom);
  return {
    left,
    top,
    right: safeRight,
    bottom: safeBottom,
    widthPx: Math.max(0, safeRight - left),
    heightPx: Math.max(0, safeBottom - top),
  };
}

/** Safe rectangle in normalised device coordinates: centre offset and half extents. */
export interface SafeNdc {
  readonly centreX: number;
  readonly centreY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export function safeNdc(viewport: Viewport): SafeNdc {
  const safe = safeRect(viewport);
  const width = Math.max(1, viewport.widthPx);
  const height = Math.max(1, viewport.heightPx);
  return {
    centreX: (safe.left + safe.right) / width - 1,
    centreY: 1 - (safe.top + safe.bottom) / height,
    halfWidth: safe.widthPx / width,
    halfHeight: safe.heightPx / height,
  };
}

/** World-space frame of a camera: where it is and which way it looks. */
export interface CameraFrame {
  readonly eye: Vector3;
  readonly forward: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
  readonly orthographic: boolean;
  readonly near: number;
}

export function cameraFrame(camera: SceneCamera): CameraFrame {
  camera.updateMatrixWorld(true);
  return {
    eye: new Vector3().setFromMatrixPosition(camera.matrixWorld),
    forward: new Vector3(0, 0, -1).transformDirection(camera.matrixWorld),
    right: new Vector3(1, 0, 0).transformDirection(camera.matrixWorld),
    up: new Vector3(0, 1, 0).transformDirection(camera.matrixWorld),
    orthographic: camera instanceof OrthographicCamera,
    near: camera.near,
  };
}

/** Unit direction from a world point toward the viewer: eye − point (perspective) or −forward (orthographic). */
export function towardViewer(frame: CameraFrame, point: Vector3): Vector3 {
  if (frame.orthographic) return frame.forward.clone().negate();
  const toward = frame.eye.clone().sub(point);
  return toward.lengthSq() < 1e-18 ? frame.forward.clone().negate() : toward.normalize();
}

export interface ProjectedPoint {
  readonly world: Vector3;
  /** View-space position (camera at the origin, looking down −Z). */
  readonly view: Vector3;
  /** Metres in front of the camera plane; negative when behind. */
  readonly depth: number;
  readonly ndc: { readonly x: number; readonly y: number; readonly z: number };
  readonly xPx: number;
  readonly yPx: number;
  readonly inFront: boolean;
  readonly inViewport: boolean;
  readonly inSafeRect: boolean;
}

export function projectPoint(
  camera: SceneCamera,
  viewport: Viewport,
  point: Vector3,
): ProjectedPoint {
  camera.updateMatrixWorld(true);
  const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
  const depth = -view.z;
  const inFront = depth > camera.near;
  const clip = new Vector4(view.x, view.y, view.z, 1).applyMatrix4(camera.projectionMatrix);
  const w = Math.abs(clip.w) < 1e-12 ? 1e-12 : clip.w;
  const ndc = { x: clip.x / w, y: clip.y / w, z: clip.z / w };
  const xPx = ((ndc.x + 1) / 2) * viewport.widthPx;
  const yPx = ((1 - ndc.y) / 2) * viewport.heightPx;
  const safe = safeRect(viewport);
  return {
    world: point.clone(),
    view,
    depth,
    ndc,
    xPx,
    yPx,
    inFront,
    inViewport: inFront && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
    inSafeRect:
      inFront && xPx >= safe.left && xPx <= safe.right && yPx >= safe.top && yPx <= safe.bottom,
  };
}

export function projectPoints(
  camera: SceneCamera,
  viewport: Viewport,
  points: readonly Vector3[],
): readonly ProjectedPoint[] {
  return points.map((p) => projectPoint(camera, viewport, p));
}

/** Screen-space bounding rectangle (CSS px) of the points in front of the camera. */
export interface ScreenExtent {
  readonly minXPx: number;
  readonly minYPx: number;
  readonly maxXPx: number;
  readonly maxYPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Points that contributed (in front of the camera). */
  readonly count: number;
  /** Points that were behind the camera and could not contribute. */
  readonly behind: number;
}

export function screenExtent(points: readonly ProjectedPoint[]): ScreenExtent | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  let behind = 0;
  for (const p of points) {
    if (!p.inFront) {
      behind += 1;
      continue;
    }
    count += 1;
    minX = Math.min(minX, p.xPx);
    maxX = Math.max(maxX, p.xPx);
    minY = Math.min(minY, p.yPx);
    maxY = Math.max(maxY, p.yPx);
  }
  if (count === 0) return null;
  return {
    minXPx: minX,
    minYPx: minY,
    maxXPx: maxX,
    maxYPx: maxY,
    widthPx: maxX - minX,
    heightPx: maxY - minY,
    count,
    behind,
  };
}

/** Plain `{x, y, z}` copy for diagnostics and review exports. */
export function plainVec(v: Vector3): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return { x: round(v.x), y: round(v.y), z: round(v.z) };
}

export function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  const rounded = Math.round(value * f) / f;
  return rounded === 0 ? 0 : rounded;
}
