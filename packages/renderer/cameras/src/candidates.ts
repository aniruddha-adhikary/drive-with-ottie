import { Vector3 } from 'three';
import {
  type CameraPreset,
  type CameraPresetName,
  type DeepReadonly,
  type EvidenceRequirement,
  type Viewport,
  type World,
} from '@ottie/contracts';
import { type RenderedEntity, type WorldScene } from '@ottie/renderer-geometry';
import { focusOf, sampleEntity } from '@ottie/renderer-evidence';
import {
  WORLD_UP,
  azimuthOf,
  elevationOf,
  fitOrthographic,
  fitPerspective,
  makePreset,
  obliqueDirection,
  presetSpec,
  toVector,
  yawDirection,
} from './framing';

/**
 * Candidate cameras for one preset family. Every candidate is a presentation-only CameraPreset:
 * the authored one first, then bounded adjustments (re-centre, widen, swing the oblique azimuth,
 * back a detail camera off along the face's own front normal). Nothing here reads or writes
 * anything but camera numbers.
 */
export interface FitCandidate {
  readonly label: string;
  readonly preset: CameraPreset;
  /** False only for the untouched authored preset. */
  readonly adjusted: boolean;
}

/** Presentation-analysis tuning; not source facts. */
export const FIT_TUNING = Object.freeze({
  /** Enclosure margin (1 = touching the safe rectangle). */
  marginTight: 1.15,
  marginLoose: 1.4,
  /** Oblique azimuth swings tried when the authored direction leaves evidence hidden. */
  obliqueAzimuthStepsDeg: [30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180],
  obliqueElevationMinDeg: 25,
  obliqueElevationMaxDeg: 65,
  obliqueDefaultElevationDeg: 42,
  obliqueDefaultAzimuthDeg: -135,
  /** Vertical FOV bounds for the driver's-eye camera (radians). */
  approachFovMaxRad: (85 * Math.PI) / 180,
  approachFovWidenSteps: [1.15, 1.3, 1.45],
  approachAimBlend: [0.5, 1],
  approachEyeHeightM: 1.2,
  approachLookAheadM: 12,
  /** Detail camera: default FOV and how much of the safe rectangle the face should fill. */
  detailFovRad: (30 * Math.PI) / 180,
  detailMargins: [1.3, 1.7, 2.2],
  detailMinDistanceM: 0.6,
  planDistanceM: 80,
  obliqueDistanceM: 60,
} as const);

const DEG = Math.PI / 180;

/** World points that must appear on screen for the listed evidence in this view. */
export function framingPoints(
  scene: WorldScene,
  world: DeepReadonly<World>,
  requirements: readonly EvidenceRequirement[],
  evidenceIds: readonly string[],
  excludeEntityIds: ReadonlySet<string>,
): Vector3[] {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const wanted = new Set(evidenceIds);
  for (const id of evidenceIds)
    for (const partner of byId.get(id)?.coVisibleWith ?? []) wanted.add(partner);
  const points: Vector3[] = [];
  for (const id of wanted) {
    const requirement = byId.get(id);
    if (!requirement) continue;
    const focus = focusOf(scene, requirement.targetEntityIds);
    const ids = [...requirement.targetEntityIds, ...requirement.contextAnchorIds];
    for (const entityId of ids) {
      if (excludeEntityIds.has(entityId)) continue;
      const entity = scene.entities.get(entityId);
      if (!entity) continue;
      const samples = sampleEntity(entity, world, focus, scene);
      points.push(...samples.points, ...samples.extent);
    }
  }
  return points;
}

export function authoredPreset(
  world: DeepReadonly<World>,
  name: CameraPresetName,
): CameraPreset | null {
  const found = world.cameraPresets.find((c) => c.name === name);
  return found ? makePreset(presetSpec(found)) : null;
}

/** Evidence a synthesised preset may carry: every requirement that allows the view. */
export function allowedEvidenceIds(
  requirements: readonly EvidenceRequirement[],
  name: CameraPresetName,
): string[] {
  return requirements.filter((r) => r.allowedViews.includes(name)).map((r) => r.id);
}

export function egoActor(scene: WorldScene): Extract<RenderedEntity, { kind: 'actor' }> | null {
  for (const entity of scene.entities.values())
    if (entity.kind === 'actor' && entity.isEgo) return entity;
  return null;
}

function sceneCentre(scene: WorldScene): Vector3 {
  return scene.bounds.isEmpty() ? new Vector3() : scene.bounds.getCenter(new Vector3());
}

