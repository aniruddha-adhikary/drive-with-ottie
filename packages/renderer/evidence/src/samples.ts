import { Box3, Vector3 } from 'three';
import { type DeepReadonly, type Vec3, type World } from '@ottie/contracts';
import {
  type RenderedEntity,
  type RenderedEntityKind,
  type RenderedSignFace,
  type RenderedSignalHead,
  type SceneLayer,
  type WorldScene,
} from '@ottie/renderer-geometry';
import { EVIDENCE_THRESHOLDS } from './thresholds';

/**
 * World-space sample points that stand for an entity when judging whether it is on screen and
 * unobstructed. Physical entities are sampled from the geometry R1 actually built (panel frame,
 * lens centres, body bounds, paint rows); lanes, roads, movements and anchors are sampled from the
 * World polylines the overlay layer was drawn from. Nothing here moves or re-orients geometry.
 */
export interface EntitySamples {
  readonly entityId: string;
  readonly kind: RenderedEntityKind;
  readonly layer: SceneLayer;
  /** Points whose on-screen, in-front and unobstructed state is measured. */
  readonly points: readonly Vector3[];
  /** Linear features (lane/road/movement) are judged by visible length, not by fraction. */
  readonly linear: boolean;
  /** Arc-length between consecutive `points` for linear features; 0 otherwise. */
  readonly spacingM: number;
  /** Total judged length of a linear feature in metres; 0 otherwise. */
  readonly judgedLengthM: number;
  /** Corners of the readable extent used for projected-size measurement. */
  readonly extent: readonly Vector3[];
  /** Whether projected size is the smaller (readable face) or larger (recognisable object) screen dimension. */
  readonly sizeMeasure: 'min_dimension' | 'max_dimension';
}

const T = EVIDENCE_THRESHOLDS;

function toVec(p: Vec3): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}

export function boxCorners(box: Box3): Vector3[] {
  const { min, max } = box;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, max.y, max.z),
  ];
}

function boxFaceCentres(box: Box3): Vector3[] {
  const c = box.getCenter(new Vector3());
  const { min, max } = box;
  return [
    new Vector3(min.x, c.y, c.z),
    new Vector3(max.x, c.y, c.z),
    new Vector3(c.x, min.y, c.z),
    new Vector3(c.x, max.y, c.z),
    new Vector3(c.x, c.y, min.z),
    new Vector3(c.x, c.y, max.z),
  ];
}

/** Panel corners of a face in the plane it was actually built in. */
export function facePanelCorners(face: RenderedSignFace): Vector3[] {
  const halfRight = face.right.clone().multiplyScalar(face.widthM / 2);
  const halfUp = face.up.clone().multiplyScalar(face.heightM / 2);
  return [
    face.panelCentre.clone().sub(halfRight).sub(halfUp),
    face.panelCentre.clone().add(halfRight).sub(halfUp),
    face.panelCentre.clone().add(halfRight).add(halfUp),
    face.panelCentre.clone().sub(halfRight).add(halfUp),
  ];
}

function faceSamples(face: RenderedSignFace): Vector3[] {
  const n: number = T.faceSampleGrid;
  const offset = face.frontNormal.clone().multiplyScalar(T.surfaceOffsetM);
  const points: Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const u = n <= 1 ? 0 : -0.8 + (1.6 * i) / (n - 1);
      const v = n <= 1 ? 0 : -0.8 + (1.6 * j) / (n - 1);
      points.push(
        face.panelCentre
          .clone()
          .addScaledVector(face.right, (u * face.widthM) / 2)
          .addScaledVector(face.up, (v * face.heightM) / 2)
          .add(offset),
      );
    }
  }
  return points;
}

