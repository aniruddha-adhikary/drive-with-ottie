import {
  Box3,
  BoxGeometry,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  type AspectState,
  type Measurement,
  type SignalAspectShape,
  type SignalHead,
  mmToMetres,
} from '@ottie/contracts';
import { type BuildContext } from './context';
import { frameBasis } from './frames';
import { ROAD_MATERIAL_COLOURS, lensColour } from './materials';
import { placeMountedPart } from './mounting';
import { type MeasurementSource, type RenderedLens } from './types';

/**
 * A signal head is a housing with one lens per aspect slot, laid out by the asset profile's
 * column/row grid (row 0 = top, columns left→right in the observer's view) at the source lens
 * spacing, with the lowest lens centre at the source height above ground. Each lens shows the
 * state the head's controller records for that slot — lit, dark or flashing — and nothing else:
 * the renderer never combines aspects into a junction "colour" or infers what a movement may do.
 * Arrow glyphs point in the asset frame (right arrow → observer's right), never mirrored.
 */

export function buildSignalHeads(ctx: BuildContext): void {
  for (const head of ctx.world.signalHeads) buildSignalHead(ctx, head);
}

/** Actual value when the source gives one, else the statutory minimum, else the maximum. */
export function pickMeasurement(
  measurement: Measurement,
): { metres: number; source: MeasurementSource } | null {
  if (measurement.valueMm !== null)
    return { metres: mmToMetres(measurement.valueMm), source: 'value' };
  if (measurement.minimumMm !== undefined && measurement.minimumMm !== null)
    return { metres: mmToMetres(measurement.minimumMm), source: 'minimum_bound' };
  if (measurement.maximumMm !== undefined && measurement.maximumMm !== null)
    return { metres: mmToMetres(measurement.maximumMm), source: 'maximum_bound' };
  return null;
}

