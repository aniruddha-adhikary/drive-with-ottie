import { describe, expect, it } from 'vitest';
import {
  type DeepReadonly,
  type GenerationRequest,
  type World,
  WORLD_SCHEMA_VERSION,
  canonicalJson,
  checkWorldStructure,
  seed,
  templateId,
  worldId,
} from '@ottie/contracts';
import {
  DEVELOPMENT_ASSET_REGISTRY_HASH,
  DEVELOPMENT_TEMPLATES,
  DEVELOPMENT_WORLDS,
  FIXTURE_SOURCE_PROFILE_ID,
  GIVE_WAY_IDS,
  SIGNAL_IDS,
  STOP_IDS,
  TEMPLATE_GIVE_WAY_T,
  TEMPLATE_SIGNALISED_CROSSROADS,
  TEMPLATE_STOP_T,
} from '@ottie/contracts/fixtures';
import { GENERATOR_VERSION, computeCanonicalHash, createDevelopmentGenerator, verifyCanonicalHash } from '@ottie/scenario-core';

const generator = createDevelopmentGenerator();

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    id: worldId('test-world'),
    schemaVersion: WORLD_SCHEMA_VERSION,
    templateRef: { id: TEMPLATE_GIVE_WAY_T.id, version: TEMPLATE_GIVE_WAY_T.version },
    seed: seed('seed-a'),
    sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
    parameters: {},
    contentBundle: null,
    views: ['plan', 'study_oblique', 'approach_ego', 'entity_detail'],
    ...overrides,
  };
}

function generate(overrides: Partial<GenerationRequest> = {}): DeepReadonly<World> {
  const result = generator.generate(request(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics, null, 2));
  return result.world;
}

/** Everything a question answer can depend on; must be identical across seeds and presentation state. */
function answerBearingView(world: DeepReadonly<World>): unknown {
  return {
    controlRegime: world.controlRegime,
    roads: world.roads,
    lanes: world.lanes,
    movements: world.movements,
    anchors: world.anchors,
    markings: world.markings,
    supports: world.supports,
    signFaces: world.signFaces,
    signalHeads: world.signalHeads,
    signalControllers: world.signalControllers,
    actors: world.actors.map((a) => (a.isEgo ? a : { ...a, progressM: null, pose: null })),
    conditions: { ...world.conditions, daylight: null, localDateTime: null },
    evidence: world.evidence,
    cameraPresets: world.cameraPresets,
    provenance: { ...world.provenance, key: { ...world.provenance.key, seed: null }, canonicalHash: null, parameters: null },
  };
}

/** Semantic content shared by a fixture and its generated equivalent (variation and float noise removed). */
function semanticView(world: DeepReadonly<World>): unknown {
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  const roundVec = (v: { readonly x: number; readonly y: number; readonly z: number } | undefined) => (v ? { x: round(v.x), y: round(v.y), z: round(v.z) } : v);
  const ids = (xs: readonly { readonly id: string }[]): readonly string[] => xs.map((x) => x.id).sort();
  return {
    controlRegime: world.controlRegime,
    lanes: world.lanes.map((l) => ({
      id: l.id,
      roadId: l.roadId,
      heading: round(l.heading),
      first: roundVec(l.centreline[0]),
      last: roundVec(l.centreline.at(-1)),
      outgoing: [...l.outgoingMovementIds].sort(),
    })),
    movements: world.movements.map((m) => ({
      id: m.id,
      from: m.fromLaneId,
      to: m.toLaneId,
      turn: m.turn,
      priority: m.priority,
      conflictsWith: [...m.conflictsWith].sort(),
      yieldsTo: [...m.yieldsTo].sort(),
    })),
    controlAnchors: world.anchors.filter((a) => a.kind === 'control_line' || a.kind === 'support_base'),
    markings: world.markings,
    supports: world.supports,
    signFaces: world.signFaces,
    signalHeads: world.signalHeads,
    signalControllers: world.signalControllers,
    actorIds: ids(world.actors),
    ego: world.actors.find((a) => a.isEgo),
    evidence: world.evidence,
    cameraPresets: world.cameraPresets.map((c) => ({ ...c, eye: roundVec(c.eye), target: roundVec(c.target) })),
  };
}

