// @vitest-environment jsdom
import { Box3, Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@ottie/contracts';
import {
  DEVELOPMENT_WORLDS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  SIGNAL_IDS,
  SIGNAL_SLOTS,
  STOP_DEVELOPMENT_ACCESS,
  STOP_IDS,
} from '@ottie/contracts/fixtures';
import { type RenderedEntity, type WorldScene } from '@ottie/renderer-geometry';
import { buildFixtureScene, entityOfKind, expectVector } from './helpers';

const scenes = new Map<string, Promise<WorldScene>>();
const sceneFor = (world: (typeof DEVELOPMENT_WORLDS)[number]): Promise<WorldScene> => {
  let scene = scenes.get(world.id);
  if (!scene) {
    scene = buildFixtureScene(world);
    scenes.set(world.id, scene);
  }
  return scene;
};

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function requireObject(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`object ${name} not in scene`);
  return found;
}

function worldVertices(object: Object3D): Vector3[] {
  const out: Vector3[] = [];
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!isMesh(child)) return;
    const position = child.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1)
      out.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
  });
  return out;
}

describe('every development fixture', () => {
  it('builds with no issues, immutable input and physical bounds that exclude the verge', async () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const before = canonicalJson(world);
      const scene = await sceneFor(world);
      expect(canonicalJson(world)).toBe(before);
      expect(scene.issues).toEqual([]);
      expect(scene.worldId).toBe(world.id);
      expect(scene.bounds.isEmpty()).toBe(false);
      const groundBox = new Box3().setFromObject(requireObject(scene.root, 'ground'));
      expect(groundBox.min.x).toBeLessThan(scene.bounds.min.x - 10);
      for (const [id, entity] of scene.entities) {
        expect(entity.id).toBe(id);
        expect(entity.object.parent).not.toBeNull();
      }
    }
  });

  it('records each schematic stand-in it used, none of them a source value', async () => {
    const scene = await sceneFor(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const keys = scene.schematicChoices.map((choice) => choice.key);
    expect(keys).toContain('support.pole.radius');
    expect(keys).toContain('signal.housing.depth');
    expect(keys).not.toContain('support.post.radius');
    for (const choice of scene.schematicChoices) expect(choice.unit).toBe('m');
  });
});