function planCandidates(
  base: CameraPreset | null,
  points: Vector3[],
  viewport: Viewport,
  evidenceIds: readonly string[],
  scene: WorldScene,
): FitCandidate[] {
  const out: FitCandidate[] = [];
  const up = base ? toVector(base.up) : new Vector3(0, 1, 0);
  const forward = base ? toVector(base.target).sub(toVector(base.eye)) : new Vector3(0, 0, -1);
  if (forward.lengthSq() < 1e-12) forward.set(0, 0, -1);
  const distance = base
    ? toVector(base.eye).distanceTo(toVector(base.target))
    : FIT_TUNING.planDistanceM;
  if (base) out.push({ label: 'authored', preset: base, adjusted: false });
  const framed = points.length > 0 ? points : [sceneCentre(scene)];
  for (const [i, margin] of [FIT_TUNING.marginTight, FIT_TUNING.marginLoose].entries()) {
    const fit = fitOrthographic(framed, forward, up, viewport, distance, margin);
    if (!fit) continue;
    out.push({
      label: i === 0 ? 'recentred' : 'recentred-loose',
      adjusted: true,
      preset: makePreset({
        name: 'plan',
        projection: 'orthographic',
        eye: fit.eye,
        target: fit.target,
        up,
        fovOrHalfHeight: fit.halfHeight,
        linkedEntityId: null,
        evidenceIds,
      }),
    });
  }
  return out;
}

function clampElevation(rad: number): number {
  return Math.min(
    FIT_TUNING.obliqueElevationMaxDeg * DEG,
    Math.max(FIT_TUNING.obliqueElevationMinDeg * DEG, rad),
  );
}

function obliqueCandidates(
  base: CameraPreset | null,
  points: Vector3[],
  viewport: Viewport,
  evidenceIds: readonly string[],
  scene: WorldScene,
): FitCandidate[] {
  const out: FitCandidate[] = [];
  const authoredForward = base ? toVector(base.target).sub(toVector(base.eye)) : null;
  const forward0 =
    authoredForward && authoredForward.lengthSq() > 1e-12
      ? authoredForward.normalize()
      : obliqueDirection(
          FIT_TUNING.obliqueDefaultAzimuthDeg * DEG,
          FIT_TUNING.obliqueDefaultElevationDeg * DEG,
        );
  const distance = base
    ? toVector(base.eye).distanceTo(toVector(base.target))
    : FIT_TUNING.obliqueDistanceM;
  if (base) out.push({ label: 'authored', preset: base, adjusted: false });
  const framed = points.length > 0 ? points : [sceneCentre(scene)];
  const push = (label: string, forward: Vector3, margin: number) => {
    const fit = fitOrthographic(framed, forward, WORLD_UP, viewport, distance, margin);
    if (!fit) return;
    out.push({
      label,
      adjusted: true,
      preset: makePreset({
        name: 'study_oblique',
        projection: 'orthographic',
        eye: fit.eye,
        target: fit.target,
        up: WORLD_UP,
        fovOrHalfHeight: fit.halfHeight,
        linkedEntityId: null,
        evidenceIds,
      }),
    });
  };
  const elevation = clampElevation(elevationOf(forward0));
  const azimuth = azimuthOf(forward0);
  const forwardClamped = obliqueDirection(azimuth, elevation);
  push('recentred', forwardClamped, FIT_TUNING.marginTight);
  push('recentred-loose', forwardClamped, FIT_TUNING.marginLoose);
  for (const step of FIT_TUNING.obliqueAzimuthStepsDeg) {
    push(
      `azimuth${step >= 0 ? '+' : ''}${String(step)}`,
      yawDirection(forwardClamped, step * DEG),
      FIT_TUNING.marginTight,
    );
  }
  return out;
}

