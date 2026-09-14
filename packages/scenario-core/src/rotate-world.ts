import { type Anchor, type CameraPreset, type Pose, type SignFace, type SignalHead, type UnitVec3, type World } from '@ottie/contracts';
import { type QuarterTurns, rotateHeading, rotatePolyline, rotateUnit, rotateVec3 } from './geometry';

/**
 * Rotates every world-space quantity of a world by whole quarter turns about +Z. Rotation is the
 * only coordinate transform the generator applies to change an approach direction: it preserves
 * handedness (LEFT traffic), turn labels, priorities, conflicts, IDs and road-frame positions.
 * Mirroring is never used because it would silently flip left/right turns and traffic side.
 *
 * Camera `up` vectors are presentation and are left untouched so plan views stay north-up.
 */
export function rotateWorldQuarterTurns(world: World, turns: QuarterTurns): World {
  if (turns === 0) return world;
  const pose = (p: Pose): Pose => ({ position: rotateVec3(p.position, turns), yaw: rotateHeading(p.yaw, turns) });
  const unit = (u: UnitVec3): UnitVec3 => rotateUnit(u, turns);
  const anchor = (a: Anchor): Anchor => {
    switch (a.kind) {
      case 'lane_boundary':
      case 'movement_path':
      case 'crossing_bound':
      case 'roadside_edge':
        return { ...a, polyline: rotatePolyline(a.polyline, turns) };
      case 'control_line':
        return { ...a, polyline: rotatePolyline(a.polyline, turns), approachHeading: rotateHeading(a.approachHeading, turns) };
      case 'support_base':
        return { ...a, position: rotateVec3(a.position, turns) };
    }
  };
  const face = <T extends SignFace | SignalHead>(f: T): T => ({
    ...f,
    pose: pose(f.pose),
    frontNormal: unit(f.frontNormal),
    up: unit(f.up),
    intendedApproach: { ...f.intendedApproach, heading: rotateHeading(f.intendedApproach.heading, turns) },
  });
  const camera = (c: CameraPreset): CameraPreset => ({ ...c, eye: rotateVec3(c.eye, turns), target: rotateVec3(c.target, turns) });

  return {
    ...world,
    roads: world.roads.map((r) => ({ ...r, centreline: rotatePolyline(r.centreline, turns) })),
    lanes: world.lanes.map((l) => ({ ...l, centreline: rotatePolyline(l.centreline, turns), heading: rotateHeading(l.heading, turns) })),
    movements: world.movements.map((m) => ({ ...m, path: rotatePolyline(m.path, turns) })),
    anchors: world.anchors.map(anchor),
    supports: world.supports.map((s) => ({ ...s, pose: pose(s.pose) })),
    signFaces: world.signFaces.map(face),
    signalHeads: world.signalHeads.map(face),
    actors: world.actors.map((a) => ({ ...a, pose: pose(a.pose) })),
    cameraPresets: world.cameraPresets.map(camera),
  };
}