describe('roads and paint (sg-give-way-t-001)', () => {
  it('draws each road as a ribbon of the authored width along its centreline', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const roads = [...scene.entities.values()].filter(
      (e): e is Extract<RenderedEntity, { kind: 'road' }> => e.kind === 'road',
    );
    expect(roads).toHaveLength(GIVE_WAY_T_JUNCTION.roads.length);
    for (const road of roads) {
      const authored = GIVE_WAY_T_JUNCTION.roads.find((r) => r.id === road.id);
      expect(authored).toBeDefined();
      if (!authored) continue;
      const size = road.bounds.getSize(new Vector3());
      const across = Math.min(size.x, size.y);
      expect(across).toBeCloseTo(authored.widthM, 6);
      expect(road.widthM).toBe(authored.widthM);
      expect(road.lengthM).toBeGreaterThan(authored.widthM);
    }
  });

  it('lays the Give Way D marking as 2 rows x 100 mm, 1000 mm paint / 1000 mm gap, 150 mm apart, starting at the control line', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const marking = entityOfKind(scene, 'marking', GIVE_WAY_IDS.entities.giveWayLine);
    expect(marking.role).toBe('give_way_line');
    expect(marking.continuous).toBe(false);
    expect(marking.rowWidthM).toBeCloseTo(0.1, 9);
    expect(marking.anchorEdge).toBe('upstream_edge');
    expect(marking.rows).toHaveLength(2);
    const [near, far] = marking.rows;
    if (!near || !far) throw new Error('rows missing');
    expect(near.centreOffsetM).toBeCloseTo(0.05, 9);
    expect(far.centreOffsetM).toBeCloseTo(0.05 + 0.1 + 0.15, 9);
    for (const row of marking.rows) {
      expect(row.segments).toHaveLength(2);
      for (const segment of row.segments)
        expect(segment.from.distanceTo(segment.to)).toBeCloseTo(1, 6);
      const [a, b] = row.segments;
      if (!a || !b) throw new Error('segments missing');
      expect(a.to.distanceTo(b.from)).toBeCloseTo(1, 6);
    }
    const anchor = GIVE_WAY_T_JUNCTION.anchors.find(
      (a) => a.id === GIVE_WAY_IDS.anchors.controlLine,
    );
    if (anchor?.kind !== 'control_line') throw new Error('control line anchor missing');
    const anchorY = anchor.polyline[0]?.y ?? Number.NaN;
    expect(marking.bounds.min.y).toBeCloseTo(anchorY, 6);
    expect(marking.bounds.max.y).toBeCloseTo(anchorY + 0.1 + 0.15 + 0.1, 6);
    expectVector(marking.offsetDirection, [0, 1, 0]);
    expect(marking.bounds.min.z).toBeGreaterThan(0);
    expect(marking.bounds.min.z).toBeLessThan(0.02);
  });

  it('lays the STOP J marking as one continuous 300 mm row across the approach lane', async () => {
    const scene = await sceneFor(STOP_DEVELOPMENT_ACCESS);
    const marking = entityOfKind(scene, 'marking', STOP_IDS.entities.stopLine);
    expect(marking.role).toBe('stop_line');
    expect(marking.continuous).toBe(true);
    expect(marking.rowWidthM).toBeCloseTo(0.3, 9);
    expect(marking.rows).toHaveLength(1);
    const size = marking.bounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(0.3, 6);
    const laneWidth = STOP_DEVELOPMENT_ACCESS.lanes.find(
      (l) => l.id === STOP_IDS.lanes.accessWestbound,
    )?.widthM;
    expect(laneWidth).toBeDefined();
    expect(size.y).toBeCloseTo(laneWidth ?? Number.NaN, 6);
  });
});

