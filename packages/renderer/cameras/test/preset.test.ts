import { describe, expect, it } from 'vitest';
import { canonicalJson, type Viewport } from '@ottie/contracts';
import { GIVE_WAY_T_JUNCTION } from '@ottie/contracts/fixtures';
import { presetToThreeCamera } from '@ottie/renderer-cameras';

const viewport: Viewport = { widthPx: 800, heightPx: 600, devicePixelRatio: 1, safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 } };

describe('camera presets', () => {
  it('honours each preset frame (Z-up world; plan view uses north as screen-up) without touching the world', () => {
    const before = canonicalJson(GIVE_WAY_T_JUNCTION);
    for (const preset of GIVE_WAY_T_JUNCTION.cameraPresets) {
      const camera = presetToThreeCamera(preset, viewport);
      expect(camera.up.toArray()).toEqual([preset.up.x, preset.up.y, preset.up.z]);
      const view = { x: preset.target.x - preset.eye.x, y: preset.target.y - preset.eye.y, z: preset.target.z - preset.eye.z };
      const dot = view.x * preset.up.x + view.y * preset.up.y + view.z * preset.up.z;
      const len = Math.hypot(view.x, view.y, view.z);
      expect(Math.abs(dot / len)).toBeLessThan(0.999);
      if (preset.name === 'plan') expect(camera.up.toArray()).toEqual([0, 1, 0]);
      else expect(camera.up.z).toBe(1);
      expect(camera.position.x).toBe(preset.eye.x);
      expect(camera.name).toBe(`preset:${preset.name}`);
    }
    expect(canonicalJson(GIVE_WAY_T_JUNCTION)).toBe(before);
  });
});
