import {
  type AssetRef,
  type AssetResolver,
  type DeepReadonly,
  type Diagnostic,
  type GenerationRequest,
  type GenerationResult,
  type Generator,
  type Template,
  type World,
  WORLD_SCHEMA_VERSION,
  FROZEN_WORLD_CONVENTIONS,
  checkWorldStructure,
  freezeDeep,
} from '@ottie/contracts';
import { computeCanonicalHash } from './canonical';
import { GIVE_WAY_T_JUNCTION_LAYOUT } from './layouts/give-way-t-junction';
import { type TemplateLayout } from './layouts/shared';
import { SIGNALISED_CROSSROADS_LAYOUT } from './layouts/signalised-crossroads';
import { STOP_DEVELOPMENT_ACCESS_LAYOUT } from './layouts/stop-development-access';
import { resolveParameters } from './parameters';
import { checkLaneConnectivity, checkMovementPriorityConsistency } from './priority';
import { createSeededRng } from './rng';
import { rotateWorldQuarterTurns } from './rotate-world';
import { drawSafeVariation } from './variation';

/**
 * Bumped whenever generated output for the same (template, seed, parameters) can change. Part of
 * every world's `ReproducibilityKey`; hand-authored F0 fixtures carry generator version 0.
 */
export const GENERATOR_VERSION = 1;

export const TEMPLATE_LAYOUTS: readonly TemplateLayout[] = [GIVE_WAY_T_JUNCTION_LAYOUT, STOP_DEVELOPMENT_ACCESS_LAYOUT, SIGNALISED_CROSSROADS_LAYOUT];

export interface TemplateGeneratorOptions {
  readonly templates: readonly Template[];
  /** Source profile IDs this generator's layouts are authored against. */
  readonly sourceProfileIds: readonly string[];
  /** Resolves every asset a layout references; its `registryHash` is pinned into provenance. */
  readonly assets: AssetResolver;
  readonly layouts?: readonly TemplateLayout[];
}

const templateKey = (id: string, version: number): string => `${id}@${version}`;

function error(code: string, message: string, data?: Readonly<Record<string, unknown>>): Diagnostic {
  return { validator: 'structural_integrity', severity: 'error', code, message, entityIds: [], ...(data ? { data } : {}) };
}

function referencedAssets(world: World): readonly { readonly entityId: string; readonly ref: AssetRef }[] {
  const refs: { entityId: string; ref: AssetRef }[] = [];
  for (const m of world.markings) refs.push({ entityId: m.id, ref: m.asset });
  for (const s of world.supports) if (s.asset) refs.push({ entityId: s.id, ref: s.asset });
  for (const f of world.signFaces) refs.push({ entityId: f.id, ref: f.asset });
  for (const h of world.signalHeads) refs.push({ entityId: h.id, ref: h.asset });
  for (const a of world.actors) if (a.asset) refs.push({ entityId: a.id, ref: a.asset });
  return refs;
}

/**
 * Deterministic template generator. For a valid request it:
 *  1. validates schema version, template ref, source profile and every declared parameter;
 *  2. draws only the template's declared safe variation from `createSeededRng(request.seed)`;
 *  3. builds the layout's semantic world (directed lanes, anchors, movements with authored
 *     priority/conflict/yield relationships, controls, actors, evidence, camera presets);
 *  4. rotates the whole world by exact quarter turns for the requested approach;
 *  5. checks structure, connectivity, priority consistency, asset resolution and required evidence;
 *  6. records provenance (generator/schema/template versions, seed, registry hash, source profile,
 *     resolved parameters and the variation actually drawn) and a canonical hash;
 *  7. returns the world deeply frozen.
 * `request.views` and any attempt/camera state never reach the layout, so they cannot alter output.
 */
