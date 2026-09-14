import { BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, Vector3 } from 'three';
import { type DeepReadonly, type World } from '@ottie/contracts';

export interface SchematicScene {
  readonly root: Group;
  readonly laneCount: number;
  readonly anchorCount: number;
}

/**
 * Lane centrelines as polylines (X east, Y north, Z up — Three.js is given the same axes; the
 * camera module sets `up` to +Z) plus small markers at control-line and support-base anchors.
 * Purely schematic: no widths, no paint, no signs.
 */
export function buildSchematicScene(world: DeepReadonly<World>): SchematicScene {
  const root = new Group();
  root.name = `world:${world.id}`;

  const ground = new Mesh(new PlaneGeometry(200, 200), new MeshBasicMaterial({ color: 0x2b2f36 }));
  ground.position.set(0, 0, -0.01);
  ground.name = 'ground';
  root.add(ground);

  const withLane = new LineBasicMaterial({ color: 0xf2f2f2 });
  for (const lane of world.lanes) {
    const points = lane.centreline.map((p) => new Vector3(p.x, p.y, p.z));
    const line = new Line(new BufferGeometry().setFromPoints(points), withLane);
    line.name = `lane:${lane.id}`;
    root.add(line);
  }

  let anchorCount = 0;
  for (const anchor of world.anchors) {
    if (anchor.kind === 'control_line') {
      const points = anchor.polyline.map((p) => new Vector3(p.x, p.y, p.z + 0.01));
      const line = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: 0xffc857 }));
      line.name = `anchor:${anchor.id}`;
      root.add(line);
      anchorCount += 1;
    } else if (anchor.kind === 'support_base') {
      const marker = new Mesh(new SphereGeometry(0.25, 8, 8), new MeshBasicMaterial({ color: 0x6ec1e4 }));
      marker.position.set(anchor.position.x, anchor.position.y, anchor.position.z + 0.25);
      marker.name = `anchor:${anchor.id}`;
      root.add(marker);
      anchorCount += 1;
    }
  }

  return { root, laneCount: world.lanes.length, anchorCount };
}
