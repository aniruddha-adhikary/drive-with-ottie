import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  WORLD_SCHEMA_VERSION,
  type DeepReadonly,
  type GenerationRequest,
  type Template,
  type World,
  assetId,
  seed,
  worldId,
} from '@ottie/contracts';
import {
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_TEMPLATES,
  DEVELOPMENT_WORLDS,
  EXTRACTED_DEVELOPMENT_ASSETS,
  FIXTURE_SOURCE_PROFILE_ID,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  SIGNAL_IDS,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
} from '@ottie/contracts/fixtures';
import {
  compileRegistry,
  createRegistryResolver,
  curationFromDefinitions,
} from '@ottie/asset-registry';
import { createDevelopmentGenerator } from '@ottie/scenario-core';
import { loadStarterContent, validateWorld } from '@ottie/scenario-validation';
import { computeRegistryHash } from '../../asset-registry/src/hash.node';
import { loadExtractionLibrary } from '../../asset-registry/src/library.node';
import { codes, errors, expectError, expectValid, mutate, summarise } from './helpers';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function enumCombinations(template: Template): readonly Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const parameter of template.parameters) {
    if (parameter.kind !== 'enum') continue;
    combos = combos.flatMap((c) =>
      parameter.allowed.map((v) => ({ ...c, [parameter.name]: String(v) })),
    );
  }
  return combos;
}

interface Generated {
  readonly template: string;
  readonly parameters: Record<string, string>;
  readonly seed: string;
  readonly world: DeepReadonly<World>;
}

function generateAll(): { readonly worlds: Generated[]; readonly incompatible: number } {
  const generator = createDevelopmentGenerator();
  const worlds: Generated[] = [];
  let incompatible = 0;
  for (const template of DEVELOPMENT_TEMPLATES) {
    for (const parameters of enumCombinations(template)) {
      for (const s of ['seed-a', 'seed-b']) {
        const request: GenerationRequest = {
          id: worldId(`gen-${s}`),
          schemaVersion: WORLD_SCHEMA_VERSION,
          templateRef: { id: template.id, version: template.version },
          seed: seed(s),
          sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
          parameters,
          contentBundle: null,
          views: ['plan', 'study_oblique', 'approach_ego', 'entity_detail'],
        };
        const result = generator.generate(request);
        if (!result.ok) {
          expect(result.diagnostics.map((d) => d.code)).toContain(
            'generator.parameter_incompatible',
          );
          incompatible += 1;
          continue;
        }
        worlds.push({ template: template.id, parameters, seed: s, world: result.world });
      }
    }
  }
  return { worlds, incompatible };
}

const GENERATED = generateAll();

/**
 * Authored findings in C2's layouts that the validators must keep reporting until T1/I1 repair
 * them. Each entry names the exact code and the parameter shape that produces it; anything else
 * failing in a generated world is a validator or generator bug and fails the suite.
 */
const KNOWN_C2_FINDINGS: readonly {
  readonly template: string;
  readonly code: string;
  readonly when: (p: Record<string, string>) => boolean;
}[] = [
  {
    // The minor-road left turn never crosses a major-road vehicle coming from the far side, yet the
    // layout still emits `ev.priority-relationship` between the two movements.
    template: 'sg.t-junction.give-way',
    code: 'question_evidence.priority_evidence_without_conflict',
    when: (p) =>
      p.egoMovement === 'left' &&
      ((p.minorApproach === 'south' && p['majorRoadVehicle.approach'] === 'west') ||
        (p.minorApproach === 'north' && p['majorRoadVehicle.approach'] === 'east') ||
        (p.minorApproach === 'east' && p['majorRoadVehicle.approach'] === 'south') ||
        (p.minorApproach === 'west' && p['majorRoadVehicle.approach'] === 'north')),
  },
  {
    // Both north-south heads share one state, so a green right arrow (protected turn) is lit while the
    // opposing straight movement proceeds on circular green: conflicting movements released together.
    template: 'sg.crossroads.signalised',
    code: 'signal_movements.unsupported_phase_combination',
    when: (p) => p.nsCircular === 'green' && p.nsRightArrow === 'green',
  },
];

