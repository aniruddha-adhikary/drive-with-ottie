import {
  type BufferGeometry,
  type Material,
  Mesh,
  type Object3D,
  Raycaster,
  type Vector3,
} from 'three';
import { type WorldScene } from '@ottie/renderer-geometry';
import { type CameraFrame, type ProjectedPoint, towardViewer } from './projection';
import { EVIDENCE_THRESHOLDS } from './thresholds';

/**
 * Occlusion is measured by casting rays from the viewer to sample points against the physical
 * meshes R1 built (bodies, plates, housings, posts, road surfaces, ground). Overlay lines are not
 * meshes and never occlude; road paint is a few millimetres thick and can be hidden but cannot
 * hide anything, so markings are not occluders either. The scene graph is read, never modified.
 */
export interface OccluderIndex {
  readonly meshes: readonly Mesh[];
  /** Entity ID that owns each mesh; unowned physical meshes (ground) report their object name. */
  readonly ownerOf: ReadonlyMap<Mesh, string>;
}

const RAY_EPSILON_M = 1e-3;

type PhysicalMesh = Mesh<BufferGeometry, Material | Material[]>;

function isMesh(object: Object3D): object is PhysicalMesh {
  return object instanceof Mesh;
}

function collectMeshes(object: Object3D): PhysicalMesh[] {
  const out: PhysicalMesh[] = [];
  object.traverse((child) => {
    if (isMesh(child)) out.push(child);
  });
  return out;
}

export function indexOccluders(scene: WorldScene): OccluderIndex {
  const ownerOf = new Map<Mesh, string>();
  const paint = new Set<Mesh>();
  for (const entity of scene.entities.values()) {
    if (entity.layer !== 'physical') continue;
    for (const mesh of collectMeshes(entity.object)) {
      if (entity.kind === 'marking') paint.add(mesh);
      else ownerOf.set(mesh, entity.id);
    }
  }
  for (const mesh of collectMeshes(scene.root)) {
    if (!ownerOf.has(mesh) && !paint.has(mesh))
      ownerOf.set(mesh, mesh.name || 'unnamed-physical-mesh');
  }
  return { meshes: [...ownerOf.keys()], ownerOf };
}

export interface OcclusionMeasure {
  /** Fraction of tested samples with physical geometry between them and the viewer. */
  readonly fraction: number;
  readonly occluded: number;
  readonly tested: number;
  /** Owners of the geometry that blocked at least one sample. */
  readonly occluderIds: readonly string[];
  /** Per-sample result aligned with the input samples (false for samples not tested). */
  readonly perSample: readonly boolean[];
}

/**
 * Test which in-front samples are hidden behind physical geometry other than `excludeIds`
 * (the target itself, its support, and — in the driver's own view — the vehicle the camera sits in).
 */
export function measureOcclusion(
  index: OccluderIndex,
  frame: CameraFrame,
  samples: readonly ProjectedPoint[],
  excludeIds: ReadonlySet<string>,
): OcclusionMeasure {
  const candidates = index.meshes.filter((mesh) => !excludeIds.has(index.ownerOf.get(mesh) ?? ''));
  const raycaster = new Raycaster();
  const occluderIds = new Set<string>();
  let occluded = 0;
  let tested = 0;
  const perSample = samples.map((sample) => {
    if (!sample.inFront) return false;
    tested += 1;
    const toward = towardViewer(frame, sample.world);
    let origin: Vector3;
    let distance: number;
    if (frame.orthographic) {
      distance = EVIDENCE_THRESHOLDS.orthographicRayStartM;
      origin = sample.world.clone().addScaledVector(toward, distance);
    } else {
      origin = frame.eye.clone();
      distance = origin.distanceTo(sample.world);
    }
    raycaster.set(origin, toward.clone().negate());
    raycaster.near = 0;
    raycaster.far = Math.max(0, distance - RAY_EPSILON_M);
    const hits = raycaster.intersectObjects(candidates, false);
    const hit = hits[0];
    if (!hit) return false;
    occluded += 1;
    if (isMesh(hit.object)) occluderIds.add(index.ownerOf.get(hit.object) ?? hit.object.name);
    return true;
  });
  return {
    fraction: tested === 0 ? 0 : occluded / tested,
    occluded,
    tested,
    occluderIds: [...occluderIds].sort(),
    perSample,
  };
}

/** Physical entities whose world bounds contain the camera eye. */
export function entitiesContaining(scene: WorldScene, point: Vector3): readonly string[] {
  const ids: string[] = [];
  for (const entity of scene.entities.values()) {
    if (entity.layer === 'physical' && entity.bounds.containsPoint(point)) ids.push(entity.id);
  }
  return ids.sort();
}
