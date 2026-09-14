import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  WORLD_SCHEMA_VERSION,
  type DeepReadonly,
  type Diagnostic,
  type ValidationReport,
  type World,
  seed,
  worldId,
} from '@ottie/contracts';
import {
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_ASSET_REGISTRY_HASH,
  DEVELOPMENT_TEMPLATES,
  EXTRACTED_DEVELOPMENT_ASSETS,
  FIXTURE_SOURCE_PROFILE_ID,
} from '@ottie/contracts/fixtures';
import { compileRegistry, createRegistryResolver, curationFromDefinitions } from '@ottie/asset-registry';
import { GENERATOR_VERSION, createDevelopmentGenerator } from '@ottie/scenario-core';
import { loadStarterContent, validateWorld } from '@ottie/scenario-validation';
import { computeRegistryHash } from '../../packages/asset-registry/src/hash.node';
import { loadExtractionLibrary } from '../../packages/asset-registry/src/library.node';
import {
  type AuthoredWorld,
  type ScenarioPackage,
  comparisonGenerationRequest,
  generatePackageWorlds,
  generationRequest,
  loadStarterPackages,
} from './starter-packages';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIEWS = ['plan', 'study_oblique', 'approach_ego', 'entity_detail'] as const;

const PACKAGES = loadStarterPackages();
const SCENARIOS = PACKAGES.map((p) => p.scenario);
const STARTER = loadStarterContent();
const GENERATED = SCENARIOS.flatMap((pkg) => generatePackageWorlds(pkg));

function errors(report: ValidationReport): readonly Diagnostic[] {
  return report.diagnostics.filter((d) => d.severity === 'error');
}

function expectValid(report: ValidationReport): void {
  expect(errors(report).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(report.ok).toBe(true);
}

function physicalIds(world: DeepReadonly<World>): readonly string[] {
  return [
    ...world.markings,
    ...world.supports,
    ...world.signFaces,
    ...world.signalHeads,
    ...world.signalControllers,
    ...world.actors,
  ].map((e) => e.id);
}

function allEntityIds(world: DeepReadonly<World>): ReadonlySet<string> {
  return new Set([
    ...physicalIds(world),
    ...world.lanes.map((l) => l.id),
    ...world.movements.map((m) => m.id),
    ...world.roads.map((r) => r.id),
    ...world.anchors.map((a) => a.id),
  ]);
}

function assetOf(world: DeepReadonly<World>, id: string): string | null {
  const entity = [...world.markings, ...world.supports, ...world.signFaces, ...world.signalHeads, ...world.actors].find(
    (e) => e.id === id,
  );
  return entity?.asset?.id ?? null;
}

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8')) as Record<string, unknown>;
}

const registryContext = (() => {
  const library = loadExtractionLibrary(REPO_ROOT);
  const registry = compileRegistry(library, {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((a) => a.provenance.family === 'runtime'),
  });
  const assets = createRegistryResolver(
    registry,
    { mode: 'development', loadQuarantined: true },
    computeRegistryHash(registry.assets),
  );
  return { assets, sources: [...STARTER.sources, ...registry.sources] };
})();