/** Lens centre plus four ring points, just in front of each lens disc. */
export function lensSamples(head: RenderedSignalHead): Vector3[] {
  const offset = head.frontNormal.clone().multiplyScalar(T.surfaceOffsetM);
  const points: Vector3[] = [];
  for (const lens of head.lenses) {
    const r = lens.diameterM * 0.3;
    const c = lens.centre.clone().add(offset);
    points.push(
      c.clone(),
      c.clone().addScaledVector(head.right, r),
      c.clone().addScaledVector(head.right, -r),
      c.clone().addScaledVector(head.up, r),
      c.clone().addScaledVector(head.up, -r),
    );
  }
  return points;
}

/** Points every `spacing` metres along a polyline (always including both ends). */
export function resamplePolyline(polyline: readonly Vec3[], spacing: number): Vector3[] {
  const points = polyline.map(toVec);
  const first = points[0];
  if (!first) return [];
  if (points.length === 1) return [first];
  const out: Vector3[] = [first.clone()];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const length = a.distanceTo(b);
    if (length === 0) continue;
    let s = spacing - carry;
    while (s < length) {
      out.push(a.clone().lerp(b, s / length));
      s += spacing;
    }
    carry = length - (s - spacing);
  }
  const last = points[points.length - 1];
  if (last && out[out.length - 1]?.distanceTo(last) !== 0) out.push(last.clone());
  return out;
}

function polylineLength(polyline: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    if (a && b) total += toVec(a).distanceTo(toVec(b));
  }
  return total;
}

function lift(points: readonly Vector3[], dz: number): Vector3[] {
  return points.map((p) => new Vector3(p.x, p.y, p.z + dz));
}

/** Left-hand horizontal normal of a direction. */
function leftNormal(direction: Vector3): Vector3 {
  return new Vector3(-direction.y, direction.x, 0).normalize();
}

function linearSamples(
  entity: RenderedEntity,
  polyline: readonly Vec3[],
  widthM: number,
  focus: Vector3 | null,
): EntitySamples {
  const all = resamplePolyline(polyline, T.linearSampleSpacingM);
  let kept = all;
  if (focus) {
    const within = all.filter((p) => p.distanceTo(focus) <= T.linearFocusRadiusM);
    if (within.length >= 2) kept = within;
    else {
      kept = [...all]
        .sort((a, b) => a.distanceTo(focus) - b.distanceTo(focus))
        .slice(0, Math.min(all.length, 2));
    }
  }
  const spacing = T.linearSampleSpacingM;
  const judged = focus ? Math.max(0, kept.length - 1) * spacing : polylineLength(polyline);
  const extent: Vector3[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const p = kept[i];
    const q = kept[i + 1] ?? kept[i - 1];
    if (!p) continue;
    if (widthM > 0 && q) {
      const dir = q.clone().sub(p);
      const n = dir.lengthSq() > 0 ? leftNormal(dir.normalize()) : new Vector3(0, 1, 0);
      extent.push(
        p.clone().addScaledVector(n, widthM / 2),
        p.clone().addScaledVector(n, -widthM / 2),
      );
    } else extent.push(p.clone());
  }
  return {
    entityId: entity.id,
    kind: entity.kind,
    layer: entity.layer,
    points: lift(kept, T.surfaceOffsetM),
    linear: true,
    spacingM: spacing,
    judgedLengthM: judged,
    extent: lift(extent, T.surfaceOffsetM),
    sizeMeasure: 'max_dimension',
  };
}

function solid(
  entity: RenderedEntity,
  points: readonly Vector3[],
  extent: readonly Vector3[],
  sizeMeasure: EntitySamples['sizeMeasure'],
): EntitySamples {
  return {
    entityId: entity.id,
    kind: entity.kind,
    layer: entity.layer,
    points,
    linear: false,
    spacingM: 0,
    judgedLengthM: 0,
    extent,
    sizeMeasure,
  };
}

/**
 * Sample a rendered entity. `focus` (usually the centre of the requirement's physical targets)
 * limits lanes/roads/movements to the stretch that matters for the question.
 */