export function createTemplateGenerator(options: TemplateGeneratorOptions): Generator {
  const templates = new Map(options.templates.map((t) => [templateKey(t.id, t.version), t] as const));
  const templateIds = new Set(options.templates.map((t) => t.id));
  const layouts = new Map((options.layouts ?? TEMPLATE_LAYOUTS).map((l) => [templateKey(l.templateId, l.templateVersion), l] as const));
  const sourceProfiles = new Set(options.sourceProfileIds);

  return {
    generatorVersion: GENERATOR_VERSION,
    generate(request: GenerationRequest): GenerationResult {
      const requestErrors: Diagnostic[] = [];
      if (request.schemaVersion !== WORLD_SCHEMA_VERSION) {
        requestErrors.push(error('generator.schema_version', `request schema ${request.schemaVersion} != world schema ${WORLD_SCHEMA_VERSION}`));
      }
      const key = templateKey(request.templateRef.id, request.templateRef.version);
      const template = templates.get(key);
      if (!template) {
        const code = templateIds.has(request.templateRef.id) ? 'generator.unknown_template_version' : 'generator.unknown_template';
        requestErrors.push(error(code, `no template ${key}`, { templateRef: request.templateRef }));
      }
      if (!sourceProfiles.has(request.sourceProfileId)) {
        requestErrors.push(error('generator.unknown_source_profile', `source profile ${request.sourceProfileId} is not one this generator was authored against`, { sourceProfileId: request.sourceProfileId }));
      }
      const layout = layouts.get(key);
      if (template && !layout) requestErrors.push(error('generator.no_layout', `template ${key} has no layout in this generator`));
      if (!template || !layout || requestErrors.length > 0) return { ok: false, diagnostics: requestErrors };

      const resolved = resolveParameters(template, request);
      if (resolved.diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics: resolved.diagnostics };

      const rng = createSeededRng(request.seed);
      const variation = drawSafeVariation(template, rng);
      if (variation.diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics: [...resolved.diagnostics, ...variation.diagnostics] };

      const built = layout.build({ parameters: resolved.parameters, variation });
      if (!built.ok) return { ok: false, diagnostics: [...resolved.diagnostics, ...built.diagnostics] };

      const canonicalFrame: World = {
        id: request.id,
        schemaVersion: WORLD_SCHEMA_VERSION,
        conventions: FROZEN_WORLD_CONVENTIONS,
        ...built.body,
        provenance: {
          key: {
            generatorVersion: GENERATOR_VERSION,
            worldSchemaVersion: WORLD_SCHEMA_VERSION,
            template: { id: template.id, version: template.version },
            seed: request.seed,
            assetRegistryHash: options.assets.registryHash,
            sourceProfileId: request.sourceProfileId,
          },
          generatedAt: null,
          parameters: {
            ...resolved.parameters,
            safeVariation: { nonEgoProgressM: variation.nonEgoProgressM, daylight: variation.daylight },
          },
          canonicalHash: null,
          status: 'generated',
          usesQuarantinedAssets: true,
          notes: [...built.notes, `Template review status: ${template.reviewStatus}. Generated worlds inherit their template's review status and never grant approval.`],
        },
      };
      const rotated = rotateWorldQuarterTurns(canonicalFrame, built.turns);

      const diagnostics: Diagnostic[] = [...resolved.diagnostics, ...variation.diagnostics, ...built.diagnostics];
      let quarantined = false;
      for (const { entityId, ref } of referencedAssets(rotated)) {
        const resolution = options.assets.resolve(ref);
        if (!resolution.ok) {
          diagnostics.push({ ...error('generator.unresolved_asset', `${entityId} references ${ref.id}@${ref.version}: ${resolution.reason} (${resolution.detail})`), entityIds: [entityId] });
        } else if (resolution.quarantined) {
          quarantined = true;
        }
      }
      for (const required of template.requiredAssets) {
        const resolution = options.assets.resolve(required);
        if (!resolution.ok) diagnostics.push(error('generator.required_asset_unavailable', `template requires ${required.id}@${required.version}: ${resolution.reason}`));
      }
      for (const evidenceId of template.requiredEvidenceIds) {
        if (!rotated.evidence.some((e) => e.id === evidenceId)) {
          diagnostics.push(error('generator.missing_required_evidence', `template requires evidence ${evidenceId}`, { evidenceId }));
        }
      }
      diagnostics.push(...checkLaneConnectivity(rotated.lanes, rotated.movements));
      diagnostics.push(...checkMovementPriorityConsistency(rotated.movements));
      diagnostics.push(...checkWorldStructure(rotated));
      if (diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };

      const withStatus: World = { ...rotated, provenance: { ...rotated.provenance, usesQuarantinedAssets: quarantined } };
      const world: DeepReadonly<World> = freezeDeep<World>({
        ...withStatus,
        provenance: { ...withStatus.provenance, canonicalHash: computeCanonicalHash(withStatus) },
      });
      return { ok: true, world, diagnostics };
    },
  };
}
