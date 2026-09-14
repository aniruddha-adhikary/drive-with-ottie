import { Box3, BufferAttribute, BufferGeometry, Mesh, type Vector3 } from 'three';
import { type Anchor, type Marking, type MarkingProfile, mmToMetres } from '@ottie/contracts';
import { type BuildContext } from './context';
import { headingVector, leftNormal, type PolylineWalker, polylineWalker } from './frames';
import { type PaintRow, type PaintSegment } from './types';

/**
 * Paint is laid out from the asset's MarkingProfile along the anchor polyline in metres:
 * `rows` parallel bands of `widthMm`, dashed as `paintedLengthMm` on / `clearGapMm` off unless
 * `continuous`, rows separated by `interRowClearGapMm` of clear road. For a control line the
 * anchor polyline is the upstream (approach-side) paint edge and rows stack downstream along the
 * anchor's approach heading; for longitudinal anchors the rows are centred on the polyline.
 */

/** Painted intervals [from, to] along arc length. Dashes start at `from` so the first mark is paint. */
export function dashIntervals(
  profile: MarkingProfile,
  from: number,
  to: number,
): readonly [number, number][] {
  if (to <= from) return [];
  if (profile.continuous || profile.paintedLengthMm === null || profile.clearGapMm === null)
    return [[from, to]];
  const painted = mmToMetres(profile.paintedLengthMm);
  const gap = mmToMetres(profile.clearGapMm);
  if (painted <= 0 || painted + gap <= 0) return [[from, to]];
  const intervals: [number, number][] = [];
  for (let s = from; s < to - 1e-9; s += painted + gap) {
    intervals.push([s, Math.min(s + painted, to)]);
  }
  return intervals;
}

/** Split an arc-length interval at interior polyline vertices so each piece is straight. */
function straightPieces(
  walker: PolylineWalker,
  from: number,
  to: number,
): readonly [number, number][] {
  const cuts = walker.cumulative.filter((c) => c > from + 1e-9 && c < to - 1e-9);
  const pieces: [number, number][] = [];
  let start = from;
  for (const cut of cuts) {
    pieces.push([start, cut]);
    start = cut;
  }
  pieces.push([start, to]);
  return pieces;
}

interface RowLayout {
  readonly offsetDirection: (direction: Vector3) => Vector3;
  readonly anchorEdge: 'upstream_edge' | 'centred';
  readonly fixedDirection: Vector3 | null;
}

function rowLayout(anchor: Anchor): RowLayout {
  if (anchor.kind === 'control_line') {
    const approach = headingVector(anchor.approachHeading);
    return {
      offsetDirection: () => approach.clone(),
      anchorEdge: 'upstream_edge',
      fixedDirection: approach,
    };
  }
  return {
    offsetDirection: (direction) => leftNormal(direction),
    anchorEdge: 'centred',
    fixedDirection: null,
  };
}

export function buildMarkings(ctx: BuildContext): void {
  for (const marking of ctx.world.markings) buildMarking(ctx, marking);
}

function buildMarking(ctx: BuildContext, marking: Marking): void {
  const resolved = ctx.resolveGeometry(marking.asset, 'marking', marking.id);
  if (!resolved) return;
  const anchor = ctx.world.anchors.find((a) => a.id === marking.anchorId);
  if (!anchor) {
    ctx.issue('missing_anchor', marking.id, `anchor ${marking.anchorId} not in world`);
    return;
  }
  if (anchor.kind === 'support_base') {
    ctx.issue('unsupported_geometry', marking.id, 'a marking cannot follow a support_base anchor');
    return;
  }
  const profile = resolved.geometry.marking;
  if (!profile.attachesTo.includes(anchor.kind)) {
    ctx.issue(
      'asset_geometry_mismatch',
      marking.id,
      `${resolved.asset.id} attaches to ${profile.attachesTo.join('/')}, anchor is ${anchor.kind}`,
    );
  }

  const walker = polylineWalker(anchor.polyline);
  const from = Math.max(0, marking.extentM?.from ?? 0);
  const to = Math.min(walker.lengthM, marking.extentM?.to ?? walker.lengthM);
  const layout = rowLayout(anchor);
  const width = mmToMetres(profile.widthMm);
  const interRow = profile.interRowClearGapMm === null ? 0 : mmToMetres(profile.interRowClearGapMm);
  const lift = ctx.schematic('paintLiftM');
  const rowCount = Math.max(1, profile.rows);

  const positions: number[] = [];
  const rows: PaintRow[] = [];
  const allPoints: Vector3[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const centreOffsetM =
      layout.anchorEdge === 'upstream_edge'
        ? width / 2 + r * (width + interRow)
        : (r - (rowCount - 1) / 2) * (width + interRow);
    const segments: PaintSegment[] = [];
    for (const [a, b] of dashIntervals(profile, from, to)) {
      for (const [pa, pb] of straightPieces(walker, a, b)) {
        const start = walker.at(pa);
        const end = walker.at(pb);
        const n = layout.offsetDirection(start.direction);
        const inner = n.clone().multiplyScalar(centreOffsetM - width / 2);
        const outer = n.clone().multiplyScalar(centreOffsetM + width / 2);
        const corners = [
          start.point.clone().add(inner),
          end.point.clone().add(inner),
          end.point.clone().add(outer),
          start.point.clone().add(outer),
        ];
        for (const c of corners) {
          c.z += lift;
          allPoints.push(c);
        }
        pushQuad(positions, corners);
        segments.push({
          from: start.point.clone().add(n.clone().multiplyScalar(centreOffsetM)),
          to: end.point.clone().add(n.clone().multiplyScalar(centreOffsetM)),
        });
      }
    }
    rows.push({ index: r, centreOffsetM, segments });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, ctx.materials.paint());
  mesh.name = `marking:${marking.id}`;
  const firstDirection = walker.at(from).direction;
  ctx.register({
    id: marking.id,
    kind: 'marking',
    layer: 'physical',
    object: mesh,
    bounds: new Box3().setFromPoints(allPoints),
    role: marking.role,
    rowWidthM: width,
    continuous: profile.continuous,
    offsetDirection: layout.fixedDirection ?? layout.offsetDirection(firstDirection),
    anchorEdge: layout.anchorEdge,
    rows,
  });
}

/** Two triangles for a planar quad given in order around its boundary; DoubleSide paint material. */
function pushQuad(positions: number[], [a, b, c, d]: readonly Vector3[]): void {
  if (!a || !b || !c || !d) return;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}
