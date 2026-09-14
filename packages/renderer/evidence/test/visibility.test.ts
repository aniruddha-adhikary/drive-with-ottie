// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CameraPreset,
  type DeepReadonly,
  HEADING,
  type Mutable,
  type World,
  canonicalJson,
  cloneMutable,
  freezeDeep,
  unitVec3,
  vec3,
} from '@ottie/contracts';
import {
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  MUTATION_GIVE_WAY_SIGN_HIDDEN,
  MUTATION_GIVE_WAY_SIGN_REVERSED,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  SIGNAL_IDS,
  STOP_DEVELOPMENT_ACCESS,
  STOP_IDS,
} from '@ottie/contracts/fixtures';
import { presetToThreeCamera } from '@ottie/renderer-cameras';
import { type WorldScene } from '@ottie/renderer-geometry';
import {
  CAMERA_EVIDENCE_CODES as C,
  type EvidenceEvaluation,
  cameraFrame,
  evaluateFacing,
  evaluateView,
  indexOccluders,
  linkedDetailLabel,
  measureOcclusion,
  projectPoints,
  sampleEntity,
} from '../src';
import { VIEWPORT_DESKTOP, VIEWPORT_NARROW, authoredPreset, buildFixtureScene } from './helpers';

function mutate(
  base: DeepReadonly<World>,
  edit: (draft: Mutable<World>) => void,
): DeepReadonly<World> {
  const draft = cloneMutable<World>(base);
  edit(draft);
  return freezeDeep<World>(draft);
}

function evaluate(
  scene: WorldScene,
  world: DeepReadonly<World>,
  preset: CameraPreset,
  viewport = VIEWPORT_DESKTOP,
): readonly EvidenceEvaluation[] {
  const camera = presetToThreeCamera(preset, viewport);
  return evaluateView(scene, world, viewport, camera, preset, world.evidence).evaluations;
}

function byId(evaluations: readonly EvidenceEvaluation[], evidenceId: string): EvidenceEvaluation {
  const found = evaluations.find((e) => e.visibility.evidenceId === evidenceId);
  if (!found) throw new Error(`no evaluation for ${evidenceId}`);
  return found;
}

function codes(evaluation: EvidenceEvaluation): string[] {
  return evaluation.visibility.diagnostics.map((d) => d.code);
}