export function sampleEntity(
  entity: RenderedEntity,
  world: DeepReadonly<World>,
  focus: Vector3 | null,
  scene?: WorldScene,
): EntitySamples {
  switch (entity.kind) {
    case 'sign_face':
      return solid(entity, faceSamples(entity), facePanelCorners(entity), 'min_dimension');
    case 'signal_head':
      return solid(entity, lensSamples(entity), boxCorners(entity.bounds), 'min_dimension');
    case 'actor':
      return solid(
        entity,
        [...boxCorners(entity.bounds), ...boxFaceCentres(entity.bounds), entity.front.clone()],
        boxCorners(entity.bounds),
        'max_dimension',
      );
    case 'support':
      return solid(
        entity,
        [
          entity.base.clone().add(new Vector3(0, 0, T.surfaceOffsetM)),
          entity.base.clone().lerp(entity.top, 0.5),
          entity.top.clone(),
        ],
        boxCorners(entity.bounds),
        'max_dimension',
      );
    case 'marking': {
      const points: Vector3[] = [];
      for (const row of entity.rows)
        for (const seg of row.segments)
          points.push(seg.from.clone(), seg.from.clone().lerp(seg.to, 0.5), seg.to.clone());
      return solid(
        entity,
        lift(points, T.surfaceOffsetM),
        boxCorners(entity.bounds),
        'max_dimension',
      );
    }
    case 'lane': {
      const lane = world.lanes.find((l) => l.id === entity.id);
      return linearSamples(entity, lane ? lane.centreline : [], lane ? lane.widthM : 0, focus);
    }
    case 'road': {
      const road = world.roads.find((r) => r.id === entity.id);
      return linearSamples(entity, road ? road.centreline : [], road ? road.widthM : 0, focus);
    }
    case 'movement': {
      const movement = world.movements.find((m) => m.id === entity.id);
      return linearSamples(entity, movement ? movement.path : [], 0, focus);
    }
    case 'anchor': {
      const anchor = world.anchors.find((a) => a.id === entity.id);
      if (!anchor) {
        return solid(entity, boxCorners(entity.bounds), boxCorners(entity.bounds), 'max_dimension');
      }
      const points =
        anchor.kind === 'support_base'
          ? supportFootSamples(toVec(anchor.position), scene)
          : resamplePolyline(anchor.polyline, Math.max(0.5, polylineLength(anchor.polyline) / 4));
      return solid(
        entity,
        lift(points, T.surfaceOffsetM),
        lift(points, T.surfaceOffsetM),
        'max_dimension',
      );
    }
  }
}

/**
 * Where a post meets the ground: four points on the surface just outside the shaft of any support
 * standing on the anchor, so the foot can be judged without the shaft itself counting as a blocker.
 */
function supportFootSamples(base: Vector3, scene: WorldScene | undefined): Vector3[] {
  let radius = 0;
  if (scene) {
    for (const entity of scene.entities.values()) {
      if (entity.kind === 'support' && entity.base.distanceTo(base) < T.surfaceOffsetM) {
        radius = Math.max(radius, entity.radiusM);
      }
    }
  }
  if (radius === 0) return [base.clone()];
  const r = radius + T.surfaceOffsetM;
  return [
    base.clone().add(new Vector3(r, 0, 0)),
    base.clone().add(new Vector3(-r, 0, 0)),
    base.clone().add(new Vector3(0, r, 0)),
    base.clone().add(new Vector3(0, -r, 0)),
  ];
}

/** Centre of the physical targets of a requirement; null when it has none. */
export function focusOf(scene: WorldScene, targetIds: readonly string[]): Vector3 | null {
  const box = new Box3();
  for (const id of targetIds) {
    const entity = scene.entities.get(id);
    if (entity?.layer === 'physical') box.union(entity.bounds);
  }
  return box.isEmpty() ? null : box.getCenter(new Vector3());
}