describe('supports and mounted sign faces', () => {
  it('draws the post as a real vertical shaft from its base anchor with named attachment points', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const post = entityOfKind(scene, 'support', GIVE_WAY_IDS.entities.giveWayPost);
    const base = GIVE_WAY_T_JUNCTION.anchors.find((a) => a.id === GIVE_WAY_IDS.anchors.signBase);
    if (base?.kind !== 'support_base') throw new Error('base anchor missing');
    expectVector(post.base, [base.position.x, base.position.y, base.position.z]);
    expect(post.heightM).toBeCloseTo(2.1, 9);
    expect(post.heightSource).toBe('highest_attachment'); // dev post: no world/asset height, only its 2100 mm mount
    expect(post.dimensionsStatus).toBe('schematic_unsourced');
    expectVector(post.top, [base.position.x, base.position.y, base.position.z + 2.1]);
    const size = post.bounds.getSize(new Vector3());
    expect(size.z).toBeGreaterThanOrEqual(2.1);
    expect(size.x).toBeLessThan(0.2);
    expect(size.y).toBeLessThan(0.2);
    const mount = post.attachmentPoints.get('top_face_mount');
    expect(mount).toBeDefined();
    if (mount) expectVector(mount, [base.position.x, base.position.y, base.position.z + 2.1]);
    expect(scene.root.getObjectByName(`support-shaft:${post.id}`)).toBeDefined();
  });

  it('mounts the Give Way face on the post, facing the northbound approach, 600 x 600 mm, point down, with verified artwork', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const sign = entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign);
    expect(sign.shape).toBe('triangle_point_down');
    expect(sign.widthM).toBeCloseTo(0.6, 9);
    expect(sign.heightM).toBeCloseTo(0.6, 9);
    expectVector(sign.frontNormal, [0, -1, 0]);
    expectVector(sign.up, [0, 0, 1]);
    expectVector(sign.right, [1, 0, 0]);
    expect(sign.facesIntendedApproach).toBe(true);
    expect(sign.mount.mounted).toBe(true);
    expect(sign.mount.supportId).toBe(GIVE_WAY_IDS.entities.giveWayPost);
    expect(sign.mount.attachmentPoint).not.toBeNull();
    if (sign.mount.attachmentPoint) expectVector(sign.mount.attachmentPoint, [-4.1, -8, 2.1]);
    expect(sign.panelCentre.z).toBeCloseTo(2.1, 6);
    expect(sign.panelCentre.y).toBeLessThan(-8); // plate stands off the post on the readable side
    expect(sign.artwork).toBe('vector');
    expect(sign.artworkAxes).not.toBeNull();
    if (sign.artworkAxes) {
      expectVector(sign.artworkAxes.svgX, [1, 0, 0]);
      expectVector(sign.artworkAxes.svgY, [0, 0, -1]);
    }

    const vertices = worldVertices(requireObject(scene.root, `sign-plate:${sign.id}`));
    const lowest = vertices.reduce((a, b) => (b.z < a.z ? b : a));
    const highest = vertices.reduce((a, b) => (b.z > a.z ? b : a));
    expect(lowest.x).toBeCloseTo(-4.1, 6); // the point of the triangle is centred at the bottom
    expect(highest.z - lowest.z).toBeCloseTo(0.6, 6);
    expect(
      vertices
        .filter((v) => Math.abs(v.z - highest.z) < 1e-6)
        .map((v) => v.x)
        .sort((a, b) => a - b),
    ).toEqual(expect.arrayContaining([expect.closeTo(-4.4, 6), expect.closeTo(-3.8, 6)]));

    const artworkMeshes: Object3D[] = [];
    scene.root.traverse((c) => {
      if (c.name.startsWith(`sign-artwork:${sign.id}`)) artworkMeshes.push(c);
    });
    expect(artworkMeshes.length).toBeGreaterThan(0);
    for (const mesh of artworkMeshes) {
      mesh.updateMatrixWorld(true);
      expect(mesh.matrixWorld.determinant()).toBeGreaterThan(0);
    }
    const art = new Box3();
    for (const mesh of artworkMeshes) art.expandByObject(mesh, true);
    expect(art.max.y).toBeLessThan(sign.panelCentre.y); // artwork sits in front of the plate
    expect(art.max.z - art.min.z).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(art.max.x - art.min.x).toBeLessThanOrEqual(0.6 + 1e-6);
  });

  it('turns the STOP face with its pose so front, up and reading direction follow the yaw', async () => {
    const scene = await sceneFor(STOP_DEVELOPMENT_ACCESS);
    const sign = entityOfKind(scene, 'sign_face', STOP_IDS.entities.stopSign);
    expect(sign.shape).toBe('octagon');
    expectVector(sign.frontNormal, [1, 0, 0]);
    expectVector(sign.up, [0, 0, 1]);
    expectVector(sign.right, [0, 1, 0]);
    expect(sign.facesIntendedApproach).toBe(true);
    expect(sign.mount.mounted).toBe(true);
    expect(sign.artwork).toBe('vector');
    if (sign.artworkAxes) expectVector(sign.artworkAxes.svgX, [0, 1, 0]);
  });
});

