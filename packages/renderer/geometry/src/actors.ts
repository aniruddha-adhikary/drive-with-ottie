import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { type Actor, mmToMetres } from '@ottie/contracts';
import { type BuildContext } from './context';
import { poseMatrix, poseQuaternion } from './frames';
import { ROAD_MATERIAL_COLOURS, type RoadMaterialName, SIGNAL_LENS_COLOURS } from './materials';

/**
 * Vehicles are simple bodies with the authored length, width and height, placed by pose. The
 * actor's reference point is `frontOffsetM` behind the front bumper, so the body spans local
 * x ∈ [frontOffset − length, frontOffset]; heading 0 is +X, +Y is the vehicle's left. Indicators
 * use the amber signal colour so a lit indicator reads as an indicator, not decoration.
 */

export function buildActors(ctx: BuildContext): void {
  for (const actor of ctx.world.actors) buildActor(ctx, actor);
}

function bodyColour(actor: Actor): RoadMaterialName {
  if (actor.isEgo) return 'vehicle.ego';
  switch (actor.category) {
    case 'car':
      return 'vehicle.car';
    case 'bus':
      return 'vehicle.bus';
    case 'lorry':
      return 'vehicle.lorry';
    case 'motorcycle':
    case 'bicycle':
      return 'vehicle.twoWheeler';
    case 'pedestrian':
      return 'vehicle.person';
  }
}

function buildActor(ctx: BuildContext, actor: Actor): void {
  let length: number = actor.dimensionsM.length;
  let width: number = actor.dimensionsM.width;
  let height: number = actor.dimensionsM.height;
  let frontOffset: number = actor.frontOffsetM;
  if (actor.asset) {
    const resolved = ctx.resolveGeometry(actor.asset, 'vehicle', actor.id);
    if (resolved) {
      const v = resolved.geometry.vehicle;
      const authored = {
        length: mmToMetres(v.lengthMm),
        width: mmToMetres(v.widthMm),
        height: mmToMetres(v.heightMm),
        frontOffset: mmToMetres(v.frontOffsetMm),
      };
      if (
        Math.abs(authored.length - length) > 1e-6 ||
        Math.abs(authored.width - width) > 1e-6 ||
        Math.abs(authored.height - height) > 1e-6 ||
        Math.abs(authored.frontOffset - frontOffset) > 1e-6
      ) {
        ctx.issue(
          'asset_geometry_mismatch',
          actor.id,
          `actor dimensions differ from ${resolved.asset.id}; asset dimensions drawn`,
        );
        ({ length, width, height, frontOffset } = authored);
      }
    }
  }

  const group = new Group();
  group.name = `actor:${actor.id}`;
  group.applyMatrix4(poseMatrix(actor.pose));
  const xFront = frontOffset;
  const xRear = frontOffset - length;
  const lift =
    actor.category === 'pedestrian' ? 0 : height * ctx.schematic('vehicleBodyLiftFraction');
  const body = ctx.materials.lit(bodyColour(actor));

  if (actor.category === 'car') {
    const lowerTop = lift + (height - lift) * 0.55;
    addBox(
      group,
      `body:${actor.id}`,
      body,
      [xRear, xFront],
      [-width / 2, width / 2],
      [lift, lowerTop],
    );
    addBox(
      group,
      `cabin:${actor.id}`,
      ctx.materials.lit('vehicle.glass'),
      [xRear + length * 0.15, xFront - length * 0.35],
      [-width * 0.45, width * 0.45],
      [lowerTop, height],
    );
  } else {
    addBox(
      group,
      `body:${actor.id}`,
      body,
      [xRear, xFront],
      [-width / 2, width / 2],
      [lift, height],
    );
  }

  if (actor.category !== 'pedestrian' && actor.category !== 'bicycle') {
    const wheelRadius = Math.min(lift * 1.5, 0.55);
    const wheelWidth = Math.min(width * 0.12, 0.3);
    const axleXs = [xFront - length * 0.18, xRear + length * 0.18];
    const ys =
      actor.category === 'motorcycle'
        ? [0]
        : [-width / 2 + wheelWidth / 2, width / 2 - wheelWidth / 2];
    for (const x of axleXs) {
      for (const y of ys) {
        const wheel = new CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12);
        wheel.translate(x, y, wheelRadius); // cylinders run along +Y already: the axle axis.
        const mesh = new Mesh(wheel, ctx.materials.lit('vehicle.wheel'));
        mesh.name = `wheel:${actor.id}`;
        group.add(mesh);
      }
    }
  }

  if (actor.category !== 'pedestrian') {
    const lampZ: readonly [number, number] = [
      lift + (height - lift) * 0.35,
      lift + (height - lift) * 0.5,
    ];
    const lampY = width / 2 - width * 0.12;
    const lampHalf = Math.min(width * 0.08, 0.12);
    const headlamp = ctx.materials.lit('vehicle.headlamp');
    for (const y of [-lampY, lampY])
      addBox(
        group,
        `headlamp:${actor.id}`,
        headlamp,
        [xFront - 0.02, xFront + 0.01],
        [y - lampHalf, y + lampHalf],
        lampZ,
      );
    const leftLit = actor.indicator === 'left' || actor.indicator === 'hazard';
    const rightLit = actor.indicator === 'right' || actor.indicator === 'hazard';
    const indicator = (lit: boolean) =>
      ctx.materials.unlit(
        lit ? SIGNAL_LENS_COLOURS.amber.lit : ROAD_MATERIAL_COLOURS['vehicle.lamp.dark'],
      );
    const cornerZ: readonly [number, number] = [lampZ[1], lampZ[1] + Math.min(0.08, height * 0.06)];
    for (const [y, lit] of [
      [width / 2, leftLit],
      [-width / 2, rightLit],
    ] as const) {
      const yRange: [number, number] = [
        Math.min(y, y - Math.sign(y) * lampHalf * 2),
        Math.max(y, y - Math.sign(y) * lampHalf * 2),
      ];
      addBox(
        group,
        `indicator:${actor.id}`,
        indicator(lit),
        [xFront - lampHalf, xFront + 0.01],
        yRange,
        cornerZ,
      );
      addBox(
        group,
        `indicator:${actor.id}`,
        indicator(lit),
        [xRear - 0.01, xRear + lampHalf],
        yRange,
        cornerZ,
      );
    }
  }

  group.updateMatrixWorld(true);
  ctx.register({
    id: actor.id,
    kind: 'actor',
    layer: 'physical',
    object: group,
    bounds: new Box3().setFromObject(group, true),
    category: actor.category,
    isEgo: actor.isEgo,
    front: new Vector3(frontOffset, 0, 0).applyMatrix4(poseMatrix(actor.pose)),
    headingVector: new Vector3(1, 0, 0).applyQuaternion(poseQuaternion(actor.pose)),
    dimensionsM: { length, width, height },
    indicator: actor.indicator,
  });
}

function addBox(
  group: Group,
  name: string,
  material: Mesh['material'],
  x: readonly [number, number],
  y: readonly [number, number],
  z: readonly [number, number],
): void {
  const geometry = new BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
  geometry.translate((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  group.add(mesh);
}
