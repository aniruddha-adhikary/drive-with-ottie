// @vitest-environment jsdom
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CameraPresetName,
  type DeepReadonly,
  type SceneInput,
  type World,
  canonicalJson,
  entityId,
  vec3,
} from '@ottie/contracts';
import {
  DEVELOPMENT_WORLDS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  MUTATION_GIVE_WAY_SIGN_HIDDEN,
  PRESENTATION_ONLY_CAMERA_MOVE,
  QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  SIGNAL_IDS,
  STOP_DEVELOPMENT_ACCESS,
  stripPresentation,
} from '@ottie/contracts/fixtures';
import { type WorldScene, createWorldRenderer } from '@ottie/renderer-geometry';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node';
import { CAMERA_EVIDENCE_CODES as C } from '@ottie/renderer-evidence';
import {
  MODULE_STATUS,
  cameraMatrices,
  checkEvidenceExposure,
  createCameraPort,
  detailGate,
  exportCameraEvidence,
  fitView,
  presetToThreeCamera,
} from '../src';
import {
  VIEWPORT_DESKTOP,
  VIEWPORT_NARROW,
  VIEWPORT_TINY,
  buildFixtureScene,
  developmentResolver,
  mutate,
  repoRoot,
} from './helpers';

const PRESETS: readonly CameraPresetName[] = [
  'plan',
  'study_oblique',
  'approach_ego',
  'entity_detail',
];

function codesOf(diagnostics: readonly { code: string }[]): string[] {
  return diagnostics.map((d) => d.code);
}

function inputFor(
  world: DeepReadonly<World>,
  preset: CameraPresetName,
  viewport = VIEWPORT_DESKTOP,
  highlightEntityId: SceneInput['highlightEntityId'] = null,
): SceneInput {
  return {
    world,
    evidence: world.evidence,
    preset,
    viewport,
    preferences: { reducedMotion: false, textScale: 1, theme: 'light' },
    highlightEntityId,
  };
}