function fixtureFor(template: typeof TEMPLATE_GIVE_WAY_T): DeepReadonly<World> {
  const fixture = DEVELOPMENT_WORLDS.find((w) => w.provenance.key.template.id === template.id);
  if (!fixture) throw new Error(`no fixture for ${template.id}`);
  return fixture;
}

const DEFAULT_REQUESTS: readonly { readonly template: typeof TEMPLATE_GIVE_WAY_T; readonly fixture: DeepReadonly<World> }[] = [
  { template: TEMPLATE_GIVE_WAY_T, fixture: fixtureFor(TEMPLATE_GIVE_WAY_T) },
  { template: TEMPLATE_STOP_T, fixture: fixtureFor(TEMPLATE_STOP_T) },
  { template: TEMPLATE_SIGNALISED_CROSSROADS, fixture: fixtureFor(TEMPLATE_SIGNALISED_CROSSROADS) },
];

function templateRef(t: typeof TEMPLATE_GIVE_WAY_T): GenerationRequest['templateRef'] {
  return { id: t.id, version: t.version };
}

describe('development generator: fixture equivalence', () => {
  it('reproduces each F0 fixture semantically from its template defaults', () => {
    expect(DEVELOPMENT_WORLDS.map((w) => w.provenance.key.template.id)).toEqual(DEVELOPMENT_TEMPLATES.map((t) => t.id));
    for (const { template, fixture } of DEFAULT_REQUESTS) {
      const world = generate({ templateRef: templateRef(template) });
      expect(canonicalJson(semanticView(world))).toBe(canonicalJson(semanticView(fixture)));
      expect(checkWorldStructure(world).filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('keeps every stable authored entity ID from the fixtures', () => {
    const giveWay = generate({ templateRef: templateRef(TEMPLATE_GIVE_WAY_T) });
    const allIds = new Set<string>([
      ...giveWay.lanes.map((l) => l.id),
      ...giveWay.movements.map((m) => m.id),
      ...giveWay.anchors.map((a) => a.id),
      ...giveWay.markings.map((m) => m.id),
      ...giveWay.supports.map((s) => s.id),
      ...giveWay.signFaces.map((s) => s.id),
      ...giveWay.actors.map((a) => a.id),
      ...giveWay.evidence.map((e) => e.id),
    ]);
    for (const group of [GIVE_WAY_IDS.lanes, GIVE_WAY_IDS.movements, GIVE_WAY_IDS.anchors, GIVE_WAY_IDS.entities, GIVE_WAY_IDS.evidence]) {
      for (const id of Object.values(group)) expect(allIds.has(id), id).toBe(true);
    }
    const stop = generate({ templateRef: templateRef(TEMPLATE_STOP_T) });
    for (const id of [...Object.values(STOP_IDS.entities), ...Object.values(STOP_IDS.evidence)]) {
      expect([...stop.markings, ...stop.supports, ...stop.signFaces, ...stop.actors, ...stop.evidence].some((e) => e.id === id), id).toBe(true);
    }
    const signal = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS) });
    for (const id of [...Object.values(SIGNAL_IDS.entities), ...Object.values(SIGNAL_IDS.evidence)]) {
      expect([...signal.markings, ...signal.supports, ...signal.signalHeads, ...signal.signalControllers, ...signal.actors, ...signal.evidence].some((e) => e.id === id), id).toBe(true);
    }
  });
});

describe('development generator: determinism and canonical equivalence', () => {
  it('is byte-for-byte repeatable for the same template, version, seed and parameters', () => {
    for (const { template } of DEFAULT_REQUESTS) {
      const a = generate({ templateRef: templateRef(template), seed: seed('repeat') });
      const b = generate({ templateRef: templateRef(template), seed: seed('repeat') });
      expect(canonicalJson(a)).toBe(canonicalJson(b));
      expect(a.provenance.canonicalHash).toBe(b.provenance.canonicalHash);
    }
  });

  it('treats explicitly-defaulted and omitted parameters, and differently-ordered parameters, as the same request', () => {
    const omitted = generate({ parameters: {} });
    const explicit = generate({ parameters: { egoMovement: 'left', minorApproach: 'south', 'majorRoadVehicle.category': 'bus', 'majorRoadVehicle.approach': 'east' } });
    const reordered = generate({ parameters: { 'majorRoadVehicle.approach': 'east', 'majorRoadVehicle.category': 'bus', minorApproach: 'south', egoMovement: 'left' } });
    expect(canonicalJson(omitted)).toBe(canonicalJson(explicit));
    expect(canonicalJson(omitted)).toBe(canonicalJson(reordered));
  });

  it('is invariant under camera view selection/order and any presentation state', () => {
    const full = generate({ views: ['plan', 'study_oblique', 'approach_ego', 'entity_detail'] });
    const reversed = generate({ views: ['entity_detail', 'approach_ego', 'study_oblique', 'plan'] });
    const planOnly = generate({ views: ['plan'] });
    const none = generate({ views: [] });
    for (const other of [reversed, planOnly, none]) expect(canonicalJson(other)).toBe(canonicalJson(full));
    expect(full.cameraPresets.map((c) => c.name)).toEqual(['plan', 'study_oblique', 'approach_ego', 'entity_detail']);
  });

  it('carries a verifiable canonical hash that excludes only itself', () => {
    const world = generate();
    expect(world.provenance.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyCanonicalHash(world)).toBe(true);
    const tampered: DeepReadonly<World> = { ...world, controlRegime: 'stop' };
    expect(verifyCanonicalHash(tampered)).toBe(false);
    expect(computeCanonicalHash(generate({ seed: seed('other') }))).not.toBe(world.provenance.canonicalHash);
  });

  it('changes the hash when the world ID changes but not the semantic body', () => {
    const a = generate({ id: worldId('one') });
    const b = generate({ id: worldId('two') });
    expect(a.provenance.canonicalHash).not.toBe(b.provenance.canonicalHash);
    expect(canonicalJson(answerBearingView(a))).toBe(canonicalJson(answerBearingView(b)));
  });
});

describe('development generator: safe variation', () => {
  it('different seeds change only declared safe-variation fields and stay inside the declared ranges', () => {
    for (const { template } of DEFAULT_REQUESTS) {
      const worlds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((s) => generate({ templateRef: templateRef(template), seed: seed(s) }));
      const [first] = worlds;
      if (!first) throw new Error('no worlds generated');
      const reference = canonicalJson(answerBearingView(first));
      const progressSeen = new Set<number>();
      const daylightSeen = new Set<string>();
      for (const world of worlds) {
        expect(canonicalJson(answerBearingView(world))).toBe(reference);
        const daylightRange = template.safeVariation.find((v) => v.field === 'conditions.daylight')?.range as { allowed?: readonly string[] } | undefined;
        expect((daylightRange?.allowed ?? ['day']).includes(world.conditions.daylight)).toBe(true);
        daylightSeen.add(world.conditions.daylight);
        const progressRange = template.safeVariation.find((v) => v.field === 'actors[!ego].progressM')?.range as { minM: number; maxM: number };
        const variation = world.provenance.parameters.safeVariation as { nonEgoProgressM: number | null; daylight: string | null };
        if (variation.nonEgoProgressM === null) throw new Error('progress variation not drawn');
        expect(variation.nonEgoProgressM).toBeGreaterThanOrEqual(progressRange.minM);
        expect(variation.nonEgoProgressM).toBeLessThanOrEqual(progressRange.maxM);
        progressSeen.add(variation.nonEgoProgressM);
        const ego = world.actors.find((a) => a.isEgo);
        expect(ego).toBeDefined();
      }
      expect(progressSeen.size).toBeGreaterThan(1);
      if (template.safeVariation.some((v) => v.field === 'conditions.daylight')) expect(daylightSeen.size).toBeGreaterThan(1);
    }
  });

  it('the ego actor never moves under variation', () => {
    const a = generate({ seed: seed('ego-a') });
    const b = generate({ seed: seed('ego-b') });
    expect(a.actors.find((x) => x.isEgo)).toEqual(b.actors.find((x) => x.isEgo));
  });

  it('non-ego vehicle distance from the junction equals the drawn variation', () => {
    const world = generate({ seed: seed('dist') });
    const bus = world.actors.find((a) => a.id === GIVE_WAY_IDS.entities.bus);
    const drawn = (world.provenance.parameters.safeVariation as { nonEgoProgressM: number }).nonEgoProgressM;
    expect(bus).toBeDefined();
    // Default approach 'east': the bus travels westbound toward the junction centre at x = 0.
    expect(bus?.laneId).toBe(GIVE_WAY_IDS.lanes.majorWestbound);
    expect(bus?.pose.position.x ?? Number.NaN).toBeCloseTo(drawn, 9);
  });
});

describe('development generator: priority, conflicts and connectivity', () => {
  it('authors priority from the control regime: every minor movement yields to every conflicting major movement', () => {
    const world = generate();
    const byId = new Map(world.movements.map((m) => [m.id, m] as const));
    for (const id of [GIVE_WAY_IDS.movements.minorLeft, GIVE_WAY_IDS.movements.minorRight]) {
      const m = byId.get(id);
      expect(m?.priority).toBe('yield');
      expect([...(m?.yieldsTo ?? [])].sort()).toEqual([...(m?.conflictsWith ?? [])].sort());
      for (const c of m?.conflictsWith ?? []) expect(byId.get(c)?.conflictsWith).toContain(id);
    }
    expect(byId.get(GIVE_WAY_IDS.movements.majorEbStraight)?.yieldsTo).toEqual([]);
    expect(byId.get(GIVE_WAY_IDS.movements.majorWbStraight)?.yieldsTo).toEqual([]);
  });

  it('STOP movements are stop_then_yield whether or not a crossing vehicle exists', () => {
    const withCar = generate({ templateRef: templateRef(TEMPLATE_STOP_T) });
    const without = generate({ templateRef: templateRef(TEMPLATE_STOP_T), parameters: { 'crossingVehicle.approach': 'none' } });
    for (const world of [withCar, without]) {
      const access = world.movements.filter((m) => m.fromLaneId === 'access.with.0');
      expect(access).toHaveLength(2);
      for (const m of access) expect(m.priority).toBe('stop_then_yield');
    }
    expect(canonicalJson(withCar.movements)).toBe(canonicalJson(without.movements));
    expect(without.actors.map((a) => a.id)).toEqual([STOP_IDS.entities.ego]);
    expect(without.evidence.some((e) => e.id === STOP_IDS.evidence.crossingCar)).toBe(false);
    expect(without.cameraPresets.every((c) => !c.evidenceIds.includes(STOP_IDS.evidence.crossingCar))).toBe(true);
  });

  it('lane connectivity: every movement starts in its origin lane and outgoing sets are exact', () => {
    for (const { template } of DEFAULT_REQUESTS) {
      const world = generate({ templateRef: templateRef(template) });
      const laneIds = new Set(world.lanes.map((l) => l.id));
      for (const lane of world.lanes) {
        const leaving = world.movements.filter((m) => m.fromLaneId === lane.id).map((m) => m.id).sort();
        expect([...lane.outgoingMovementIds].sort()).toEqual(leaving);
        expect(lane.centreline.length).toBeGreaterThanOrEqual(2);
      }
      for (const m of world.movements) {
        expect(laneIds.has(m.fromLaneId)).toBe(true);
        expect(laneIds.has(m.toLaneId)).toBe(true);
        expect(m.path.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('development generator: LEFT traffic, approach association and rotation', () => {
  it('directed lanes drive on the left: a lane is left of the road centre in its own travel direction', () => {
    for (const { template } of DEFAULT_REQUESTS) {
      const world = generate({ templateRef: templateRef(template) });
      for (const lane of world.lanes) {
        const first = lane.centreline[0];
        const last = lane.centreline.at(-1);
        if (!first || !last) throw new Error('empty centreline');
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        // Left normal of travel direction is (-dy, dx); the lane centre must lie on that side of the road centreline.
        const road = world.roads.find((r) => r.id === lane.roadId);
        const r0 = road?.centreline[0];
        if (!r0) throw new Error('road missing');
        const side = -dy * (first.x - r0.x) + dx * (first.y - r0.y);
        expect(side, lane.id).toBeGreaterThan(0);
        // The stored heading matches the centreline direction.
        expect(Math.cos(lane.heading) * dx + Math.sin(lane.heading) * dy).toBeGreaterThan(0);
      }
    }
  });

  it('signs and signal heads face their intended approach lane and sit on its left roadside', () => {
    for (const { template } of DEFAULT_REQUESTS) {
      const world = generate({ templateRef: templateRef(template) });
      for (const face of [...world.signFaces, ...world.signalHeads]) {
        const laneId = face.intendedApproach.laneIds[0];
        const lane = world.lanes.find((l) => l.id === laneId);
        expect(lane).toBeDefined();
        // Front normal points against the approach heading (toward oncoming drivers).
        const dot = face.frontNormal.x * Math.cos(face.intendedApproach.heading) + face.frontNormal.y * Math.sin(face.intendedApproach.heading);
        expect(dot).toBeLessThan(-0.99);
        expect(face.intendedApproach.heading).toBe(lane?.heading);
        const support = world.supports.find((s) => s.id === face.attachment.supportId);
        const base = world.anchors.find((a) => a.id === support?.baseAnchorId);
        expect(base?.kind).toBe('support_base');
        if (base?.kind === 'support_base') {
          expect(base.roadsideOf).toEqual({ laneId, side: 'left' });
          expect(face.linkedControlLineIds.length).toBeGreaterThan(0);
        }
        for (const controlLineId of face.linkedControlLineIds) {
          const line = world.anchors.find((a) => a.id === controlLineId);
          expect(line?.kind).toBe('control_line');
          if (line?.kind === 'control_line') expect(line.controlsLaneIds).toContain(laneId);
        }
      }
    }
  });

  it('rotating the minor approach is an exact quarter turn that preserves every semantic relationship', () => {
    const south = generate({ parameters: { 'majorRoadVehicle.approach': 'none' } });
    const west = generate({ parameters: { minorApproach: 'west', 'majorRoadVehicle.approach': 'none' } });
    const north = generate({ parameters: { minorApproach: 'north', 'majorRoadVehicle.approach': 'none' } });
    const strip = (w: DeepReadonly<World>): unknown => ({
      movements: w.movements.map((m) => ({ ...m, path: null })),
      lanes: w.lanes.map((l) => ({ id: l.id, roadId: l.roadId, outgoing: l.outgoingMovementIds })),
      markings: w.markings,
      signFaces: w.signFaces.map((f) => ({ ...f, pose: null, frontNormal: null, intendedApproach: { laneIds: f.intendedApproach.laneIds } })),
      evidence: w.evidence,
      actorLanes: w.actors.map((a) => ({ id: a.id, laneId: a.laneId, movementId: a.movementId })),
    });
    expect(canonicalJson(strip(west))).toBe(canonicalJson(strip(south)));
    expect(canonicalJson(strip(north))).toBe(canonicalJson(strip(south)));
    const egoSouth = south.actors.find((a) => a.isEgo);
    const egoWest = west.actors.find((a) => a.isEgo);
    // (x, y) -> (y, -x) is the clockwise quarter turn taking a south approach to a west approach.
    if (!egoSouth || !egoWest) throw new Error('ego missing');
    expect(egoWest.pose.position).toEqual({ x: egoSouth.pose.position.y, y: 0 - egoSouth.pose.position.x, z: 0 });
    expect(egoWest?.pose.yaw).toBe(0);
    expect(west.roads.find((r) => r.id === 'major')?.centreline.every((p) => p.x === 0)).toBe(true);
    // No mirroring: the ego still drives on the left of its road in the world frame.
    const egoLane = west.lanes.find((l) => l.id === egoWest?.laneId);
    expect(egoLane?.centreline[0]?.y).toBeGreaterThan(0);
  });

  it('rejects a major-road vehicle approach that is not a major-road direction after rotation', () => {
    const result = generator.generate(request({ parameters: { minorApproach: 'west' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((d) => d.code)).toContain('generator.parameter_incompatible');
  });
});

describe('development generator: signals', () => {
  it('derives aspect state and permissions from the parameters through aspect bindings', () => {
    const world = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS) });
    const controller = world.signalControllers[0];
    expect(controller).toBeDefined();
    const lit = controller?.aspectStates.filter((s) => s.state === 'lit').map((s) => `${s.headId}:${s.slot}`).sort();
    expect(lit).toEqual([`${SIGNAL_IDS.entities.nbHead}:circular_green`, `${SIGNAL_IDS.entities.nbHead}:right_arrow_red`, `${SIGNAL_IDS.entities.sbHead}:circular_green`, `${SIGNAL_IDS.entities.sbHead}:right_arrow_red`].sort());
    const permission = (id: string) => controller?.movementPermissions.find((p) => p.movementId === id);
    expect(permission(SIGNAL_IDS.movements.nbRight)?.permission).toBe('stop');
    // Precedence order: the lit red arrow outranks the circular green for the bound right turn.
    expect(permission(SIGNAL_IDS.movements.nbRight)?.governedByAspects).toEqual([
      { headId: SIGNAL_IDS.entities.nbHead, slot: 'right_arrow_red' },
      { headId: SIGNAL_IDS.entities.nbHead, slot: 'circular_green' },
    ]);
    expect(permission(SIGNAL_IDS.movements.nbStraight)?.permission).toBe('proceed_permissive');
    expect(permission(SIGNAL_IDS.movements.nbLeft)?.permission).toBe('proceed_permissive');
    expect(permission(SIGNAL_IDS.movements.ebStraight)?.governedByAspects).toEqual([]);
  });

  it('a lit red arrow stops the right turn for any circular state, and a dark arrow hands it to the circular', () => {
    for (const circular of ['red', 'amber', 'green'] as const) {
      const world = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS), parameters: { nsCircular: circular, nsRightArrow: 'red' } });
      const right = world.signalControllers[0]?.movementPermissions.find((p) => p.movementId === SIGNAL_IDS.movements.nbRight);
      expect(right?.permission).toBe('stop');
    }
    const dark = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS), parameters: { nsCircular: 'green', nsRightArrow: 'dark' } });
    const right = dark.signalControllers[0]?.movementPermissions.find((p) => p.movementId === SIGNAL_IDS.movements.nbRight);
    expect(right?.permission).toBe('proceed_permissive');
    expect(dark.signalControllers[0]?.aspectStates.filter((s) => s.slot.startsWith('right_arrow') && s.state === 'lit')).toEqual([]);
  });

  it('signal state is an answer-bearing parameter, never a seed effect', () => {
    const a = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS), seed: seed('x') });
    const b = generate({ templateRef: templateRef(TEMPLATE_SIGNALISED_CROSSROADS), seed: seed('y') });
    expect(canonicalJson(a.signalControllers)).toBe(canonicalJson(b.signalControllers));
    expect(canonicalJson(a.signalHeads)).toBe(canonicalJson(b.signalHeads));
  });
});