function approachCandidates(
  base: CameraPreset | null,
  points: Vector3[],
  evidenceIds: readonly string[],
  scene: WorldScene,
): FitCandidate[] {
  const out: FitCandidate[] = [];
  let eye: Vector3;
  let target: Vector3;
  let fov: number;
  if (base) {
    out.push({ label: 'authored', preset: base, adjusted: false });
    eye = toVector(base.eye);
    target = toVector(base.target);
    fov = base.fovOrHalfHeight;
  } else {
    const ego = egoActor(scene);
    if (!ego) return out;
    const centre = ego.bounds.getCenter(new Vector3());
    eye = new Vector3(centre.x, centre.y, ego.bounds.min.z + FIT_TUNING.approachEyeHeightM);
    target = eye.clone().addScaledVector(ego.headingVector, FIT_TUNING.approachLookAheadM);
    fov = 60 * DEG;
  }
  const forward = target.clone().sub(eye);
  if (forward.lengthSq() < 1e-12) return out;
  const make = (label: string, aimTarget: Vector3, fovRad: number) => {
    out.push({
      label,
      adjusted: true,
      preset: makePreset({
        name: 'approach_ego',
        projection: 'perspective',
        eye,
        target: aimTarget,
        up: WORLD_UP,
        fovOrHalfHeight: Math.min(FIT_TUNING.approachFovMaxRad, fovRad),
        linkedEntityId: null,
        evidenceIds,
      }),
    });
  };
  if (!base) make('synthesised', target, fov);
  // Aim: swing the look direction (yaw only, pitch kept) toward the evidence centroid.
  const ahead = points.filter((p) => p.clone().sub(eye).dot(forward) > 0);
  if (ahead.length > 0) {
    const centroid = ahead.reduce((acc, p) => acc.add(p), new Vector3()).divideScalar(ahead.length);
    const wantYaw = Math.atan2(centroid.y - eye.y, centroid.x - eye.x);
    const haveYaw = Math.atan2(forward.y, forward.x);
    let delta = wantYaw - haveYaw;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    for (const blend of FIT_TUNING.approachAimBlend) {
      const aimed = eye.clone().add(yawDirection(forward, delta * blend));
      make(`aim${String(blend)}`, aimed, fov);
      for (const widen of FIT_TUNING.approachFovWidenSteps)
        make(`aim${String(blend)}-fov${String(widen)}`, aimed, fov * widen);
    }
  }
  for (const widen of FIT_TUNING.approachFovWidenSteps)
    make(`fov${String(widen)}`, target, fov * widen);
  return out;
}

/** Face-on framing of a sign face or signal head along its own front normal, at increasing stand-offs. */
export function detailCandidates(
  base: CameraPreset | null,
  entity: RenderedEntity | undefined,
  world: DeepReadonly<World>,
  scene: WorldScene,
  viewport: Viewport,
  evidenceIds: readonly string[],
): FitCandidate[] {
  const out: FitCandidate[] = [];
  if (base && (!entity || base.linkedEntityId === entity.id))
    out.push({ label: 'authored', preset: base, adjusted: false });
  if (!entity) return out;
  const samples = sampleEntity(entity, world, null, scene);
  const framed = [...samples.points, ...samples.extent];
  let forward: Vector3;
  let up: Vector3;
  if (entity.kind === 'sign_face' || entity.kind === 'signal_head') {
    forward = entity.frontNormal.clone().negate();
    up = entity.up.clone();
  } else if (entity.kind === 'actor') {
    forward = entity.headingVector.clone().negate();
    up = WORLD_UP;
  } else {
    forward = base
      ? toVector(base.target).sub(toVector(base.eye))
      : obliqueDirection(
          FIT_TUNING.obliqueDefaultAzimuthDeg * DEG,
          FIT_TUNING.obliqueDefaultElevationDeg * DEG,
        );
    up = WORLD_UP;
  }
  if (forward.lengthSq() < 1e-12) return out;
  const fov = base?.projection === 'perspective' ? base.fovOrHalfHeight : FIT_TUNING.detailFovRad;
  for (const margin of FIT_TUNING.detailMargins) {
    const fit = fitPerspective(
      framed,
      forward,
      up,
      viewport,
      fov,
      margin,
      FIT_TUNING.detailMinDistanceM,
    );
    if (!fit) continue;
    out.push({
      label: `face-on-${String(margin)}`,
      adjusted: true,
      preset: makePreset({
        name: 'entity_detail',
        projection: 'perspective',
        eye: fit.eye,
        target: fit.target,
        up,
        fovOrHalfHeight: fov,
        linkedEntityId: entity.id,
        evidenceIds,
      }),
    });
  }
  return out;
}

export interface CandidateRequest {
  readonly scene: WorldScene;
  readonly world: DeepReadonly<World>;
  readonly viewport: Viewport;
  readonly requirements: readonly EvidenceRequirement[];
  readonly name: CameraPresetName;
  readonly base: CameraPreset | null;
  readonly evidenceIds: readonly string[];
  /** entity_detail only: the entity the close-up enlarges. */
  readonly detailEntityId: string | null;
}

export function candidatesFor(request: CandidateRequest): FitCandidate[] {
  const { scene, world, viewport, requirements, name, base, evidenceIds } = request;
  const exclude = new Set<string>();
  if (name === 'approach_ego') {
    const ego = egoActor(scene);
    if (ego) exclude.add(ego.id);
  }
  const points = framingPoints(scene, world, requirements, evidenceIds, exclude);
  switch (name) {
    case 'plan':
      return planCandidates(base, points, viewport, evidenceIds, scene);
    case 'study_oblique':
      return obliqueCandidates(base, points, viewport, evidenceIds, scene);
    case 'approach_ego':
      return approachCandidates(base, points, evidenceIds, scene);
    case 'entity_detail':
      return detailCandidates(
        base,
        request.detailEntityId ? scene.entities.get(request.detailEntityId) : undefined,
        world,
        scene,
        viewport,
        evidenceIds,
      );
  }
}