describe('view fitting over the built R1 scene', () => {
  const scenes = new Map<string, WorldScene>();
  beforeAll(async () => {
    for (const world of DEVELOPMENT_WORLDS) scenes.set(world.id, await buildFixtureScene(world));
  });
  const sceneOf = (world: DeepReadonly<World>): WorldScene => {
    const scene = scenes.get(world.id);
    if (!scene) throw new Error(`no scene for ${world.id}`);
    return scene;
  };

  it('shows every evidence of every fixture in all four presets on desktop and phone, adjusting only presentation', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const scene = sceneOf(world);
      for (const viewport of [VIEWPORT_DESKTOP, VIEWPORT_NARROW]) {
        for (const name of PRESETS) {
          const fit = fitView(scene, world, viewport, world.evidence, name);
          const label = `${world.id} ${name} ${String(viewport.widthPx)}x${String(viewport.heightPx)}`;
          // Known limit: the signal plan on a 360x432 safe area cannot hold the oncoming car readably.
          if (world.id === SIGNAL_IDS.world && name === 'plan' && viewport === VIEWPORT_NARROW) {
            expect(fit.ok, label).toBe(false);
            expect(fit.hiddenEvidenceIds).toEqual([SIGNAL_IDS.evidence.oncoming]);
            expect(fit.candidatesTried.length).toBeGreaterThan(1);
            continue;
          }
          expect(
            fit.ok,
            `${label}: ${codesOf(fit.diagnostics.filter((d) => d.severity === 'error')).join(',')}`,
          ).toBe(true);
          expect(fit.hiddenEvidenceIds).toEqual([]);
          expect(fit.camera.name).toBe(name);
          expect(fit.camera.projection).toBe(
            name === 'approach_ego' || name === 'entity_detail' ? 'perspective' : 'orthographic',
          );
          expect(fit.presetName).toBe(name);
          expect(fit.worldId).toBe(world.id);
          expect(fit.evidence.map((e) => e.evidenceId)).toEqual([...fit.visibleEvidenceIds]);
          if (fit.adjusted) expect(codesOf(fit.diagnostics)).toContain(C.presetAdjusted);
          else expect(fit.chosenCandidate).toBe('authored');
          if (name === 'entity_detail') {
            expect(fit.camera.linkedEntityId).toBe(fit.authored?.linkedEntityId);
            expect(codesOf(fit.diagnostics)).not.toContain(C.enlargeBlocked);
          }
        }
      }
    }
  });

  it('keeps the approach_ego eye at the reviewed driver position: only aim and field of view may change', () => {
    const fit = fitView(
      sceneOf(GIVE_WAY_T_JUNCTION),
      GIVE_WAY_T_JUNCTION,
      VIEWPORT_NARROW,
      GIVE_WAY_T_JUNCTION.evidence,
      'approach_ego',
    );
    expect(fit.ok).toBe(true);
    expect(fit.adjusted).toBe(true);
    expect(fit.camera.eye).toEqual(fit.authored?.eye);
    expect(fit.camera.fovOrHalfHeight).toBeGreaterThan(fit.authored?.fovOrHalfHeight ?? Infinity);
    const adjusted = fit.diagnostics.find((d) => d.code === C.presetAdjusted);
    expect(adjusted?.severity).toBe('info');
    expect(adjusted?.data).toMatchObject({
      preset: 'approach_ego',
      candidate: fit.chosenCandidate,
    });
  });

  it("rescues the signal fixture's authored close-up (aimed at the lowest lens) with a face-on detail along the authored front normal", () => {
    const scene = sceneOf(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const fit = fitView(
      scene,
      SIGNALISED_JUNCTION_RIGHT_ARROW,
      VIEWPORT_DESKTOP,
      SIGNALISED_JUNCTION_RIGHT_ARROW.evidence,
      'entity_detail',
    );
    expect(fit.ok).toBe(true);
    expect(fit.adjusted).toBe(true);
    expect(fit.chosenCandidate).toMatch(/^face-on/);
    const head = scene.entities.get(SIGNAL_IDS.entities.nbHead);
    if (head?.kind !== 'signal_head') throw new Error('head missing');
    const view = new Vector3(
      fit.camera.target.x - fit.camera.eye.x,
      fit.camera.target.y - fit.camera.eye.y,
      fit.camera.target.z - fit.camera.eye.z,
    ).normalize();
    // Camera looks against the head's physical front normal; the head itself did not turn.
    expect(view.dot(head.frontNormal)).toBeLessThan(-0.95);
    expect(head.frontNormal.toArray().map(Math.round)).toEqual([0, -1, 0]);
    expect(fit.evidence[0]?.frontFacing).toBe(true);
    expect(fit.evidence[0]?.projectedSizePx).toBeGreaterThan(200);
  });

  it('provides a labelled linked entity_detail when the main view cannot show the readable face together with its road context', () => {
    const scene = sceneOf(GIVE_WAY_T_JUNCTION);
    const fit = fitView(
      scene,
      GIVE_WAY_T_JUNCTION,
      VIEWPORT_TINY,
      GIVE_WAY_T_JUNCTION.evidence,
      'approach_ego',
    );
    const sign = fit.evidence.find((e) => e.evidenceId === GIVE_WAY_IDS.evidence.giveWaySign);
    expect(sign?.visible).toBe(false);
    expect(codesOf(sign?.diagnostics ?? [])).toContain(C.tooSmall);
    expect(fit.linkedDetailEntityIds).toEqual([GIVE_WAY_IDS.entities.giveWaySign]);
    const detail = fit.linkedDetails[0];
    if (!detail) throw new Error('no linked detail');
    expect(detail.entityId).toBe(GIVE_WAY_IDS.entities.giveWaySign);
    expect(detail.contextView).toBe('approach_ego');
    expect(detail.label).toContain(`"${GIVE_WAY_IDS.entities.giveWaySign}"`);
    expect(detail.label).toMatch(/approach view/);
    expect(detail.preset.name).toBe('entity_detail');
    expect(detail.preset.linkedEntityId).toBe(GIVE_WAY_IDS.entities.giveWaySign);
    expect(detail.evidenceIds).toEqual([GIVE_WAY_IDS.evidence.giveWaySign]);
    expect(detail.visibility.every((v) => v.visible)).toBe(true);
    expect(detail.visibility[0]?.projectedSizePx).toBeGreaterThanOrEqual(44);
    expect(detail.matrices.preset.linkedEntityId).toBe(GIVE_WAY_IDS.entities.giveWaySign);
    expect(codesOf(fit.diagnostics)).toContain(C.linkedDetailProvided);
    // The main view still fails its own readability check honestly: the detail is linked, not a substitute.
    expect(fit.ok).toBe(false);
    // Lane association and paint stay in the main view; they are not rescued by a close-up.
    expect(fit.visibleEvidenceIds).toEqual(expect.arrayContaining([GIVE_WAY_IDS.evidence.egoLane]));
  });

  it('does not rescue occluded, reversed or clipped evidence with a close-up and blocks Enlarge until a main view shows the entity in place', async () => {
    const hiddenWorld = MUTATION_GIVE_WAY_SIGN_HIDDEN.apply();
    const hiddenScene = await buildFixtureScene(hiddenWorld);
    const approach = fitView(
      hiddenScene,
      hiddenWorld,
      VIEWPORT_DESKTOP,
      hiddenWorld.evidence,
      'approach_ego',
    );
    expect(approach.ok).toBe(false);
    expect(approach.hiddenEvidenceIds).toContain(GIVE_WAY_IDS.evidence.giveWaySign);
    expect(approach.linkedDetails).toEqual([]);
    expect(codesOf(approach.diagnostics)).toContain(C.occluded);

    const gate = detailGate(
      hiddenScene,
      hiddenWorld,
      VIEWPORT_DESKTOP,
      hiddenWorld.evidence,
      GIVE_WAY_IDS.entities.giveWaySign,
    );
    expect(gate.allowed).toBe(false);
    expect(gate.contextView).toBeNull();
    expect(codesOf(gate.diagnostics)).toEqual([C.enlargeBlocked]);
    expect(gate.diagnostics[0]?.data).toMatchObject({
      entityId: GIVE_WAY_IDS.entities.giveWaySign,
      contextViews: ['approach_ego'],
      blockingCodes: expect.arrayContaining([C.occluded]) as unknown,
    });

    // The mutation removed the authored entity_detail; requesting one for the hidden sign is refused, not synthesised silently.
    const detail = fitView(
      hiddenScene,
      hiddenWorld,
      VIEWPORT_DESKTOP,
      hiddenWorld.evidence,
      'entity_detail',
      { detailEntityId: GIVE_WAY_IDS.entities.giveWaySign },
    );
    expect(detail.ok).toBe(false);
    expect(codesOf(detail.diagnostics)).toEqual(
      expect.arrayContaining([C.enlargeBlocked, C.presetSynthesised]),
    );
    hiddenScene.dispose();

    const okGate = detailGate(
      sceneOf(GIVE_WAY_T_JUNCTION),
      GIVE_WAY_T_JUNCTION,
      VIEWPORT_DESKTOP,
      GIVE_WAY_T_JUNCTION.evidence,
      GIVE_WAY_IDS.entities.giveWaySign,
    );
    expect(okGate).toEqual({ allowed: true, contextView: 'approach_ego', diagnostics: [] });
    // A tiny main view that only fails on size still admits the close-up: that is exactly what it is for.
    const tinyGate = detailGate(
      sceneOf(GIVE_WAY_T_JUNCTION),
      GIVE_WAY_T_JUNCTION,
      VIEWPORT_TINY,
      GIVE_WAY_T_JUNCTION.evidence,
      GIVE_WAY_IDS.entities.giveWaySign,
    );
    expect(tinyGate.allowed).toBe(true);
  });

  it('exposure: required evidence must be visible in a main view, directly or via a linked detail, before Enlarge', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const report = checkEvidenceExposure(
        sceneOf(world),
        world,
        VIEWPORT_DESKTOP,
        world.evidence,
        world.evidence.map((e) => e.id),
      );
      expect(report.ok, world.id).toBe(true);
      expect(report.exposure.every((e) => e.exposed && !e.onlyInEnlarge)).toBe(true);
      expect(report.fits.map((f) => f.presetName)).toEqual([
        'plan',
        'study_oblique',
        'approach_ego',
        'entity_detail',
      ]);
    }
    const notExposedWorld = QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW.world;
    const notExposed = checkEvidenceExposure(
      sceneOf(SIGNALISED_JUNCTION_RIGHT_ARROW),
      notExposedWorld,
      VIEWPORT_DESKTOP,
      notExposedWorld.evidence,
      QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW.apply().requiredEvidenceIds,
    );
    expect(notExposed.ok).toBe(false);
    expect(codesOf(notExposed.diagnostics)).toContain(
      QUESTION_MUTATION_EVIDENCE_NOT_IN_ANY_VIEW.expectedCode,
    );
    expect(
      notExposed.exposure.find((e) => e.evidenceId === SIGNAL_IDS.evidence.nbHeadState),
    ).toMatchObject({ exposed: false, onlyInEnlarge: false, exposedIn: [] });

    const enlargeOnlyWorld = mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (draft) => {
      draft.cameraPresets = draft.cameraPresets.map((c) =>
        c.name === 'entity_detail'
          ? c
          : {
              ...c,
              evidenceIds: c.evidenceIds.filter((e) => e !== SIGNAL_IDS.evidence.nbHeadState),
            },
      );
    });
    const enlargeOnly = checkEvidenceExposure(
      sceneOf(SIGNALISED_JUNCTION_RIGHT_ARROW),
      enlargeOnlyWorld,
      VIEWPORT_DESKTOP,
      enlargeOnlyWorld.evidence,
      [SIGNAL_IDS.evidence.nbHeadState],
    );
    expect(enlargeOnly.ok).toBe(false);
    expect(codesOf(enlargeOnly.diagnostics)).toEqual([C.onlyInEnlarge]);
    expect(enlargeOnly.exposure[0]).toMatchObject({ exposed: false, onlyInEnlarge: true });

    const tiny = checkEvidenceExposure(
      sceneOf(GIVE_WAY_T_JUNCTION),
      GIVE_WAY_T_JUNCTION,
      VIEWPORT_TINY,
      GIVE_WAY_T_JUNCTION.evidence,
      [GIVE_WAY_IDS.evidence.giveWaySign],
    );
    expect(tiny.exposure[0]).toMatchObject({
      exposed: true,
      exposedIn: ['approach_ego'],
      viaLinkedDetailIn: ['approach_ego'],
    });
  });

  it('exports review-ready camera matrices that reproduce the concrete Three.js camera', () => {
    const fit = fitView(
      sceneOf(STOP_DEVELOPMENT_ACCESS),
      STOP_DEVELOPMENT_ACCESS,
      VIEWPORT_NARROW,
      STOP_DEVELOPMENT_ACCESS.evidence,
      'approach_ego',
    );
    const m = fit.matrices;
    expect(m).toEqual(cameraMatrices(fit.camera, VIEWPORT_NARROW));
    expect(m.preset).toMatchObject({
      name: 'approach_ego',
      projection: 'perspective',
      eye: [fit.camera.eye.x, fit.camera.eye.y, fit.camera.eye.z],
    });
    expect(m.safeRectPx).toEqual({ left: 0, top: 48, right: 360, bottom: 480 });
    expect(m.aspect).toBeCloseTo(360 / 640, 9);
    expect(m.view).toHaveLength(16);
    expect(m.projection).toHaveLength(16);
    expect(m.viewProjection).toHaveLength(16);
    const camera = presetToThreeCamera(fit.camera, VIEWPORT_NARROW);
    camera.updateMatrixWorld(true);
    const expected = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).toArray();
    expected.forEach((value, i) => {
      expect(m.viewProjection[i]).toBeCloseTo(value, 6);
    });
    const roundTrip = new Matrix4()
      .fromArray([...m.view])
      .multiply(new Matrix4().fromArray([...m.cameraToWorld]));
    for (let i = 0; i < 16; i += 1)
      expect(roundTrip.elements[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 6);
    expect(JSON.parse(JSON.stringify(m)) as unknown).toEqual(m);
    const exported = exportCameraEvidence(
      fit.camera,
      VIEWPORT_NARROW,
      fit.evidence,
      fit.diagnostics,
    );
    expect(exported.matrices).toEqual(m);
    expect(exported.evidence).toEqual(fit.evidence);
    expect(JSON.parse(JSON.stringify(exported)) as unknown).toEqual(exported);
  });

  it('implements CameraPort over the real renderer scene and reports the same visibility as fitView', async () => {
    const renderer = createWorldRenderer({
      resolver: developmentResolver(),
      artwork: createFileArtworkSource(repoRoot),
    });
    const input = inputFor(GIVE_WAY_T_JUNCTION, 'approach_ego', VIEWPORT_NARROW);
    await renderer.load(GIVE_WAY_T_JUNCTION);
    const port = createCameraPort({
      sceneFor: () => {
        if (!renderer.scene) throw new Error('renderer not loaded');
        return renderer.scene;
      },
    });
    const fit = port.fit(input);
    expect(fit.camera.name).toBe('approach_ego');
    expect(fit.hiddenEvidenceIds).toEqual([]);
    const scene = renderer.scene;
    if (!scene) throw new Error('renderer not loaded');
    expect(fit).toEqual({
      camera: fitView(
        scene,
        GIVE_WAY_T_JUNCTION,
        VIEWPORT_NARROW,
        GIVE_WAY_T_JUNCTION.evidence,
        'approach_ego',
      ).camera,
      visibleEvidenceIds: fit.visibleEvidenceIds,
      hiddenEvidenceIds: [],
      linkedDetailEntityIds: [],
    });
    expect(fit.visibleEvidenceIds).toEqual([
      GIVE_WAY_IDS.evidence.giveWaySign,
      GIVE_WAY_IDS.evidence.giveWayLine,
      GIVE_WAY_IDS.evidence.egoLane,
    ]);
    const report = port.fitReport(input);
    expect(report.camera).toEqual(fit.camera);
    const visibility = port.evaluate(input, fit.camera);
    expect(visibility).toEqual(report.evidence);
    // A highlighted sign in entity_detail is the entity to enlarge.
    const detail = port.fitReport(
      inputFor(
        GIVE_WAY_T_JUNCTION,
        'entity_detail',
        VIEWPORT_DESKTOP,
        GIVE_WAY_IDS.entities.giveWaySign,
      ),
    );
    expect(detail.camera.linkedEntityId).toBe(GIVE_WAY_IDS.entities.giveWaySign);
    expect(detail.ok).toBe(true);
    // A scene built for another world is refused.
    expect(() => port.fit(inputFor(STOP_DEVELOPMENT_ACCESS, 'plan'))).toThrow(
      /scene source returned a scene for world/,
    );
    // Without artwork the face is a flagged blank backing: readable geometry is not assumed.
    const blank = createWorldRenderer({ resolver: developmentResolver() });
    await blank.load(GIVE_WAY_T_JUNCTION);
    const blankScene = blank.scene;
    if (!blankScene) throw new Error('renderer not loaded');
    const blankPort = createCameraPort({ sceneFor: () => blankScene });
    const blankFit = blankPort.fitReport(input);
    expect(blankFit.hiddenEvidenceIds).toEqual([GIVE_WAY_IDS.evidence.giveWaySign]);
    expect(codesOf(blankFit.diagnostics)).toContain(C.faceArtworkUnavailable);
    blank.dispose();
    renderer.dispose();
  });

  it('never mutates the world, traffic, answers, seeds or the built physical geometry; camera moves are presentation-only', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const scene = sceneOf(world);
      const before = canonicalJson(world);
      const matrices = new Map<string, number[]>();
      const normals = new Map<string, number[]>();
      scene.root.updateMatrixWorld(true);
      for (const entity of scene.entities.values()) {
        matrices.set(entity.id, entity.object.matrixWorld.toArray());
        if (entity.kind === 'sign_face' || entity.kind === 'signal_head')
          normals.set(entity.id, entity.frontNormal.toArray());
      }
      for (const viewport of [VIEWPORT_DESKTOP, VIEWPORT_NARROW, VIEWPORT_TINY]) {
        for (const name of PRESETS) fitView(scene, world, viewport, world.evidence, name);
        checkEvidenceExposure(
          scene,
          world,
          viewport,
          world.evidence,
          world.evidence.map((e) => e.id),
        );
      }
      expect(canonicalJson(world)).toBe(before);
      for (const entity of scene.entities.values()) {
        expect(entity.object.matrixWorld.toArray(), entity.id).toEqual(matrices.get(entity.id));
        if (entity.kind === 'sign_face' || entity.kind === 'signal_head')
          expect(entity.frontNormal.toArray()).toEqual(normals.get(entity.id));
      }
      for (const preset of world.cameraPresets) expect(Object.isFrozen(preset)).toBe(true);
    }

    const moved = PRESENTATION_ONLY_CAMERA_MOVE.apply();
    expect(canonicalJson(stripPresentation(moved))).toBe(
      canonicalJson(stripPresentation(SIGNALISED_JUNCTION_RIGHT_ARROW)),
    );
    const scene = sceneOf(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const fit = fitView(scene, moved, VIEWPORT_DESKTOP, moved.evidence, 'plan');
    expect(fit.ok).toBe(true);
    expect(fit.authored?.eye).toEqual(vec3(5, 5, 90));
    // Returned cameras are new frozen values: callers cannot reach back into the world through them.
    expect(Object.isFrozen(fit.camera)).toBe(true);
    expect(fit.camera).not.toBe(fit.authored);
    const evaluationsBefore = fit.evidence.map((e) => e.visible);
    const again = fitView(scene, moved, VIEWPORT_DESKTOP, moved.evidence, 'plan');
    expect(again.evidence.map((e) => e.visible)).toEqual(evaluationsBefore);
    expect(entityId(SIGNAL_IDS.entities.nbHead)).toBe(SIGNAL_IDS.entities.nbHead);
  });

  it('reports its status honestly', () => {
    expect(MODULE_STATUS.implemented).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CameraPort'),
        expect.stringContaining('detailGate'),
        expect.stringContaining('cameraMatrices'),
      ]),
    );
    expect(MODULE_STATUS.pending).toContain('apps/web wiring (I1)');
  });
});
