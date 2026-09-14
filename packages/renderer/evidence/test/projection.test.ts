import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Viewport } from '@ottie/contracts';
import { cameraFrame, projectPoint, safeNdc, safeRect, screenExtent, towardViewer } from '../src';
import { VIEWPORT_DESKTOP, VIEWPORT_NARROW } from './helpers';

function lookDown(): OrthographicCamera {
  const camera = new OrthographicCamera(-16, 16, 9, -9, 0.1, 500);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, 50);
  camera.lookAt(new Vector3(0, 0, 0));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('safe rectangle', () => {
  it('is measured in CSS px and shrinks by the insets; device pixel ratio does not change it', () => {
    const desktop = safeRect(VIEWPORT_DESKTOP);
    expect(desktop).toMatchObject({
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      widthPx: 1280,
      heightPx: 720,
    });
    const narrow = safeRect(VIEWPORT_NARROW);
    expect(narrow).toMatchObject({
      left: 0,
      top: 48,
      right: 360,
      bottom: 480,
      widthPx: 360,
      heightPx: 432,
    });
    const hiDpi: Viewport = { ...VIEWPORT_DESKTOP, devicePixelRatio: 2 };
    expect(safeRect(hiDpi)).toEqual(desktop);
  });

  it('maps to an NDC sub-rectangle whose centre moves toward the free side', () => {
    const ndc = safeNdc(VIEWPORT_NARROW);
    expect(ndc.halfWidth).toBeCloseTo(1, 6);
    expect(ndc.halfHeight).toBeCloseTo(432 / 640, 6);
    // 48 px top inset, 160 px bottom inset: the safe centre sits above the viewport centre.
    expect(ndc.centreY).toBeGreaterThan(0);
    expect(ndc.centreX).toBe(0);
  });
});

describe('projection', () => {
  it('distinguishes in-front, in-viewport and in-safe-rect', () => {
    const camera = lookDown();
    const centre = projectPoint(camera, VIEWPORT_DESKTOP, new Vector3(0, 0, 0));
    expect(centre.inFront).toBe(true);
    expect(centre.inViewport).toBe(true);
    expect(centre.inSafeRect).toBe(true);
    expect(centre.xPx).toBeCloseTo(640, 6);
    expect(centre.yPx).toBeCloseTo(360, 6);

    const behind = projectPoint(camera, VIEWPORT_DESKTOP, new Vector3(0, 0, 60));
    expect(behind.inFront).toBe(false);
    expect(behind.inViewport).toBe(false);
    expect(behind.inSafeRect).toBe(false);

    // Bottom of the orthographic frame: inside the viewport but under the narrow viewport's lesson panel.
    const narrowCamera = new OrthographicCamera(-9 * (360 / 640), 9 * (360 / 640), 9, -9, 0.1, 500);
    narrowCamera.up.set(0, 1, 0);
    narrowCamera.position.set(0, 0, 50);
    narrowCamera.lookAt(new Vector3(0, 0, 0));
    narrowCamera.updateProjectionMatrix();
    const low = projectPoint(narrowCamera, VIEWPORT_NARROW, new Vector3(0, -8, 0));
    expect(low.inViewport).toBe(true);
    expect(low.inSafeRect).toBe(false);
    expect(low.yPx).toBeGreaterThan(480);
  });

  it('measures screen extents in CSS px and counts points behind the camera', () => {
    const camera = lookDown();
    const points = [
      new Vector3(-8, 0, 0),
      new Vector3(8, 0, 0),
      new Vector3(0, 4.5, 0),
      new Vector3(0, 0, 70),
    ].map((p) => projectPoint(camera, VIEWPORT_DESKTOP, p));
    const extent = screenExtent(points);
    expect(extent).not.toBeNull();
    expect(extent?.widthPx).toBeCloseTo(640, 4);
    expect(extent?.heightPx).toBeCloseTo(180, 4);
    expect(extent?.count).toBe(3);
    expect(extent?.behind).toBe(1);
    expect(screenExtent(points.slice(3, 4))).toBeNull();
  });

  it('derives the viewer direction from the concrete camera: parallel for orthographic, radial for perspective', () => {
    const ortho = cameraFrame(lookDown());
    expect(ortho.orthographic).toBe(true);
    const parallel = towardViewer(ortho, new Vector3(30, -20, 0));
    expect(parallel.x).toBeCloseTo(0, 9);
    expect(parallel.y).toBeCloseTo(0, 9);
    expect(parallel.z).toBeCloseTo(1, 9);

    const persp = new PerspectiveCamera(60, 16 / 9, 0.1, 500);
    persp.up.set(0, 0, 1);
    persp.position.set(0, -10, 1.2);
    persp.lookAt(new Vector3(0, 0, 1));
    persp.updateMatrixWorld(true);
    const frame = cameraFrame(persp);
    expect(frame.orthographic).toBe(false);
    const toward = towardViewer(frame, new Vector3(3, 0, 1.2));
    expect(toward.x).toBeLessThan(0);
    expect(toward.y).toBeLessThan(0);
    expect(toward.length()).toBeCloseTo(1, 9);
  });
});
