// @vitest-environment jsdom
import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  type CameraPreset,
  DEFAULT_PREFERENCES,
  type SceneInput,
  type Viewport,
} from '@ottie/contracts';
import {
  DEVELOPMENT_WORLDS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  STOP_DEVELOPMENT_ACCESS,
} from '@ottie/contracts/fixtures';
import { buildSchematicScene, createWorldRenderer, MODULE_STATUS } from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '../src/artwork.node';
import { developmentResolver, repoRoot } from './helpers';

const viewport: Viewport = {
  widthPx: 1280,
  heightPx: 720,
  devicePixelRatio: 1,
  safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
};

function inputFor(
  world: (typeof DEVELOPMENT_WORLDS)[number],
  highlightEntityId: SceneInput['highlightEntityId'] = null,
): { input: SceneInput; camera: CameraPreset } {
  const camera = world.cameraPresets[0];
  if (!camera) throw new Error('fixture has no camera presets');
  return {
    camera,
    input: {
      world,
      evidence: world.evidence,
      preset: camera.name,
      viewport,
      preferences: {
        reducedMotion: DEFAULT_PREFERENCES.reducedMotion,
        textScale: DEFAULT_PREFERENCES.textScale,
        theme: DEFAULT_PREFERENCES.theme,
      },
      highlightEntityId,
    },
  };
}

describe('createWorldRenderer (RendererPort)', () => {
  it('loads every development fixture, answers lookups and bounds, and disposes cleanly', async () => {
    const renderer = createWorldRenderer({
      resolver: developmentResolver(),
      artwork: createFileArtworkSource(repoRoot),
    });
    const three = new Scene();
    three.add(renderer.root);
    expect(renderer.scene).toBeNull();
    for (const world of DEVELOPMENT_WORLDS) {
      const before = canonicalJson(world);
      await renderer.load(world);
      expect(renderer.scene?.worldId).toBe(world.id);
      expect(renderer.scene?.issues).toEqual([]);
      expect(renderer.root.children).toHaveLength(1);
      const { input, camera } = inputFor(world);
      renderer.update(input, camera);
      renderer.resize({ ...viewport, widthPx: 640 });
      expect(renderer.viewport?.widthPx).toBe(640);
      for (const requirement of world.evidence) {
        const box = renderer.boundsOf(requirement.targetEntityIds);
        expect(box, `evidence ${requirement.id}`).not.toBeNull();
        expect(box?.isEmpty()).toBe(false);
        for (const id of requirement.targetEntityIds) expect(renderer.entity(id)?.id).toBe(id);
      }
      expect(canonicalJson(world)).toBe(before);
    }
    renderer.dispose();
    expect(renderer.scene).toBeNull();
    expect(renderer.root.parent).toBeNull();
    expect(renderer.root.children).toHaveLength(0);
    renderer.dispose();
    await expect(renderer.load(GIVE_WAY_T_JUNCTION)).rejects.toThrow(/disposed/);
  });

  it('highlights presentation-only and never moves physical geometry between updates', async () => {
    const renderer = createWorldRenderer({ resolver: developmentResolver() });
    await renderer.load(GIVE_WAY_T_JUNCTION);
    const sign = renderer.entity(GIVE_WAY_IDS.entities.giveWaySign);
    if (sign?.kind !== 'sign_face') throw new Error('sign not rendered');
    const frontBefore = sign.frontNormal.clone();
    const centreBefore = sign.panelCentre.clone();
    const [firstCamera, secondCamera] = GIVE_WAY_T_JUNCTION.cameraPresets;
    if (!firstCamera || !secondCamera) throw new Error('need two presets');
    renderer.update(
      inputFor(GIVE_WAY_T_JUNCTION, GIVE_WAY_IDS.entities.giveWaySign).input,
      firstCamera,
    );
    const highlight = renderer.root.getObjectByName(
      `highlight:${GIVE_WAY_IDS.entities.giveWaySign}`,
    );
    expect(highlight).toBeDefined();
    expect(highlight?.position.distanceTo(sign.bounds.getCenter(new Vector3()))).toBeLessThan(1e-6);
    renderer.update(inputFor(GIVE_WAY_T_JUNCTION).input, secondCamera);
    expect(
      renderer.root.getObjectByName(`highlight:${GIVE_WAY_IDS.entities.giveWaySign}`),
    ).toBeUndefined();
    expect(renderer.lastCamera).toBe(secondCamera);
    const after = renderer.entity(GIVE_WAY_IDS.entities.giveWaySign);
    if (after?.kind !== 'sign_face') throw new Error('sign lost');
    expect(after.frontNormal.equals(frontBefore)).toBe(true);
    expect(after.panelCentre.equals(centreBefore)).toBe(true);
    expect(after.object.matrixWorld.determinant()).toBeGreaterThan(0);
    renderer.dispose();
  });

  it('refuses updates before load or for a different world', async () => {
    const renderer = createWorldRenderer({ resolver: developmentResolver() });
    const { input, camera } = inputFor(GIVE_WAY_T_JUNCTION);
    expect(() => {
      renderer.update(input, camera);
    }).toThrow(/before load/);
    await renderer.load(STOP_DEVELOPMENT_ACCESS);
    expect(() => {
      renderer.update(input, camera);
    }).toThrow(/call load first/);
    await renderer.load(GIVE_WAY_T_JUNCTION);
    expect(() => {
      renderer.update(input, camera);
    }).not.toThrow();
    renderer.dispose();
  });

  it('keeps the schematic scene and reports module status honestly', () => {
    const schematic = buildSchematicScene(GIVE_WAY_T_JUNCTION);
    expect(schematic.laneCount).toBe(GIVE_WAY_T_JUNCTION.lanes.length);
    expect(schematic.anchorCount).toBeGreaterThan(0);
    expect(MODULE_STATUS.module).toBe('@ottie/renderer-geometry');
    expect(MODULE_STATUS.implemented.join('\n')).toMatch(/buildWorldScene/);
    expect(MODULE_STATUS.implemented.join('\n')).toMatch(/createWorldRenderer/);
    expect(MODULE_STATUS.pending.join('\n')).not.toMatch(/road surfaces/);
  });
});
