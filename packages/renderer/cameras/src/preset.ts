import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { type CameraPreset, type DeepReadonly, type Viewport } from '@ottie/contracts';

const RAD_TO_DEG = 180 / Math.PI;

/** Presentation only: reads the preset, never writes to the world. */
export function presetToThreeCamera(
  preset: DeepReadonly<CameraPreset>,
  viewport: Viewport,
): PerspectiveCamera | OrthographicCamera {
  const aspect = viewport.widthPx / Math.max(1, viewport.heightPx);
  let camera: PerspectiveCamera | OrthographicCamera;
  if (preset.projection === 'perspective') {
    camera = new PerspectiveCamera(preset.fovOrHalfHeight * RAD_TO_DEG, aspect, 0.1, 500);
  } else {
    const halfH = preset.fovOrHalfHeight;
    const halfW = halfH * aspect;
    camera = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 500);
  }
  camera.up.set(preset.up.x, preset.up.y, preset.up.z);
  camera.position.set(preset.eye.x, preset.eye.y, preset.eye.z);
  camera.lookAt(new Vector3(preset.target.x, preset.target.y, preset.target.z));
  camera.updateProjectionMatrix();
  camera.name = `preset:${preset.name}`;
  return camera;
}