function buildSignalHead(ctx: BuildContext, head: SignalHead): void {
  const resolved = ctx.resolveGeometry(head.asset, 'signal_head', head.id);
  if (!resolved) return;
  const profile = resolved.geometry.head;
  const placement = placeMountedPart(ctx, head, resolved.asset, profile.front, profile.up);

  const diameter = pickMeasurement(profile.lensDiameterMm);
  const spacing = pickMeasurement(profile.adjacentLensCentreDistanceMm);
  const lowest = pickMeasurement(profile.lowestLensCentreAboveGroundMm);
  if (!diameter || !spacing || !lowest) {
    ctx.issue(
      'unknown_dimension',
      head.id,
      `${resolved.asset.id} lacks lens diameter, spacing or mounting height; head not drawn`,
    );
    return;
  }

  const controller = ctx.world.signalControllers.find((c) => c.id === head.controllerId);
  if (!controller)
    ctx.issue(
      'missing_controller',
      head.id,
      `controller ${head.controllerId} not in world; all lenses drawn dark`,
    );

  const rows = profile.aspects.map((a) => a.row);
  const columns = profile.aspects.map((a) => a.column);
  const maxRow = Math.max(...rows);
  const minColumn = Math.min(...columns);
  const maxColumn = Math.max(...columns);
  const columnCentre = (minColumn + maxColumn) / 2;

  // Local frame: origin at the part attachment (back centre); +X right, +Y up, +Z front.
  const upWorld = placement.facing.up;
  const originHeight = placement.origin.z - placement.groundZ;
  const verticalUp = Math.abs(upWorld.z) > 0.999;
  if (!verticalUp)
    ctx.issue(
      'unsupported_geometry',
      head.id,
      'head up axis is not vertical; lowest-lens height measured along the head axis instead',
    );
  const lowestOffset = verticalUp ? lowest.metres - originHeight : 0;

  const standoff = placement.support ? placement.support.radiusM : 0;
  const housingDepth = ctx.schematic('housingDepthM');
  const margin = ctx.schematic('housingMarginM');
  const lensLift = ctx.schematic('lensLiftM');
  const basis = frameBasis(placement.localFrame);

  const group = new Group();
  group.name = `signal-head:${head.id}`;
  group.applyMatrix4(placement.matrix);

  const housingWidth = (maxColumn - minColumn) * spacing.metres + diameter.metres + 2 * margin;
  const housingHeight = maxRow * spacing.metres + diameter.metres + 2 * margin;
  const housingCentreUp = lowestOffset + (maxRow * spacing.metres) / 2;
  const housing = new BoxGeometry(housingWidth, housingHeight, housingDepth);
  housing.applyMatrix4(
    new Matrix4().multiplyMatrices(
      basis,
      new Matrix4().makeTranslation(0, housingCentreUp, standoff + housingDepth / 2),
    ),
  );
  const housingMesh = new Mesh(housing, ctx.materials.lit('roadControl.signal.housing'));
  housingMesh.name = `signal-housing:${head.id}`;
  group.add(housingMesh);

  const lensDepth = standoff + housingDepth + lensLift;
  const lenses: RenderedLens[] = [];
  const ordered = [...profile.aspects].sort((a, b) => a.column - b.column || a.row - b.row);
  for (const slot of ordered) {
    const worldAspect = head.aspects.find((a) => a.slot === slot.slot);
    if (!worldAspect)
      ctx.issue(
        'asset_geometry_mismatch',
        head.id,
        `asset slot '${slot.slot}' has no aspect on the head; drawn dark`,
      );
    else if (worldAspect.colour !== slot.colour || worldAspect.shape !== slot.shape) {
      ctx.issue(
        'asset_geometry_mismatch',
        head.id,
        `slot '${slot.slot}' is ${worldAspect.colour} ${worldAspect.shape} on the head but ${slot.colour} ${slot.shape} in the asset`,
      );
    }
    const entry = controller?.aspectStates.find(
      (s) => s.headId === head.id && s.slot === slot.slot,
    );
    const state: AspectState | null = entry ? entry.state : null;
    if (controller && !entry)
      ctx.issue(
        'missing_aspect_state',
        head.id,
        `controller ${controller.id} has no state for slot '${slot.slot}'; drawn dark`,
      );

    const u = (slot.column - columnCentre) * spacing.metres;
    const v = lowestOffset + (maxRow - slot.row) * spacing.metres;
    const lensMatrix = new Matrix4().multiplyMatrices(
      basis,
      new Matrix4().makeTranslation(u, v, lensDepth),
    );

    const isGlyph = slot.shape !== 'circular';
    const discColour = isGlyph
      ? ROAD_MATERIAL_COLOURS['roadControl.signal.lensDark']
      : lensColour(slot.colour, state);
    const disc = new Mesh(
      new CircleGeometry(diameter.metres / 2, 32).applyMatrix4(lensMatrix),
      ctx.materials.unlit(discColour),
    );
    disc.name = `signal-lens:${head.id}:${slot.slot}`;
    disc.userData = { slot: slot.slot, state: state ?? 'unknown' };
    group.add(disc);

    let glyphDirection: Vector3 | null = null;
    if (isGlyph) {
      const glyph = glyphShape(slot.shape, diameter.metres * ctx.schematic('arrowGlyphFraction'));
      if (glyph) {
        const glyphMatrix = new Matrix4().multiplyMatrices(
          basis,
          new Matrix4().makeTranslation(u, v, lensDepth + lensLift),
        );
        const mesh = new Mesh(
          new ShapeGeometry(glyph.shape).applyMatrix4(glyphMatrix),
          ctx.materials.unlit(lensColour(slot.colour, state)),
        );
        mesh.name = `signal-glyph:${head.id}:${slot.slot}`;
        group.add(mesh);
        glyphDirection = glyph.direction
          ? glyph.direction
              .clone()
              .applyMatrix4(new Matrix4().extractRotation(basis))
              .applyQuaternion(placement.quaternion)
          : null;
      }
    }

    lenses.push({
      slot: slot.slot,
      colour: slot.colour,
      shape: slot.shape,
      row: slot.row,
      column: slot.column,
      state,
      centre: new Vector3(u, v, lensDepth).applyMatrix4(basis).applyMatrix4(placement.matrix),
      diameterM: diameter.metres,
      controlsMovementIds: worldAspect ? worldAspect.controlsMovementIds : [],
      glyphDirection,
    });
  }

  group.updateMatrixWorld(true);
  ctx.register({
    id: head.id,
    kind: 'signal_head',
    layer: 'physical',
    object: group,
    bounds: new Box3().setFromObject(group, true),
    ...placement.facing,
    arrangement: profile.arrangement,
    mount: placement.mount,
    controllerId: head.controllerId,
    controllerFound: controller !== undefined,
    lenses,
    lensDiameterSource: diameter.source,
    lensSpacingSource: spacing.source,
    lowestLensCentreAboveGroundM: lowest.metres,
  });
}

/** Glyph outlines in the lens plane (x right, y up), `span` = tip-to-tail length. */
export function glyphShape(
  shape: SignalAspectShape,
  span: number,
): { shape: Shape; direction: Vector3 | null } | null {
  const half = span / 2;
  const shaft = span * 0.16;
  const headLength = span * 0.4;
  const headHalf = span * 0.3;
  if (shape === 'letter_b') {
    const b = new Shape();
    b.moveTo(-half * 0.5, -half)
      .lineTo(half * 0.5, -half)
      .lineTo(half * 0.5, half)
      .lineTo(-half * 0.5, half)
      .closePath();
    return { shape: b, direction: null };
  }
  // Arrow pointing +x; rotate for other directions.
  const arrow = new Shape();
  arrow
    .moveTo(-half, -shaft)
    .lineTo(half - headLength, -shaft)
    .lineTo(half - headLength, -headHalf)
    .lineTo(half, 0)
    .lineTo(half - headLength, headHalf)
    .lineTo(half - headLength, shaft)
    .lineTo(-half, shaft)
    .closePath();
  const angle = shape === 'arrow_right' ? 0 : shape === 'arrow_straight' ? Math.PI / 2 : Math.PI;
  const pivot = new Vector2();
  const rotated = new Shape(arrow.getPoints().map((p) => p.clone().rotateAround(pivot, angle)));
  return { shape: rotated, direction: new Vector3(Math.cos(angle), Math.sin(angle), 0) };
}