describe('evidence visibility over the built R1 scene', () => {
  let giveWay: WorldScene;
  let stop: WorldScene;
  let signal: WorldScene;
  beforeAll(async () => {
    giveWay = await buildFixtureScene(GIVE_WAY_T_JUNCTION);
    stop = await buildFixtureScene(STOP_DEVELOPMENT_ACCESS);
    signal = await buildFixtureScene(SIGNALISED_JUNCTION_RIGHT_ARROW);
  });

  it('shows every authored evidence of the development fixtures in its authored preset (desktop)', () => {
    for (const [scene, world] of [
      [giveWay, GIVE_WAY_T_JUNCTION],
      [stop, STOP_DEVELOPMENT_ACCESS],
      [signal, SIGNALISED_JUNCTION_RIGHT_ARROW],
    ] as const) {
      for (const preset of world.cameraPresets) {
        const evaluations = evaluate(scene, world, preset);
        expect(evaluations.map((e) => e.visibility.evidenceId)).toEqual([...preset.evidenceIds]);
        for (const e of evaluations) {
          expect(e.visibility.diagnostics.every((d) => d.validator === 'camera_evidence')).toBe(
            true,
          );
          // The signal fixture's authored entity_detail aims at the lowest lens and clips the head top;
          // the fitter (cameras package) rescues it. Everything else is visible as authored.
          if (world.id === SIGNAL_IDS.world && preset.name === 'entity_detail') {
            expect(codes(e)).toContain(C.clipped);
            continue;
          }
          expect(
            e.visibility.visible,
            `${world.id} ${preset.name} ${e.visibility.evidenceId}: ${codes(e).join(',')}`,
          ).toBe(true);
        }
      }
    }
  });

  it('reports the authored front normal of a sign as front-facing from the approach and null for paint', () => {
    const approach = evaluate(
      giveWay,
      GIVE_WAY_T_JUNCTION,
      authoredPreset(GIVE_WAY_T_JUNCTION, 'approach_ego'),
    );
    const sign = byId(approach, GIVE_WAY_IDS.evidence.giveWaySign);
    expect(sign.visibility.frontFacing).toBe(true);
    expect(sign.visibility.projectedSizePx).toBeGreaterThanOrEqual(44);
    expect(sign.visibility.occlusionFraction).toBe(0);
    expect(sign.visibility.coVisibleSatisfied).toBe(true);
    const line = byId(approach, GIVE_WAY_IDS.evidence.giveWayLine);
    expect(line.visibility.frontFacing).toBeNull();
    expect(line.targets[0]?.projectedExtentPx?.widthPx).toBeGreaterThan(0);
    const lane = byId(approach, GIVE_WAY_IDS.evidence.egoLane);
    const laneTarget = lane.targets.find((t) => t.kind === 'lane');
    expect(laneTarget?.visibleLengthM).toBeGreaterThan(0);
    expect(laneTarget?.judgedLengthM).toBeGreaterThan(0);
  });

  it('hidden: a bus between the ego and the Give Way face makes readable_face evidence occluded, naming the occluder', async () => {
    const world = MUTATION_GIVE_WAY_SIGN_HIDDEN.apply();
    const hiddenScene = await buildFixtureScene(world);
    const approach = evaluate(hiddenScene, world, authoredPreset(world, 'approach_ego'));
    const sign = byId(approach, GIVE_WAY_IDS.evidence.giveWaySign);
    expect(sign.visibility.visible).toBe(false);
    expect(codes(sign)).toContain(MUTATION_GIVE_WAY_SIGN_HIDDEN.expectedCode);
    expect(codes(sign)).toContain(C.occluded);
    expect(sign.visibility.occlusionFraction).toBeGreaterThan(
      sign.requirement?.maxOcclusionFraction ?? 0,
    );
    expect(sign.targets[0]?.occluderIds).toContain(GIVE_WAY_IDS.entities.bus);
    // The face itself is still physically front-facing; it is hidden, not turned.
    expect(sign.visibility.frontFacing).toBe(true);
    hiddenScene.dispose();
  });

  it('clipped: turning the approach camera away leaves the face outside the safe rectangle / behind the camera', () => {
    const base = authoredPreset(GIVE_WAY_T_JUNCTION, 'approach_ego');
    const turned: CameraPreset = { ...base, target: vec3(base.eye.x + 20, base.eye.y, base.eye.z) };
    const sign = byId(
      evaluate(giveWay, GIVE_WAY_T_JUNCTION, turned),
      GIVE_WAY_IDS.evidence.giveWaySign,
    );
    expect(sign.visibility.visible).toBe(false);
    expect(codes(sign)).toContain(C.clipped);
    expect(sign.targets[0]?.clippedFraction).toBe(1);
    const reversed: CameraPreset = {
      ...base,
      target: vec3(base.eye.x, base.eye.y - 20, base.eye.z),
    };
    const behind = byId(
      evaluate(giveWay, GIVE_WAY_T_JUNCTION, reversed),
      GIVE_WAY_IDS.evidence.giveWaySign,
    );
    expect(behind.targets[0]?.behindFraction).toBe(1);
    expect(behind.visibility.visible).toBe(false);
  });

  it('reversed: a face physically mounted away from the approach is reported, never rotated to face the camera', async () => {
    const world = mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.signFaces = draft.signFaces.map((f) =>
        f.id === GIVE_WAY_IDS.entities.giveWaySign
          ? { ...f, pose: { ...f.pose, yaw: HEADING.west }, frontNormal: unitVec3(0, 1, 0) }
          : f,
      );
    });
    const scene = await buildFixtureScene(world);
    const entity = scene.entities.get(GIVE_WAY_IDS.entities.giveWaySign);
    if (entity?.kind !== 'sign_face') throw new Error('sign face missing');
    // R1 drew the face at the authored pose; the evidence layer must read exactly that.
    expect(entity.frontNormal.toArray().map(Math.round)).toEqual([0, 1, 0]);
    const matrixBefore = entity.object.matrixWorld.toArray();
    const approach = evaluate(scene, world, authoredPreset(world, 'approach_ego'));
    const sign = byId(approach, GIVE_WAY_IDS.evidence.giveWaySign);
    expect(sign.visibility.visible).toBe(false);
    expect(sign.visibility.frontFacing).toBe(false);
    expect(codes(sign)).toContain(C.notFrontFacing);
    expect(codes(sign)).toContain(C.faceAwayFromApproach);
    expect(sign.targets[0]?.facing?.angleDeg).toBeGreaterThan(90);
    // Evaluation did not touch the geometry.
    expect(entity.frontNormal.toArray().map(Math.round)).toEqual([0, 1, 0]);
    expect(entity.object.matrixWorld.toArray()).toEqual(matrixBefore);
    const facing = evaluateFacing(
      entity,
      cameraFrame(presetToThreeCamera(authoredPreset(world, 'approach_ego'), VIEWPORT_DESKTOP)),
      scene,
    );
    expect(facing.facesIntendedApproach).toBe(false);
    expect(facing.declaredNormalMismatch).toBe(false);
    scene.dispose();
  });

  it('declared-only reversal: the World lies about the normal but the built face still faces the approach; judged from geometry and flagged', async () => {
    const world = MUTATION_GIVE_WAY_SIGN_REVERSED.apply();
    const scene = await buildFixtureScene(world);
    expect(scene.issues.some((i) => i.code === 'front_normal_mismatch')).toBe(true);
    const sign = byId(
      evaluate(scene, world, authoredPreset(world, 'approach_ego')),
      GIVE_WAY_IDS.evidence.giveWaySign,
    );
    expect(sign.visibility.frontFacing).toBe(true);
    expect(codes(sign)).toContain(C.facingDeclarationMismatch);
    scene.dispose();
  });

  it('overlapping: a car standing on the stop line occludes the paint in plan; the car is physically clear but fails only through co-visibility', async () => {
    const world = mutate(STOP_DEVELOPMENT_ACCESS, (draft) => {
      draft.actors = draft.actors.map((a) =>
        a.id === STOP_IDS.entities.crossingCar
          ? {
              ...a,
              laneId: STOP_IDS.lanes.accessWestbound,
              movementId: null,
              progressM: a.progressM,
              pose: { position: vec3(4.25, -1.625, 0), yaw: HEADING.west },
              intention: 'stationary',
              speedKmh: 0,
            }
          : a,
      );
    });
    const scene = await buildFixtureScene(world);
    const plan = evaluate(scene, world, authoredPreset(world, 'plan'));
    const line = byId(plan, STOP_IDS.evidence.stopLine);
    expect(line.visibility.visible).toBe(false);
    expect(codes(line)).toContain(C.occluded);
    expect(line.targets[0]?.occluderIds).toContain(STOP_IDS.entities.crossingCar);
    const car = byId(plan, STOP_IDS.evidence.crossingCar);
    const carTarget = car.targets.find((t) => t.entityId === STOP_IDS.entities.crossingCar);
    expect(carTarget?.occlusionFraction).toBe(0);
    expect(carTarget?.clippedFraction).toBe(0);
    expect(car.visibility.visible).toBe(false);
    expect(codes(car)).toEqual([C.coVisibleHidden]);
    // Occlusion is measured against physical meshes; overlays (lanes/anchors) never block.
    const index = indexOccluders(scene);
    expect(
      [...index.ownerOf.values()].some((id) => scene.entities.get(id)?.layer === 'overlay'),
    ).toBe(false);
    const lineEntity = scene.entities.get(STOP_IDS.entities.stopLine);
    if (!lineEntity) throw new Error('stop line missing');
    const samples = sampleEntity(lineEntity, world, null, scene);
    const camera = presetToThreeCamera(authoredPreset(world, 'plan'), VIEWPORT_DESKTOP);
    const measure = measureOcclusion(
      index,
      cameraFrame(camera),
      projectPoints(camera, VIEWPORT_DESKTOP, samples.points),
      new Set([lineEntity.id]),
    );
    expect(measure.fraction).toBeGreaterThan(0);
    expect(measure.occluderIds).toEqual([STOP_IDS.entities.crossingCar]);
    scene.dispose();
  });

  it('narrow viewport: safe-area insets clip evidence that the raw viewport would still contain', () => {
    const preset = authoredPreset(SIGNALISED_JUNCTION_RIGHT_ARROW, 'plan');
    const desktop = byId(
      evaluate(signal, SIGNALISED_JUNCTION_RIGHT_ARROW, preset, VIEWPORT_DESKTOP),
      SIGNAL_IDS.evidence.oncoming,
    );
    expect(desktop.visibility.visible).toBe(true);
    const narrow = byId(
      evaluate(signal, SIGNALISED_JUNCTION_RIGHT_ARROW, preset, VIEWPORT_NARROW),
      SIGNAL_IDS.evidence.oncoming,
    );
    expect(narrow.visibility.visible).toBe(false);
    expect(codes(narrow)).toContain(C.clipped);
    const clipped = narrow.visibility.diagnostics.find((d) => d.code === C.clipped);
    expect(clipped?.data).toMatchObject({ safeRectPx: { top: 48, bottom: 480 } });
    // Readability is measured in CSS px, so a 3x device pixel ratio must not inflate sizes.
    const dpr1 = byId(
      evaluate(signal, SIGNALISED_JUNCTION_RIGHT_ARROW, preset, {
        ...VIEWPORT_NARROW,
        devicePixelRatio: 1,
      }),
      SIGNAL_IDS.evidence.nbStopLine,
    );
    const dpr3 = byId(
      evaluate(signal, SIGNALISED_JUNCTION_RIGHT_ARROW, preset, VIEWPORT_NARROW),
      SIGNAL_IDS.evidence.nbStopLine,
    );
    expect(dpr3.visibility.projectedSizePx).toBe(dpr1.visibility.projectedSizePx);
  });

  it('view gating and context: evidence not allowed in a view is hidden there; a detail view defers road context to its linked main view', () => {
    const plan = evaluate(giveWay, GIVE_WAY_T_JUNCTION, {
      ...authoredPreset(GIVE_WAY_T_JUNCTION, 'plan'),
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWaySign],
    });
    const signInPlan = byId(plan, GIVE_WAY_IDS.evidence.giveWaySign);
    expect(signInPlan.visibility.visible).toBe(false);
    expect(codes(signInPlan)).toContain(C.viewNotAllowed);

    const detail = evaluate(
      giveWay,
      GIVE_WAY_T_JUNCTION,
      authoredPreset(GIVE_WAY_T_JUNCTION, 'entity_detail'),
    );
    const signDetail = byId(detail, GIVE_WAY_IDS.evidence.giveWaySign);
    expect(signDetail.visibility.visible).toBe(true);
    expect(codes(signDetail)).toContain(C.contextDeferredToLinkedView);

    const unlinked = evaluate(giveWay, GIVE_WAY_T_JUNCTION, {
      ...authoredPreset(GIVE_WAY_T_JUNCTION, 'entity_detail'),
      linkedEntityId: null,
    });
    expect(codes(byId(unlinked, GIVE_WAY_IDS.evidence.giveWaySign))).toContain(C.detailUnlinked);

    const laneAssociationInDetail = evaluate(giveWay, GIVE_WAY_T_JUNCTION, {
      ...authoredPreset(GIVE_WAY_T_JUNCTION, 'entity_detail'),
      evidenceIds: [GIVE_WAY_IDS.evidence.giveWaySign, GIVE_WAY_IDS.evidence.egoLane],
    });
    const lane = byId(laneAssociationInDetail, GIVE_WAY_IDS.evidence.egoLane);
    expect(lane.visibility.visible).toBe(false);
    expect(codes(lane)).toEqual(expect.arrayContaining([C.viewNotAllowed]));
  });

  it('context anchors and co-visible partners are checked in the same camera', () => {
    const missingAnchor = mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.evidence = draft.evidence.map((e) =>
        e.id === GIVE_WAY_IDS.evidence.giveWaySign
          ? {
              ...e,
              contextAnchorIds: [
                ...e.contextAnchorIds,
                'minor.approach.ghost-anchor' as (typeof e.contextAnchorIds)[number],
              ],
            }
          : e,
      );
    });
    const approach = evaluate(
      giveWay,
      missingAnchor,
      authoredPreset(missingAnchor, 'approach_ego'),
    );
    expect(codes(byId(approach, GIVE_WAY_IDS.evidence.giveWaySign))).toContain(
      C.contextAnchorMissing,
    );

    const partnerHidden: CameraPreset = {
      ...authoredPreset(GIVE_WAY_T_JUNCTION, 'plan'),
      evidenceIds: [GIVE_WAY_IDS.evidence.priority],
    };
    const withoutPartner = mutate(GIVE_WAY_T_JUNCTION, (draft) => {
      draft.evidence = draft.evidence.map((e) =>
        e.id === GIVE_WAY_IDS.evidence.priority
          ? { ...e, coVisibleWith: [...e.coVisibleWith, 'ev.not-declared'] }
          : e,
      );
    });
    const priority = byId(
      evaluate(giveWay, withoutPartner, partnerHidden),
      GIVE_WAY_IDS.evidence.priority,
    );
    expect(priority.visibility.coVisibleSatisfied).toBe(false);
    expect(codes(priority)).toContain(C.coVisibleUnknown);

    const unknown = evaluate(giveWay, GIVE_WAY_T_JUNCTION, {
      ...authoredPreset(GIVE_WAY_T_JUNCTION, 'plan'),
      evidenceIds: ['ev.never-declared'],
    });
    const never = byId(unknown, 'ev.never-declared');
    expect(never.visibility.visible).toBe(false);
    expect(codes(never)).toContain(C.requirementUnknown);
  });

  it('labels linked detail views after the real entity and the view that shows its position', () => {
    const sign = giveWay.entities.get(GIVE_WAY_IDS.entities.giveWaySign);
    const head = signal.entities.get(SIGNAL_IDS.entities.nbHead);
    if (!sign || !head) throw new Error('fixture entities missing');
    expect(linkedDetailLabel(sign, 'approach_ego')).toMatch(/Give Way|sign/i);
    expect(linkedDetailLabel(sign, 'approach_ego')).toMatch(/approach view/i);
    expect(linkedDetailLabel(head, 'plan')).toMatch(/signal/i);
  });

  it('never mutates the world or the physical geometry while evaluating', () => {
    const before = canonicalJson(GIVE_WAY_T_JUNCTION);
    const sign = giveWay.entities.get(GIVE_WAY_IDS.entities.giveWaySign);
    if (!sign) throw new Error('sign missing');
    const matrixBefore = sign.object.matrixWorld.toArray();
    for (const preset of GIVE_WAY_T_JUNCTION.cameraPresets) {
      evaluate(giveWay, GIVE_WAY_T_JUNCTION, preset, VIEWPORT_NARROW);
      evaluate(giveWay, GIVE_WAY_T_JUNCTION, {
        ...preset,
        eye: vec3(preset.eye.x + 5, preset.eye.y - 3, preset.eye.z + 1),
      });
    }
    expect(canonicalJson(GIVE_WAY_T_JUNCTION)).toBe(before);
    expect(sign.object.matrixWorld.toArray()).toEqual(matrixBefore);
  });
});