describe('T1 starter scenario packages: identity and pins', () => {
  it('exactly three packages cover Give Way, STOP and the circular-green/red-right-arrow signal, all development-only', () => {
    expect(SCENARIOS.map((p) => p.template.id).sort()).toEqual(
      ['sg.crossroads.signalised', 'sg.t-junction.give-way', 'sg.t-junction.stop'].sort(),
    );
    for (const pkg of SCENARIOS) expect(pkg.reviewStatus).toBe('development');
  });

  it('package, world and comparison ids are unique across all packages', () => {
    const ids = [
      ...SCENARIOS.map((p) => p.id),
      ...SCENARIOS.flatMap((p) => p.worlds.map((w) => w.worldId as string)),
      ...SCENARIOS.flatMap((p) => p.comparisons.map((c) => c.id)),
      ...SCENARIOS.flatMap((p) => p.comparisons.flatMap((c) => (c.generation ? [c.generation.worldId as string] : []))),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template ref names a development template at its current version, and every parameter is declared', () => {
    for (const pkg of SCENARIOS) {
      const template = DEVELOPMENT_TEMPLATES.find((t) => t.id === pkg.template.id);
      expect(template, pkg.id).toBeDefined();
      expect(template?.version).toBe(pkg.template.version);
      const declared = new Set(template?.parameters.map((p) => p.name));
      for (const w of pkg.worlds) {
        for (const [name, value] of Object.entries(w.parameters)) {
          const spec = template?.parameters.find((p) => p.name === name);
          expect(declared.has(name), `${w.worldId} parameter ${name}`).toBe(true);
          if (spec?.kind === 'enum') expect(spec.allowed, `${w.worldId} ${name}=${String(value)}`).toContain(value);
        }
      }
    }
  });

  it('pins match the shared generator, world schema, source profile and development registry hash', () => {
    for (const pkg of SCENARIOS) {
      expect(pkg.pins.generatorVersion).toBe(GENERATOR_VERSION);
      expect(pkg.pins.worldSchemaVersion).toBe(WORLD_SCHEMA_VERSION);
      expect(pkg.pins.sourceProfileId).toBe(FIXTURE_SOURCE_PROFILE_ID);
      expect(pkg.pins.assetRegistryHash).toBe(DEVELOPMENT_ASSET_REGISTRY_HASH);
      for (const w of pkg.worlds) expect([...w.views]).toEqual([...VIEWS]);
    }
  });

  it('every source locator names a registered A3 official source', () => {
    const known = new Set(STARTER.sources.map((s) => s.id as string));
    for (const pkg of SCENARIOS) {
      for (const ref of pkg.sourceRefs) expect(known, `${pkg.id} ${ref.sourceId}`).toContain(ref.sourceId);
      for (const c of pkg.assetCandidates) if (c.sourceLocator) expect(known).toContain(c.sourceLocator.sourceId);
    }
  });
});

describe('T1 starter scenario packages: generated worlds', () => {
  it('every authored world is generated by the shared generator with the pinned provenance and canonical hash, deterministically', () => {
    const generator = createDevelopmentGenerator();
    for (const { pkg, authored, world } of GENERATED) {
      expect(world.id).toBe(authored.worldId);
      expect(world.schemaVersion).toBe(pkg.pins.worldSchemaVersion);
      expect(world.provenance.key).toEqual({
        generatorVersion: pkg.pins.generatorVersion,
        worldSchemaVersion: pkg.pins.worldSchemaVersion,
        template: { id: pkg.template.id, version: pkg.template.version },
        seed: authored.seed,
        assetRegistryHash: pkg.pins.assetRegistryHash,
        sourceProfileId: pkg.pins.sourceProfileId,
      });
      expect(world.provenance.canonicalHash, authored.worldId).toBe(authored.canonicalHash);
      expect(world.provenance.status).toBe('generated');
      expect(world.provenance.usesQuarantinedAssets).toBe(true);
      expect(Object.isFrozen(world)).toBe(true);
      expect(Object.isFrozen(world.actors)).toBe(true);

      const again = generator.generate(generationRequest(pkg, authored));
      expect(again.ok && again.world.provenance.canonicalHash).toBe(authored.canonicalHash);
    }
  });

  it('every authored world passes V1 against the development context (A3 sources, rules, terms, quarantined assets)', () => {
    for (const { world } of GENERATED) expectValid(validateWorld(world));
  });

  it('every authored world passes V1 against the compiled C1 registry with registry sources alongside the A3 register', () => {
    for (const { world } of GENERATED) expectValid(validateWorld(world, registryContext));
  });

  it('every entity and evidence id the package exports resolves in its generated world', () => {
    for (const { authored, world } of GENERATED) {
      const entities = allEntityIds(world);
      for (const [key, id] of Object.entries(authored.entities)) {
        expect(entities.has(id), `${authored.worldId} entities.${key}=${id}`).toBe(true);
      }
      const evidence = new Set(world.evidence.map((e) => e.id));
      for (const [key, id] of Object.entries(authored.evidenceIds)) {
        expect(evidence.has(id), `${authored.worldId} evidenceIds.${key}=${id}`).toBe(true);
      }
      expect([...evidence].sort()).toEqual(Object.values(authored.evidenceIds).sort());
    }
  });

  it('the ego is the only ego actor, its declared movement matches the pinned egoMovement, and it sits upstream of its control line', () => {
    for (const { authored, world } of GENERATED) {
      const egos = world.actors.filter((a) => a.isEgo);
      expect(egos).toHaveLength(1);
      const ego = egos[0];
      if (!ego) throw new Error(`${authored.worldId} has no ego`);
      expect(ego.id).toBe(authored.entities.ego);
      expect(ego.laneId).toBe(authored.entities.egoLane);
      expect(ego.movementId).toBe(authored.entities.egoMovement);
      const movement = world.movements.find((m) => m.id === ego.movementId);
      expect(movement?.turn).toBe(authored.parameters.egoMovement);
      expect(ego.intention).toBe(movement?.turn);
    }
  });
});

describe('T1 starter scenario packages: traffic consistency', () => {
  const byId = new Map(GENERATED.map((g) => [g.authored.worldId as string, g] as const));

  function generated(id: string) {
    const g = byId.get(id);
    if (!g) throw new Error(`no generated world ${id}`);
    return g;
  }

  it('Give Way right turn: the lorry approaches on the major road from the ego LEFT and its straight movement really conflicts with the ego right turn', () => {
    const { authored, world } = generated('starter.give-way.right-turn-lorry-from-left');
    const lorry = world.actors.find((a) => a.id === authored.entities.lorry);
    expect(lorry?.category).toBe('lorry');
    expect(lorry?.isEgo).toBe(false);
    expect(lorry?.laneId as string).toBe(authored.entities.lorryLane);
    expect(lorry?.movementId as string).toBe(authored.entities.lorryMovement);

    const egoLane = world.lanes.find((l) => (l.id as string) === authored.entities.egoLane);
    const lorryLane = world.lanes.find((l) => (l.id as string) === authored.entities.lorryLane);
    // Ego heads north (+y); a lorry travelling east (+x) comes from the west, i.e. from the ego's left.
    expect(Math.cos(egoLane?.heading ?? 0)).toBeCloseTo(0, 6);
    expect(Math.sin(egoLane?.heading ?? 0)).toBeCloseTo(1, 6);
    expect(Math.cos(lorryLane?.heading ?? 0)).toBeCloseTo(1, 6);
    const lorryStart = lorryLane?.centreline[0];
    const egoStart = egoLane?.centreline[0];
    expect((lorryStart?.x ?? 0) < (egoStart?.x ?? 0)).toBe(true);

    const egoMovement = world.movements.find((m) => (m.id as string) === authored.entities.egoMovement);
    expect(egoMovement?.conflictsWith as readonly string[]).toContain(authored.entities.lorryMovement);
    expect(egoMovement?.yieldsTo as readonly string[]).toContain(authored.entities.lorryMovement);
    expect(egoMovement?.priority).toBe('yield');

    const priority = world.evidence.find((e) => e.id === authored.evidenceIds.priority);
    expect(priority?.requiredDetail).toBe('relative_position');
    expect([...(priority?.targetEntityIds ?? [])].sort()).toEqual(
      [authored.entities.egoMovement, authored.entities.lorryMovement].sort(),
    );
    const lorryEvidence = world.evidence.find((e) => e.id === authored.evidenceIds.majorLorry);
    expect(lorryEvidence?.targetEntityIds as readonly string[]).toContain(authored.entities.lorry);
  });

  it('Give Way left turn with the major road clear: no major-road actor and no priority evidence are emitted', () => {
    const { authored, world } = generated('starter.give-way.left-turn-clear-major-road');
    expect(world.actors.map((a) => a.id)).toEqual([authored.entities.ego]);
    expect(world.evidence.some((e) => e.id === 'ev.priority-relationship' || e.id === 'ev.major-lorry')).toBe(false);
    expect(world.controlRegime).toBe('give_way');
  });

  it('STOP: the local-road car approaches from the ego RIGHT, the ego movement yields to it, and the ego front is upstream of the stop line', () => {
    const { authored, world } = generated('starter.stop.right-turn-car-from-right');
    const egoLane = world.lanes.find((l) => (l.id as string) === authored.entities.egoLane);
    const crossingLane = world.lanes.find((l) => (l.id as string) === authored.entities.crossingLane);
    // Ego heads west (-x); a car travelling south (-y) comes from the north, i.e. from the ego's right.
    expect(Math.cos(egoLane?.heading ?? 0)).toBeCloseTo(-1, 6);
    expect(Math.sin(crossingLane?.heading ?? 0)).toBeCloseTo(-1, 6);
    expect((crossingLane?.centreline[0]?.y ?? 0) > (egoLane?.centreline[0]?.y ?? 0)).toBe(true);

    const car = world.actors.find((a) => a.id === authored.entities.crossingCar);
    expect(car?.category).toBe('car');
    expect(car?.laneId as string).toBe(authored.entities.crossingLane);
    expect(car?.movementId as string).toBe(authored.entities.crossingMovement);

    const egoMovement = world.movements.find((m) => (m.id as string) === authored.entities.egoMovement);
    expect(egoMovement?.priority).toBe('stop_then_yield');
    expect(egoMovement?.yieldsTo as readonly string[]).toContain(authored.entities.crossingMovement);
    expect(world.controlRegime).toBe('stop');

    const beforeLine = world.evidence.find((e) => e.id === authored.evidenceIds.egoFrontBeforeLine);
    expect(beforeLine?.requiredDetail as string).toBe('relative_position');
    expect([...(beforeLine?.targetEntityIds ?? [])].sort()).toEqual(
      [authored.entities.ego, authored.entities.stopLine].sort(),
    );
    const stopLine = world.markings.find((m) => m.id === authored.entities.stopLine);
    expect(stopLine?.role).toBe('stop_line');
    expect(stopLine?.applicableLaneIds as readonly string[]).toContain(authored.entities.egoLane);
  });

  it('Signal: circular green lit and right arrow red lit; the right turn is stopped by the arrow while straight proceeds on the circular', () => {
    for (const id of ['starter.signal.right-turn-green-with-red-arrow', 'starter.signal.straight-green-with-red-arrow']) {
      const { authored, world } = generated(id);
      const controller = world.signalControllers.find((c) => c.id === authored.entities.controller);
      const nbHead = authored.entities.nbHead;
      if (!nbHead) throw new Error(`${id} has no nbHead entity`);
      const lit = (headId: string, slot: string) =>
        controller?.aspectStates.find((s) => s.headId === headId && s.slot === slot)?.state;
      expect(lit(nbHead, 'circular_green')).toBe('lit');
      expect(lit(nbHead, 'right_arrow_red')).toBe('lit');
      expect(lit(nbHead, 'circular_red')).toBe('dark');
      expect(lit(nbHead, 'right_arrow_green')).toBe('dark');

      const permission = (movementId: string) =>
        controller?.movementPermissions.find((p) => p.movementId === movementId);
      const right = permission('ns.with.0.right');
      expect(right?.permission).toBe('stop');
      expect(right?.governedByAspects[0]).toEqual({ headId: nbHead, slot: 'right_arrow_red' });
      const straight = permission('ns.with.0.straight');
      expect(straight?.permission).toBe('proceed_permissive');
      expect(straight?.governedByAspects[0]).toEqual({ headId: nbHead, slot: 'circular_green' });

      const head = world.signalHeads.find((h) => h.id === nbHead);
      expect(head?.applicableLaneIds as readonly string[]).toContain(authored.entities.egoLane);
      // Approach-facing: the northbound head faces south (-y) towards the approaching ego.
      expect(head?.frontNormal.y).toBeLessThan(0);

      const oncoming = world.actors.find((a) => a.id === authored.entities.oncoming);
      expect(oncoming?.movementId as string).toBe(authored.entities.oncomingMovement);
      const egoMovement = world.movements.find((m) => (m.id as string) === authored.entities.egoMovement);
      const conflictsWithOncoming = (egoMovement?.conflictsWith as readonly string[] | undefined)?.includes(
        authored.entities.oncomingMovement ?? '',
      );
      expect(conflictsWithOncoming).toBe(authored.parameters.egoMovement === 'right');
      expect(world.controlRegime).toBe('signalised');
    }
  });

  it('unsignalised worlds have no signal heads or controllers, and no world places a pedestrian crossing', () => {
    for (const { pkg, world } of GENERATED) {
      if (pkg.template.id !== 'sg.crossroads.signalised') {
        expect(world.signalHeads).toEqual([]);
        expect(world.signalControllers).toEqual([]);
      }
      for (const marking of world.markings) {
        expect(marking.role).not.toMatch(/crossing/);
        expect(marking.asset.id).not.toMatch(/crossing|zebra/);
      }
      for (const face of world.signFaces) expect(face.asset.id).not.toMatch(/crossing|zebra|pedestrian/);
      expect(world.actors.some((a) => a.category === 'pedestrian')).toBe(false);
    }
  });

  it('every physical control in every world faces its approach (front normal opposes the approaching lane heading)', () => {
    for (const { world } of GENERATED) {
      for (const control of [...world.signFaces, ...world.signalHeads]) {
        const heading = control.intendedApproach.heading;
        const dot = control.frontNormal.x * Math.cos(heading) + control.frontNormal.y * Math.sin(heading);
        expect(dot, control.id).toBeLessThan(-0.99);
      }
    }
  });
});

describe('T1 starter scenario packages: A1/A2 candidate bindings', () => {
  it('every asset candidate names the asset the generated world actually places on that entity', () => {
    for (const { pkg, authored, world } of GENERATED) {
      for (const candidate of pkg.assetCandidates) {
        const entity = authored.entities[candidate.entityKey];
        expect(entity, `${pkg.id} ${candidate.entityKey}`).toBeDefined();
        expect(assetOf(world, entity ?? ''), `${authored.worldId} ${candidate.entityKey}`).toBe(candidate.runtimeAssetId);
        const support = world.supports.find((s) => s.id === entity);
        if (support) expect(support.dimensionsStatus).toBe(candidate.worldDimensionsStatus);
        else expect(candidate.worldDimensionsStatus).toBeNull();
      }
    }
  });

  it('A1 candidate files exist, carry the same id, keep source millimetre dimensions and are still quarantined', () => {
    for (const pkg of SCENARIOS) {
      for (const candidate of pkg.assetCandidates) {
        if (!candidate.a1CandidateFile) {
          expect(candidate.a1CandidateId).toBeNull();
          continue;
        }
        const record = readJson(candidate.a1CandidateFile);
        expect(record.candidate_id).toBe(candidate.a1CandidateId);
        expect(record.release_ready).toBe(false);
        expect(record.content_approved).toBe(false);
        expect(record.reuse_approved).toBe(false);
        const face = record.face_mm as Record<string, unknown> | undefined;
        const parameters = record.parameters_mm as Record<string, unknown> | undefined;
        const dims = { ...(face ?? {}), ...(parameters ?? {}) };
        for (const [name, mm] of Object.entries(candidate.sourceDimensionsMm)) {
          if (mm === null) continue;
          expect(dims[name], `${candidate.a1CandidateId} ${name}`).toBe(mm);
        }
        if (Array.isArray(record.unknowns)) {
          for (const u of record.unknowns as string[]) expect(candidate.unknowns).toContain(u);
        }
      }
    }
  });

  it('A2 assembly files exist, carry the same id, are quarantined and keep their unresolved notes', () => {
    for (const pkg of SCENARIOS) {
      for (const candidate of pkg.assetCandidates) {
        if (!candidate.a2AssemblyFile) {
          expect(candidate.a2AssemblyId).toBeNull();
          continue;
        }
        const record = readJson(candidate.a2AssemblyFile);
        expect(record.id).toBe(candidate.a2AssemblyId);
        const status = record.status as Record<string, unknown>;
        expect(status.releaseReady).toBe(false);
        expect(status.contentApproved).toBe(false);
        expect(status.reuseApproved).toBe(false);
      }
    }
  });

  it('runtime dimensions of placed signs and markings match the A1 source millimetres converted to metres', () => {
    for (const { pkg, authored, world } of GENERATED) {
      for (const candidate of pkg.assetCandidates) {
        const face = world.signFaces.find((f) => f.id === authored.entities[candidate.entityKey]);
        if (!face) continue;
        const asset = DEVELOPMENT_ASSETS.find((a) => a.id === face.asset.id);
        expect(asset, face.asset.id).toBeDefined();
        const dims = asset?.geometry.kind === 'face' ? asset.geometry.face : null;
        expect(dims?.widthMm).toBe(candidate.sourceDimensionsMm.width);
        expect(dims?.heightMm).toBe(candidate.sourceDimensionsMm.height);
      }
    }
  });
});

describe('T1 starter scenario packages: comparisons stay separate from their base worlds', () => {
  it('every comparison names a base world in its own package, distinct ids, and delta entity ids that exist in that base world', () => {
    for (const pkg of SCENARIOS) {
      for (const c of pkg.comparisons) {
        const base = GENERATED.find((g) => g.authored.worldId === c.baseWorldId);
        expect(base, `${c.id} base ${c.baseWorldId}`).toBeDefined();
        expect(c.id).not.toBe(c.baseWorldId);
        if (!base) continue;
        const ids = allEntityIds(base.world);
        for (const ref of deltaEntityIds(c.delta)) expect(ids.has(ref), `${c.id} -> ${ref}`).toBe(true);
        expect(c.generation !== null || c.generationNote !== null).toBe(true);
      }
    }
  });

  it('regenerable comparison worlds differ from their base only where the delta says, validate under V1, and leave the base untouched', () => {
    const generator = createDevelopmentGenerator();
    for (const pkg of SCENARIOS) {
      for (const c of pkg.comparisons) {
        const request = comparisonGenerationRequest(pkg, c);
        if (!request) continue;
        const base = GENERATED.find((g) => g.authored.worldId === c.baseWorldId);
        if (!base) throw new Error(c.baseWorldId);
        const result = generator.generate(request);
        expect(result.ok, `${c.id}: ${result.ok ? '' : result.diagnostics.map((d) => d.code).join(',')}`).toBe(true);
        if (!result.ok) continue;
        const cmp = result.world;
        expect(cmp.id).not.toBe(base.world.id);
        expect(cmp.provenance.canonicalHash).toBe(c.generation?.canonicalHash);
        expect(cmp.provenance.canonicalHash).not.toBe(base.world.provenance.canonicalHash);
        expectValid(validateWorld(cmp));
        expectValid(validateWorld(cmp, registryContext));
        // Geometry is shared; only the delta's subject changes.
        expect(cmp.roads).toEqual(base.world.roads);
        expect(cmp.lanes).toEqual(base.world.lanes);
        expect(cmp.markings).toEqual(base.world.markings);
        expect(cmp.signFaces).toEqual(base.world.signFaces);
        if (c.kind === 'change_signal_state') {
          expect(cmp.actors).toEqual(base.world.actors);
          expect(cmp.signalControllers[0]?.aspectStates).not.toEqual(base.world.signalControllers[0]?.aspectStates);
          for (const change of (c.delta.aspectStates as readonly { headId: string; slot: string; state: string }[]) ?? []) {
            const after = cmp.signalControllers[0]?.aspectStates.find((s) => s.headId === change.headId && s.slot === change.slot);
            expect(after?.state, `${c.id} ${change.headId}/${change.slot}`).toBe(change.state);
          }
        }
        if (c.kind === 'swap_actor_class') {
          const actorId = c.delta.actorId as string;
          const before = base.world.actors.find((a) => a.id === actorId);
          const swapped = cmp.actors.find((a) => !a.isEgo);
          expect(before?.category).not.toBe(c.delta.toCategory);
          expect(swapped?.category).toBe(c.delta.toCategory);
          expect(cmp.actors.filter((a) => a.isEgo)).toEqual(base.world.actors.filter((a) => a.isEgo));
        }
        // Base world is immutable and its hash is unchanged after generating the comparison.
        const again = generator.generate(generationRequest(pkg, base.authored));
        expect(again.ok && again.world.provenance.canonicalHash).toBe(base.authored.canonicalHash);
      }
    }
  });

  it('the arrow-dark comparison hands the right turn back to the circular green (permissive), proving the change is only the arrow', () => {
    const pkg = SCENARIOS.find((p) => p.id === 'starter.signalised-crossroads-green-right-red');
    const c = pkg?.comparisons.find((x) => x.id === 'cmp.starter.signal.right-turn.arrow-dark');
    if (!pkg || !c) throw new Error('missing comparison');
    const request = comparisonGenerationRequest(pkg, c);
    const result = createDevelopmentGenerator().generate(request ?? (() => { throw new Error('no request'); })());
    if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(','));
    const right = result.world.signalControllers[0]?.movementPermissions.find((p) => p.movementId === 'ns.with.0.right');
    expect(right?.permission).toBe('proceed_permissive');
    expect(right?.governedByAspects[0]?.slot).toBe('circular_green');
  });
});