describe('signal heads (sg-signal-green-right-red-001)', () => {
  it('orders lenses by authored column then row, circular column left of the arrow column, 500 mm apart, lowest at 2290 mm', async () => {
    const scene = await sceneFor(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const head = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.nbHead);
    expect(head.arrangement).toBe('vertical');
    expect(head.controllerFound).toBe(true);
    expect(head.lenses.map((l) => l.slot)).toEqual([
      SIGNAL_SLOTS.circularRed,
      SIGNAL_SLOTS.circularAmber,
      SIGNAL_SLOTS.circularGreen,
      SIGNAL_SLOTS.rightArrowRed,
      SIGNAL_SLOTS.rightArrowAmber,
      SIGNAL_SLOTS.rightArrowGreen,
    ]);
    const circular = head.lenses.filter((l) => l.shape === 'circular');
    const arrows = head.lenses.filter((l) => l.shape === 'arrow_right');
    expect(circular).toHaveLength(3);
    expect(arrows).toHaveLength(3);
    for (const lens of arrows)
      expect(lens.centre.x).toBeGreaterThan(circular[0]?.centre.x ?? Number.NaN);
    const zs = circular.map((l) => l.centre.z);
    expect(zs[0]).toBeGreaterThan(zs[1] ?? Number.NaN);
    expect((zs[0] ?? 0) - (zs[1] ?? 0)).toBeCloseTo(0.5, 6);
    expect((zs[1] ?? 0) - (zs[2] ?? 0)).toBeCloseTo(0.5, 6);
    expect(zs[2]).toBeCloseTo(2.29, 6);
    expect(head.lowestLensCentreAboveGroundM).toBeCloseTo(2.29, 9);
    expect(head.lensSpacingSource).toBe('maximum_bound');
    expect(head.lensDiameterSource).toBe('minimum_bound'); // Rule 11 gives only a 200 mm minimum
    for (const lens of head.lenses) expect(lens.diameterM).toBeCloseTo(0.2, 9);
  });

  it('lights exactly the aspects the controller says are lit and binds each column to its own movements', async () => {
    const scene = await sceneFor(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const head = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.nbHead);
    const state = Object.fromEntries(head.lenses.map((l) => [l.slot, l.state]));
    expect(state).toEqual({
      [SIGNAL_SLOTS.circularRed]: 'dark',
      [SIGNAL_SLOTS.circularAmber]: 'dark',
      [SIGNAL_SLOTS.circularGreen]: 'lit',
      [SIGNAL_SLOTS.rightArrowRed]: 'lit',
      [SIGNAL_SLOTS.rightArrowAmber]: 'dark',
      [SIGNAL_SLOTS.rightArrowGreen]: 'dark',
    });
    const green = head.lenses.find((l) => l.slot === SIGNAL_SLOTS.circularGreen);
    const redArrow = head.lenses.find((l) => l.slot === SIGNAL_SLOTS.rightArrowRed);
    expect(green?.controlsMovementIds).toEqual([
      SIGNAL_IDS.movements.nbStraight,
      SIGNAL_IDS.movements.nbLeft,
    ]);
    expect(redArrow?.controlsMovementIds).toEqual([SIGNAL_IDS.movements.nbRight]);
    expect(redArrow?.glyphDirection).not.toBeNull();
    if (redArrow?.glyphDirection) expectVector(redArrow.glyphDirection, [1, 0, 0]); // observer's right when facing north
    expect(green?.glyphDirection).toBeNull();
  });

  it('faces the head at its approach, mounted on the pole, with lenses in front of the housing', async () => {
    const scene = await sceneFor(SIGNALISED_JUNCTION_RIGHT_ARROW);
    const nb = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.nbHead);
    const sb = entityOfKind(scene, 'signal_head', SIGNAL_IDS.entities.sbHead);
    expectVector(nb.frontNormal, [0, -1, 0]);
    expectVector(sb.frontNormal, [0, 1, 0]);
    expect(nb.facesIntendedApproach).toBe(true);
    expect(sb.facesIntendedApproach).toBe(true);
    expect(nb.mount.mounted).toBe(true);
    expect(nb.mount.supportId).toBe(SIGNAL_IDS.entities.nbPole);
    for (const lens of nb.lenses) expect(lens.centre.y).toBeLessThan(-5.5);
    for (const lens of sb.lenses) expect(lens.centre.y).toBeGreaterThan(5.5);
    const sbArrow = sb.lenses.find((l) => l.slot === SIGNAL_SLOTS.rightArrowRed);
    if (sbArrow?.glyphDirection) expectVector(sbArrow.glyphDirection, [-1, 0, 0]);
    const pole = entityOfKind(scene, 'support', SIGNAL_IDS.entities.nbPole);
    expect(pole.heightSource).toBe('highest_attachment');
    expect(pole.dimensionsStatus).toBe('schematic_unsourced');
    expect(pole.attachmentPoints.get('head_mount')?.z).toBeCloseTo(2.29, 6);
  });
});