describe('C2 generated worlds across every declared parameter combination', () => {
  it('generates or reports incompatibility for every combination, two seeds each', () => {
    const combos = DEVELOPMENT_TEMPLATES.reduce((n, t) => n + enumCombinations(t).length, 0) * 2;
    expect(GENERATED.worlds.length + GENERATED.incompatible).toBe(combos);
    expect(GENERATED.worlds.length).toBeGreaterThan(200);
  });

  it('default-parameter worlds (the fixture equivalents) are semantically valid', () => {
    const generator = createDevelopmentGenerator();
    for (const template of DEVELOPMENT_TEMPLATES) {
      const result = generator.generate({
        id: worldId('gen-default'),
        schemaVersion: WORLD_SCHEMA_VERSION,
        templateRef: { id: template.id, version: template.version },
        seed: seed('default'),
        sourceProfileId: FIXTURE_SOURCE_PROFILE_ID,
        parameters: {},
        contentBundle: null,
        views: ['plan'],
      });
      if (!result.ok)
        throw new Error(
          summarise({ ok: false, diagnostics: result.diagnostics, validatorsRun: [] }),
        );
      expectValid(validateWorld(result.world));
    }
  });

  it('every generated world is valid except for the documented C2 authoring findings', () => {
    const unexpected: string[] = [];
    const seenFindings = new Set<string>();
    for (const g of GENERATED.worlds) {
      const report = validateWorld(g.world);
      const known = KNOWN_C2_FINDINGS.filter(
        (f) => f.template === g.template && f.when(g.parameters),
      );
      const allowed = new Set(known.map((f) => f.code));
      for (const code of codes(errors(report))) {
        if (allowed.has(code)) seenFindings.add(code);
        else
          unexpected.push(`${g.template} ${JSON.stringify(g.parameters)} [${g.seed}] -> ${code}`);
      }
      if (known.length > 0)
        expect(
          report.ok,
          `${g.template} ${JSON.stringify(g.parameters)} should still report ${[...allowed].join(',')}`,
        ).toBe(false);
    }
    expect(unexpected).toEqual([]);
    expect([...seenFindings].sort()).toEqual(KNOWN_C2_FINDINGS.map((f) => f.code).sort());
  });

  it('a dark right arrow hands the right turn to the circular aspect (Rule 11: circular green permits movements with no lit arrow)', () => {
    const dark = GENERATED.worlds.filter(
      (g) => g.template === 'sg.crossroads.signalised' && g.parameters.nsRightArrow === 'dark',
    );
    expect(dark.length).toBeGreaterThan(0);
    for (const g of dark) expectValid(validateWorld(g.world));
  });

  it('a generated red-arrow world still rejects a permission that lets the right turn proceed', () => {
    const g = GENERATED.worlds.find(
      (w) =>
        w.template === 'sg.crossroads.signalised' &&
        w.parameters.nsCircular === 'green' &&
        w.parameters.nsRightArrow === 'red',
    );
    if (!g) throw new Error('no generated red-arrow world');
    const mutated = mutate(g.world, (d) => {
      d.signalControllers = d.signalControllers.map((c) => ({
        ...c,
        movementPermissions: c.movementPermissions.map((p) =>
          p.movementId === SIGNAL_IDS.movements.nbRight
            ? { ...p, permission: 'proceed_permissive' as const }
            : p,
        ),
      }));
    });
    expectError(validateWorld(mutated), 'signal_movements.permission_contradicts_lit_red_arrow');
  });
});

describe('real C1 registry (assets/sg manifests)', () => {
  const library = loadExtractionLibrary(REPO_ROOT);
  const registry = compileRegistry(library, {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((a) => a.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);

  it('the fixtures validate against the compiled real registry in explicit development quarantine', () => {
    const assets = createRegistryResolver(
      registry,
      { mode: 'development', loadQuarantined: true },
      registryHash,
    );
    const sources = [...loadStarterContent().sources, ...registry.sources];
    for (const world of DEVELOPMENT_WORLDS) expectValid(validateWorld(world, { assets, sources }));
  });

  it('finding for I1: manifest source ids (tp, sup, ...) are not the ids of the official source register, although they hash to the same documents', () => {
    const assets = createRegistryResolver(
      registry,
      { mode: 'development', loadQuarantined: true },
      registryHash,
    );
    const report = validateWorld(SIGNALISED_JUNCTION_RIGHT_ARROW, { assets });
    const unknown = expectError(report, 'source_applicability.unknown_source');
    expect(unknown.message).toMatch(/source 'tp'/);

    const handbookByManifest = registry.sources.find((s) => s.id === 'tp');
    const handbookByRegister = loadStarterContent().sources.find((s) => s.id === 'spf-btt-2026');
    expect(handbookByManifest?.sha256).toBeDefined();
    expect(handbookByManifest?.sha256).toBe(handbookByRegister?.sha256);
  });

  it('nothing in the real registry is release-resolvable, so every fixture is rejected for learners', () => {
    const assets = createRegistryResolver(registry, { mode: 'release' }, registryHash);
    for (const world of DEVELOPMENT_WORLDS) {
      const report = validateWorld(world, { target: 'learner_release', assets });
      expectError(report, 'source_applicability.development_fixture_in_release');
      const unresolved = errors(report).filter(
        (d) => d.code === 'source_applicability.asset_unresolved',
      );
      expect(unresolved.length).toBe(
        world.markings.length +
          world.supports.length +
          world.signFaces.length +
          world.signalHeads.length +
          world.actors.filter((a) => a.asset).length,
      );
    }
  });

  it('the stale bus-lane hours board is blocked with its conflict preserved: unresolvable even under development quarantine', () => {
    const ref = { id: assetId('sg.informatory.bus-lane-full-day-source-hours'), version: 1 };
    const compiled = registry.assets.find((a) => a.id === ref.id);
    expect(compiled?.review.extractionStatus).toBe('blocked');
    expect(
      compiled?.review.warnings.some((w) =>
        w.includes('CONFLICT: source artwork says 07:30-20:00'),
      ),
    ).toBe(true);
    const release = createRegistryResolver(registry, { mode: 'release' }, registryHash).resolve(
      ref,
    );
    expect(release.ok).toBe(false);
    if (!release.ok) {
      expect(release.reason).toBe('blocked');
      expect(release.detail).toMatch(/NEVER release this as a current operating-hours asset/);
    }

    // C1 lets an explicitly quarantined development resolver load it; the validator must then still
    // refuse the world, because the record carries a known official-source conflict.
    const development = createRegistryResolver(
      registry,
      { mode: 'development', loadQuarantined: true },
      registryHash,
    );
    expect(development.resolve(ref).ok).toBe(true);
    const world = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.signFaces = d.signFaces.map((f) =>
        f.id === GIVE_WAY_IDS.entities.giveWaySign ? { ...f, asset: ref } : f,
      );
    });
    const report = validateWorld(world, {
      assets: development,
      sources: [...loadStarterContent().sources, ...registry.sources],
    });
    const conflict = expectError(report, 'source_applicability.source_conflict_unresolved');
    expect(conflict.message).toMatch(/07:30-20:00/);
    expect(conflict.message).toMatch(/07:30-23:00/);
    expectError(report, 'control_completeness.missing_required_control');
  });
});
