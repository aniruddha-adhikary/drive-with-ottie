import {
  type DeepReadonly,
  type GenerationRequest,
  type GenerationResult,
  type Generator,
  type World,
  checkWorldStructure,
} from '@ottie/contracts';

/**
 * Generator that answers a request by returning the fixture whose provenance names the requested
 * template/version. Seed and parameters are ignored (fixtures are hand-authored) and an `info`
 * diagnostic says so, so nobody mistakes this for real generation.
 */
export function createFixtureGenerator(worlds: readonly DeepReadonly<World>[]): Generator {
  const byTemplate = new Map<string, DeepReadonly<World>>();
  for (const world of worlds) {
    byTemplate.set(`${world.provenance.key.template.id}@${world.provenance.key.template.version}`, world);
  }
  return {
    generatorVersion: 0,
    generate(request: GenerationRequest): GenerationResult {
      const key = `${request.templateRef.id}@${request.templateRef.version}`;
      const world = byTemplate.get(key);
      if (!world) {
        return {
          ok: false,
          diagnostics: [{ validator: 'structural_integrity', severity: 'error', code: 'generator.unknown_template', message: `no fixture for ${key}`, entityIds: [] }],
        };
      }
      const structural = checkWorldStructure(world);
      if (structural.some((d) => d.severity === 'error')) return { ok: false, diagnostics: structural };
      return {
        ok: true,
        world,
        diagnostics: [
          ...structural,
          { validator: 'structural_integrity', severity: 'info', code: 'generator.fixture_returned', message: 'hand-authored fixture returned; seed and parameters ignored', entityIds: [world.id] },
        ],
      };
    },
  };
}
