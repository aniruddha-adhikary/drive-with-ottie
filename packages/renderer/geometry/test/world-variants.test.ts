import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  type AspectState,
  canonicalJson,
  cloneMutable,
  freezeDeep,
  radians,
  vec3,
  type World,
} from '@ottie/contracts';
import {
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  SIGNAL_IDS,
  SIGNAL_SLOTS,
} from '@ottie/contracts/fixtures';
import { lensColour } from '@ottie/renderer-geometry';
import { buildBareScene, entityOfKind, expectVector } from './helpers';

/** Mutated copies of the fixtures: the renderer must draw exactly what the world says and report the rest. */

function withAspectStates(states: Readonly<Record<string, AspectState>>): World {
  const world = cloneMutable<World>(SIGNALISED_JUNCTION_RIGHT_ARROW);
  world.signalControllers = world.signalControllers.map((controller) => ({
    ...controller,
    aspectStates: controller.aspectStates.map((entry) =>
      entry.headId === SIGNAL_IDS.entities.nbHead && states[entry.slot]
        ? { ...entry, state: states[entry.slot] ?? entry.state }
        : entry,
    ),
  }));
  return freezeDeep(world);
}

describe('signal states come only from the controller', () => {
  it('renders flashing amber as lit at the frozen instant and marks it flashing', () => {
    const scene = buildBareScene(
      withAspectStates({
        [SIGNAL_SLOTS.circularGreen]: 'dark',
        [SIGNAL_SLOTS.circularAmber]: 'flashing',
        [SIGNAL_SLOTS.rightArrowRed]: 'dark',
        [SIGNAL_SLOTS.rightArrowGreen]: 'lit',
      }),
    );
    expect(scene.issues).toEqual([]);
    const head = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.nbHead);
    const bySlot = Object.fromEntries(head.lenses.map((l) => [l.slot, l.state]));
    expect(bySlot[SIGNAL_SLOTS.circularAmber]).toBe('flashing');
    expect(bySlot[SIGNAL_SLOTS.circularGreen]).toBe('dark');
    expect(bySlot[SIGNAL_SLOTS.rightArrowGreen]).toBe('lit');
    expect(lensColour('amber', 'flashing')).toBe(lensColour('amber', 'lit'));
    expect(lensColour('amber', 'dark')).not.toBe(lensColour('amber', 'lit'));
    const glyph = scene.root.getObjectByName(
      `signal-glyph:${head.id}:${SIGNAL_SLOTS.rightArrowGreen}`,
    );
    expect(glyph).toBeDefined();
    // Lens order and positions never change with state.
    expect(head.lenses.map((l) => l.slot)).toEqual(Object.values(SIGNAL_SLOTS));
  });

  it('reports a head whose controller is missing and leaves every lens unlit rather than guessing', () => {
    const world = cloneMutable<World>(SIGNALISED_JUNCTION_RIGHT_ARROW);
    world.signalControllers = [];
    const scene = buildBareScene(freezeDeep(world));
    const head = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.nbHead);
    expect(head.controllerFound).toBe(false);
    for (const lens of head.lenses) expect(lens.state).toBeNull();
    expect(scene.issues.map((i) => i.code)).toContain('missing_controller');
  });

  it('reports a slot the controller does not mention', () => {
    const world = cloneMutable<World>(SIGNALISED_JUNCTION_RIGHT_ARROW);
    world.signalControllers = world.signalControllers.map((c) => ({
      ...c,
      aspectStates: c.aspectStates.filter((e) => e.slot !== SIGNAL_SLOTS.circularAmber),
    }));
    const scene = buildBareScene(freezeDeep(world));
    expect(scene.issues.filter((i) => i.code === 'missing_aspect_state')).toHaveLength(2); // both heads share the controller
  });
});