describe('development generator: provenance and immutability', () => {
  it('records generator/schema/template versions, seed, registry hash, source profile and parameters', () => {
    const world = generate({ seed: seed('prov'), parameters: { egoMovement: 'right' } });
    expect(world.provenance.key).toEqual({
      generatorVersion: GENERATOR_VERSION,
      worldSchemaVersion: WORLD_SCHEMA_VERSION,
      template: { id: TEMPLATE_GIVE_WAY_T.id, version: 1 },
      seed: 'prov',
      assetRegistryHash: DEVELOPMENT_ASSET_REGISTRY_HASH,
      sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
    });
    expect(world.provenance.generatedAt).toBeNull();
    expect(world.provenance.status).toBe('generated');
    expect(world.provenance.usesQuarantinedAssets).toBe(true);
    expect(world.provenance.parameters.egoMovement).toBe('right');
    expect(world.provenance.parameters.minorApproach).toBe('south');
    expect(world.provenance.notes.join('\n')).toMatch(/not release content/);
    expect(world.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(world.conventions.trafficSide).toBe('LEFT');
  });

  it('preserves source references from the fixtures verbatim', () => {
    for (const { template, fixture } of DEFAULT_REQUESTS) {
      const world = generate({ templateRef: templateRef(template) });
      const refs = (w: DeepReadonly<World>) => canonicalJson([...w.markings, ...w.signFaces, ...w.signalHeads].map((e) => ({ id: e.id, sourceRefs: e.sourceRefs, asset: e.asset })));
      expect(refs(world)).toBe(refs(fixture));
    }
  });

  it('returns deeply frozen worlds', () => {
    const world = generate();
    expect(Object.isFrozen(world)).toBe(true);
    expect(Object.isFrozen(world.movements)).toBe(true);
    expect(Object.isFrozen(world.movements[0])).toBe(true);
    expect(Object.isFrozen(world.movements[0]?.conflictsWith)).toBe(true);
    expect(Object.isFrozen(world.lanes[0]?.centreline[0])).toBe(true);
    expect(Object.isFrozen(world.provenance.key)).toBe(true);
    expect(() => {
      (world.movements as unknown as unknown[]).push(null);
    }).toThrow();
  });
});

describe('development generator: request validation', () => {
  it('rejects unknown templates and unknown template versions', () => {
    const unknown = generator.generate(request({ templateRef: { id: templateId('sg.nonexistent'), version: 1 } }));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.diagnostics.map((d) => d.code)).toEqual(['generator.unknown_template']);
    const version = generator.generate(request({ templateRef: { id: TEMPLATE_GIVE_WAY_T.id, version: 2 } }));
    expect(version.ok).toBe(false);
    if (!version.ok) expect(version.diagnostics.map((d) => d.code)).toEqual(['generator.unknown_template_version']);
  });

  it('rejects a schema version or source profile the generator was not authored for', () => {
    const schema = generator.generate(request({ schemaVersion: 2 }));
    expect(schema.ok).toBe(false);
    if (!schema.ok) expect(schema.diagnostics.map((d) => d.code)).toContain('generator.schema_version');
    const profile = generator.generate(request({ sourceProfileId: 'sg-sources-1999-01' }));
    expect(profile.ok).toBe(false);
    if (!profile.ok) expect(profile.diagnostics.map((d) => d.code)).toEqual(['generator.unknown_source_profile']);
  });

  it('rejects undeclared parameters, wrong kinds and values outside the allowed set', () => {
    const undeclared = generator.generate(request({ parameters: { weather: 'rain' } }));
    expect(undeclared.ok).toBe(false);
    if (!undeclared.ok) expect(undeclared.diagnostics.map((d) => d.code)).toEqual(['generator.unknown_parameter']);
    const kind = generator.generate(request({ parameters: { egoMovement: 3 } }));
    expect(kind.ok).toBe(false);
    if (!kind.ok) expect(kind.diagnostics.map((d) => d.code)).toEqual(['generator.parameter_kind']);
    const value = generator.generate(request({ parameters: { egoMovement: 'u_turn' } }));
    expect(value.ok).toBe(false);
    if (!value.ok) expect(value.diagnostics.map((d) => d.code)).toEqual(['generator.parameter_not_allowed']);
  });

  it('never throws for any allowed parameter combination of any template', () => {
    for (const template of DEVELOPMENT_TEMPLATES) {
      const combos: Record<string, string | number | boolean>[] = [{}];
      for (const p of template.parameters) {
        const next: Record<string, string | number | boolean>[] = [];
        for (const c of combos) for (const v of p.allowed) next.push({ ...c, [p.name]: v });
        combos.splice(0, combos.length, ...next);
      }
      for (const parameters of combos) {
        const result = generator.generate(request({ templateRef: templateRef(template), parameters }));
        if (result.ok) {
          expect(checkWorldStructure(result.world).filter((d) => d.severity === 'error')).toEqual([]);
        } else {
          expect(result.diagnostics.map((d) => d.code)).toEqual(['generator.parameter_incompatible']);
        }
      }
    }
  });
});
