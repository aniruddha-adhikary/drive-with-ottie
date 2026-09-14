import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  type LineBasicMaterial,
  LineLoop,
  Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import { type Anchor, type Lane, type Movement, type Road, type Vec3 } from '@ottie/contracts';
import { type BuildContext } from './context';
import { headingVector, leftNormal, pairwise, polylineWalker, toVector3 } from './frames';
import { ROAD_MATERIAL_COLOURS } from './materials';

/**
 * Road surfaces are flat ribbons of the authored `widthM` along the centreline; lanes, movements
 * and anchors get invisible overlay geometry so evidence/camera consumers can query their bounds.
 * No lane paint is drawn here: paint only exists where the world lists a Marking.
 */

/** Left/right edge points of a ribbon of `widthM` along `polyline`. */
export function ribbonEdges(
  polyline: readonly Vec3[],
  widthM: number,
): { left: Vector3[]; right: Vector3[] } {
  const points = polyline.map(toVector3);
  const left: Vector3[] = [];
  const right: Vector3[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const normal = new Vector3();
    if (prev) normal.add(leftNormal(p.clone().sub(prev)));
    if (next) normal.add(leftNormal(next.clone().sub(p)));
    if (normal.lengthSq() === 0) normal.set(0, 1, 0);
    normal.normalize().multiplyScalar(widthM / 2);
    left.push(p.clone().add(normal));
    right.push(p.clone().sub(normal));
  });
  return { left, right };
}

export function ribbonGeometry(polyline: readonly Vec3[], widthM: number, z = 0): BufferGeometry {
  const { left, right } = ribbonEdges(polyline, widthM);
  const positions: number[] = [];
  const rightPairs = pairwise(right);
  pairwise(left).forEach(([l0, l1], i) => {
    const rightPair = rightPairs[i];
    if (!rightPair) return;
    const [r0, r1] = rightPair;
    // Two CCW triangles (viewed from +Z) per segment.
    positions.push(r0.x, r0.y, r0.z + z, r1.x, r1.y, r1.z + z, l1.x, l1.y, l1.z + z);
    positions.push(r0.x, r0.y, r0.z + z, l1.x, l1.y, l1.z + z, l0.x, l0.y, l0.z + z);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildRoads(ctx: BuildContext): void {
  for (const road of ctx.world.roads) buildRoad(ctx, road);
}

function buildRoad(ctx: BuildContext, road: Road): void {
  const group = new Group();
  group.name = `road:${road.id}`;
  const surface = new Mesh(
    ribbonGeometry(road.centreline, road.widthM),
    ctx.materials.lit('road.surface'),
  );
  surface.name = `road-surface:${road.id}`;
  group.add(surface);
  const edges = ribbonEdges(road.centreline, road.widthM);
  ctx.register({
    id: road.id,
    kind: 'road',
    layer: 'physical',
    object: group,
    bounds: new Box3().setFromPoints([...edges.left, ...edges.right]),
    widthM: road.widthM,
    lengthM: polylineWalker(road.centreline).lengthM,
  });
}

/** Verge plane under everything, sized from the road bounds plus a schematic margin. */
export function buildGround(ctx: BuildContext): void {
  const bounds = new Box3();
  for (const entity of ctx.entities.values())
    if (entity.kind === 'road') bounds.union(entity.bounds);
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(new Vector3(), new Vector3(10, 10, 0));
  const margin = ctx.schematic('groundMarginM');
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  const ground = new Mesh(
    new PlaneGeometry(size.x + 2 * margin, size.y + 2 * margin),
    ctx.materials.lit('road.verge'),
  );
  ground.position.set(centre.x, centre.y, bounds.min.z - 0.02);
  ground.name = 'ground';
  ctx.physical.add(ground);
}

function guideMaterial(ctx: BuildContext): LineBasicMaterial {
  return ctx.materials.unlitLine(ROAD_MATERIAL_COLOURS['overlay.guide']);
}

export function buildOverlays(ctx: BuildContext): void {
  for (const lane of ctx.world.lanes) buildLaneOverlay(ctx, lane);
  for (const movement of ctx.world.movements) buildMovementOverlay(ctx, movement);
  for (const anchor of ctx.world.anchors) buildAnchorOverlay(ctx, anchor);
}

function buildLaneOverlay(ctx: BuildContext, lane: Lane): void {
  const edges = ribbonEdges(lane.centreline, lane.widthM);
  const loop = [...edges.left, ...edges.right.reverse()];
  const line = new LineLoop(new BufferGeometry().setFromPoints(loop), guideMaterial(ctx));
  line.name = `lane:${lane.id}`;
  ctx.register(
    {
      id: lane.id,
      kind: 'lane',
      layer: 'overlay',
      object: line,
      bounds: new Box3().setFromPoints(loop),
      widthM: lane.widthM,
      headingVector: headingVector(lane.heading),
    },
    ctx.overlay,
  );
}

function buildMovementOverlay(ctx: BuildContext, movement: Movement): void {
  const points = movement.path.map(toVector3);
  const line = new Line(new BufferGeometry().setFromPoints(points), guideMaterial(ctx));
  line.name = `movement:${movement.id}`;
  ctx.register(
    {
      id: movement.id,
      kind: 'movement',
      layer: 'overlay',
      object: line,
      bounds: new Box3().setFromPoints(points),
    },
    ctx.overlay,
  );
}

function buildAnchorOverlay(ctx: BuildContext, anchor: Anchor): void {
  const points =
    anchor.kind === 'support_base' ? [toVector3(anchor.position)] : anchor.polyline.map(toVector3);
  const line = new Line(new BufferGeometry().setFromPoints(points), guideMaterial(ctx));
  line.name = `anchor:${anchor.id}`;
  const bounds = new Box3().setFromPoints(points);
  if (anchor.kind === 'support_base') bounds.expandByScalar(0.05);
  ctx.register(
    {
      id: anchor.id,
      kind: 'anchor',
      layer: 'overlay',
      object: line,
      bounds,
      anchorKind: anchor.kind,
    },
    ctx.overlay,
  );
}