describe('actors', () => {
  it('draws vehicles at authored dimensions, poses and front offsets', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const ego = entityOfKind(scene, 'actor', GIVE_WAY_IDS.entities.ego);
    const bus = entityOfKind(scene, 'actor', GIVE_WAY_IDS.entities.bus);
    expect(ego.isEgo).toBe(true);
    expect(ego.dimensionsM).toEqual({ length: 4.5, width: 1.8, height: 1.5 });
    expect(bus.dimensionsM).toEqual({ length: 12, width: 2.5, height: 3.2 });
    expectVector(ego.headingVector, [0, 1, 0]);
    const egoAuthored = GIVE_WAY_T_JUNCTION.actors.find((a) => a.id === ego.id);
    if (!egoAuthored) throw new Error('ego missing');
    expect(ego.front.y).toBeCloseTo(egoAuthored.pose.position.y + egoAuthored.frontOffsetM, 6);
    const egoSize = ego.bounds.getSize(new Vector3());
    expect(egoSize.x).toBeCloseTo(1.8, 6);
    expect(egoSize.y).toBeCloseTo(4.5, 1);
    expect(egoSize.z).toBeCloseTo(1.5, 6);
    expect(ego.bounds.min.z).toBeCloseTo(0, 6);
    const busSize = bus.bounds.getSize(new Vector3());
    expect(busSize.x).toBeCloseTo(12, 1);
    expect(busSize.y).toBeCloseTo(2.5, 6);
    expect(busSize.z).toBeCloseTo(3.2, 6);
  });
});

describe('lookup, bounds, overlay and disposal', () => {
  it('answers boundsOf for evidence targets and exposes hidden lane/anchor overlays', async () => {
    const scene = await sceneFor(GIVE_WAY_T_JUNCTION);
    const both = scene.boundsOf([
      GIVE_WAY_IDS.entities.giveWaySign,
      GIVE_WAY_IDS.entities.giveWayLine,
    ]);
    expect(both).not.toBeNull();
    if (both) {
      expect(
        both.containsBox(
          entityOfKind(scene, 'sign_face', GIVE_WAY_IDS.entities.giveWaySign).bounds,
        ),
      ).toBe(true);
      expect(
        both.containsBox(entityOfKind(scene, 'marking', GIVE_WAY_IDS.entities.giveWayLine).bounds),
      ).toBe(true);
    }
    expect(scene.boundsOf(['nope'])).toBeNull();
    const lane = entityOfKind(scene, 'lane', GIVE_WAY_IDS.lanes.minorNorthbound);
    expect(lane.layer).toBe('overlay');
    expectVector(lane.headingVector, [0, 1, 0]);
    const overlay = scene.root.getObjectByName('layer:overlay');
    expect(overlay?.visible).toBe(false);
    scene.setOverlayVisible(true);
    expect(overlay?.visible).toBe(true);
    scene.setOverlayVisible(false);
    expect(entityOfKind(scene, 'anchor', GIVE_WAY_IDS.anchors.controlLine).anchorKind).toBe(
      'control_line',
    );
  });

  it('disposes every geometry and material once and empties the graph', async () => {
    const scene = await buildFixtureScene(STOP_DEVELOPMENT_ACCESS);
    const disposed = new Set<string>();
    const tracked = new Set<string>();
    let doubleDisposals = 0;
    scene.root.traverse((mesh) => {
      if (!isMesh(mesh)) return;
      const track = (thing: { dispose(): void; uuid: string }) => {
        if (tracked.has(thing.uuid)) return;
        tracked.add(thing.uuid);
        const original = thing.dispose.bind(thing);
        thing.dispose = () => {
          if (disposed.has(thing.uuid)) doubleDisposals += 1;
          disposed.add(thing.uuid);
          original();
        };
      };
      track(mesh.geometry);
      if (Array.isArray(mesh.material)) mesh.material.forEach(track);
      else track(mesh.material);
    });
    expect(disposed.size).toBe(0);
    scene.dispose();
    expect(disposed.size).toBeGreaterThan(10);
    expect(doubleDisposals).toBe(0);
    expect(scene.root.children).toHaveLength(0);
    expect(scene.entities.size).toBe(0);
    scene.dispose();
  });
});