describe('T1 starter scenario packages: rejection diagnostics are preserved, not authored around', () => {
  const generator = createDevelopmentGenerator();

  function generate(pkg: ScenarioPackage, authored: AuthoredWorld, parameters: Record<string, string>) {
    return generator.generate({
      ...generationRequest(pkg, authored),
      id: worldId('t1-rejection-probe'),
      seed: seed('t1-rejection-probe'),
      parameters,
    });
  }

  function giveWay(): { pkg: ScenarioPackage; base: AuthoredWorld } {
    const pkg = SCENARIOS.find((p) => p.template.id === 'sg.t-junction.give-way');
    const base = pkg?.worlds[0];
    if (!pkg || !base) throw new Error('no give-way package');
    return { pkg, base };
  }

  it('Give Way: an allowed approach value that is not a major-road approach for the chosen minorApproach is rejected with generator.parameter_incompatible', () => {
    const { pkg, base } = giveWay();
    // With the minor road joining from the east the major road runs north–south, so an east/west vehicle approach is impossible.
    const result = generate(pkg, base, {
      minorApproach: 'east',
      egoMovement: 'right',
      'majorRoadVehicle.category': 'lorry',
      'majorRoadVehicle.approach': 'east',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((d) => d.code)).toContain('generator.parameter_incompatible');
  });

  it('Give Way: a value outside the declared enum is rejected with generator.parameter_not_allowed', () => {
    const { pkg, base } = giveWay();
    const result = generate(pkg, base, {
      minorApproach: 'south',
      egoMovement: 'right',
      'majorRoadVehicle.category': 'lorry',
      'majorRoadVehicle.approach': 'north',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((d) => d.code)).toContain('generator.parameter_not_allowed');
  });

  it('Give Way: the known left-turn/far-side configuration still fails V1 with priority_evidence_without_conflict, so it is not authored', () => {
    const { pkg, base } = giveWay();
    const result = generate(pkg, base, {
      minorApproach: 'south',
      egoMovement: 'left',
      'majorRoadVehicle.category': 'lorry',
      'majorRoadVehicle.approach': 'west',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = validateWorld(result.world);
    expect(report.ok).toBe(false);
    expect(errors(report).map((d) => d.code)).toContain('question_evidence.priority_evidence_without_conflict');
    for (const w of pkg.worlds) {
      const farSide = w.parameters.egoMovement === 'left' && w.parameters['majorRoadVehicle.approach'] === 'west';
      expect(farSide, `${w.worldId} must not use the far-side left-turn configuration`).toBe(false);
    }
  });

  it('Signal: green circular with green right arrow is still reported as unsupported_phase_combination, so the arrow-green comparison is declarative only', () => {
    const pkg = SCENARIOS.find((p) => p.template.id === 'sg.crossroads.signalised');
    const base = pkg?.worlds[0];
    if (!pkg || !base) throw new Error('no signal package');
    const result = generate(pkg, base, {
      egoApproach: 'south',
      egoMovement: 'right',
      nsCircular: 'green',
      nsRightArrow: 'green',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(errors(validateWorld(result.world)).map((d) => d.code)).toContain('signal_movements.unsupported_phase_combination');
    const arrowGreen = pkg.comparisons.find((c) => c.id === 'cmp.starter.signal.right-turn.arrow-green');
    expect(arrowGreen?.generation).toBeNull();
    expect(arrowGreen?.generationNote).toMatch(/unsupported_phase_combination/);
  });
});

function deltaEntityIds(delta: Readonly<Record<string, unknown>>): readonly string[] {
  const out: string[] = [];
  const visit = (value: unknown, key: string | null) => {
    if (Array.isArray(value)) value.forEach((v) => { visit(v, null); });
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, k);
    } else if (typeof value === 'string' && (key === 'id' || key === 'headId' || key === 'actorId')) out.push(value);
  };
  visit(delta, null);
  return out;
}