describe('mounting is checked, never corrected', () => {
  it('draws a sign at its authored pose and flags the drift when the pose leaves the attachment point', () => {
    const world = cloneMutable<World>(GIVE_WAY_T_JUNCTION);
    world.signFaces = world.signFaces.map((face) =>
      face.id === GIVE_WAY_IDS.entities.giveWaySign
        ? { ...face, pose: { ...face.pose, position: vec3(-4.1, -8, 2.6) } }
        : face,
    );
    const scene = buildBareScene(freezeDeep(world));
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    expect(sign.mount.mounted).toBe(false);
    expect(sign.mount.supportId).toBe(GIVE_WAY_IDS.entities.giveWayPost);
    expect(sign.panelCentre.z).toBeCloseTo(2.6, 6);
    expect(scene.issues.map((i) => i.code)).toContain('pose_attachment_mismatch');
    expectVector(sign.frontNormal, [0, -1, 0]);
  });

  it('flags a declared front normal that disagrees with pose x asset axes and keeps the pose orientation', () => {
    const world = cloneMutable<World>(GIVE_WAY_T_JUNCTION);
    world.signFaces = world.signFaces.map((face) =>
      face.id === GIVE_WAY_IDS.entities.giveWaySign
        ? { ...face, pose: { ...face.pose, yaw: radians(Math.PI / 2) } }
        : face,
    );
    const scene = buildBareScene(freezeDeep(world));
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    expectVector(sign.frontNormal, [1, 0, 0]);
    expect(sign.facesIntendedApproach).toBe(false);
    expect(scene.issues.map((i) => i.code)).toContain('front_normal_mismatch');
  });

  it('applies pitch and roll from the pose to the mounted face', () => {
    const world = cloneMutable<World>(GIVE_WAY_T_JUNCTION);
    world.signFaces = world.signFaces.map((face) =>
      face.id === GIVE_WAY_IDS.entities.giveWaySign
        ? { ...face, pose: { ...face.pose, roll: radians(0.2) } }
        : face,
    );
    const scene = buildBareScene(freezeDeep(world));
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    // roll about the pose's local +X (east) tilts the asset's -Y front toward +Z
    expectVector(sign.frontNormal, [0, -Math.cos(0.2), -Math.sin(0.2)], 6);
    expectVector(sign.up, [0, -Math.sin(0.2), Math.cos(0.2)], 6);
    expect(scene.issues.map((i) => i.code)).toContain('front_normal_mismatch');
    expect(scene.issues.map((i) => i.code)).toContain('up_mismatch');
  });

  it('reports a missing support and leaves the face floating at its pose', () => {
    const world = cloneMutable<World>(GIVE_WAY_T_JUNCTION);
    world.supports = [];
    const scene = buildBareScene(freezeDeep(world));
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    expect(sign.mount.mounted).toBe(false);
    expect(sign.mount.supportId).toBeNull();
    expect(sign.panelCentre.z).toBeCloseTo(2.1, 6);
    expect(scene.issues.map((i) => i.code)).toContain('missing_support');
    expect(scene.entities.has(GIVE_WAY_IDS.entities.giveWayPost)).toBe(false);
  });

  it('reports an unresolved asset instead of inventing a sign', () => {
    const world = cloneMutable<World>(GIVE_WAY_T_JUNCTION);
    world.signFaces = world.signFaces.map((face) => ({
      ...face,
      asset: { ...face.asset, version: 99 },
    }));
    const before = canonicalJson(world);
    const scene = buildBareScene(freezeDeep(world));
    expect(canonicalJson(world)).toBe(before);
    expect(scene.entities.has(GIVE_WAY_IDS.entities.giveWaySign)).toBe(false);
    expect(
      scene.issues.some(
        (i) => i.code === 'unresolved_asset' && i.entityId === GIVE_WAY_IDS.entities.giveWaySign,
      ),
    ).toBe(true);
  });

  it('draws faces without artwork as a flagged blank backing of the authored shape', () => {
    const scene = buildBareScene(GIVE_WAY_T_JUNCTION);
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    expect(sign.artwork).toBe('backing_only');
    expect(sign.artworkAxes).toBeNull();
    expect(sign.shape).toBe('triangle_point_down');
    expect(sign.bounds.getSize(new Vector3()).z).toBeCloseTo(0.6, 6);
    expect(scene.root.getObjectByName(`sign-plate:${sign.id}`)).toBeDefined();
  });
});
