import { type Diagnostic, type Sha256, type ValidationReport, type Viewport } from '@ottie/contracts';
import { canonicalJson } from '@ottie/contracts';
import { buildDependencyIndex, exportRelease, type DependencyClosure, type ReleaseExport, type SourceConflict } from '@ottie/asset-registry';
import { loadWorldArtwork, type SceneIssue, type SchematicChoice } from '@ottie/renderer-geometry';
import { withDom } from './render.node';
import { buildWorldProvenance, type WorldProvenanceExport } from './provenance';
import { composeContactSheet } from './contact-sheet';
import { buildWorldViews, type ReviewView } from './views';
import { RENDERER_LIMITATIONS } from './render.node';
import { type ReviewInputs, type ReviewPackOptions, REVIEW_VIEWPORT } from './inputs';
import { missingValidators, validateQuestion, validateWorld } from '@ottie/scenario-validation';
import { sha256Hex } from '@ottie/scenario-core';

export interface ReviewWorldPack {
  readonly worldId: string;
  readonly provenance: WorldProvenanceExport;
  readonly validation: { readonly world: ValidationReport; readonly missing: ReturnType<typeof missingValidators>; readonly questions: Readonly<Record<string, ValidationReport>> };
  readonly diagnostics: { readonly sceneIssues: readonly SceneIssue[]; readonly schematicChoices: readonly SchematicChoice[] };
  readonly views: readonly ReviewView[];
  readonly contactSheets: readonly { readonly viewport: Viewport; readonly svg: string }[];
  readonly closure: DependencyClosure;
  readonly release: ReleaseExport;
}

export interface ReviewPack {
  readonly registryHash: Sha256;
  readonly registryDiagnostics: readonly Diagnostic[];
  readonly sourceConflicts: readonly SourceConflict[];
  readonly conflictedIds: readonly string[];
  readonly rendererLimitations: readonly string[];
  readonly worlds: readonly ReviewWorldPack[];
  readonly packHash: Sha256;
}

export async function buildReviewPack(inputs: ReviewInputs, options: ReviewPackOptions = {}): Promise<ReviewPack> {
  const index = buildDependencyIndex(inputs);
  const viewports = options.viewports ?? [REVIEW_VIEWPORT];
  const selected = [...inputs.worlds].filter((world) => options.worldIds?.includes(world.id) ?? true).sort((a, b) => a.id.localeCompare(b.id));
  const worlds: ReviewWorldPack[] = [];
  for (const world of selected) {
    const worldPack = await withDom(async () => {
      const loaded = options.artwork ? await loadWorldArtwork(world, inputs.resolver, options.artwork) : { artwork: undefined, issues: [] };
      const views: ReviewView[] = [];
      const sheets: { viewport: Viewport; svg: string }[] = [];
      let sceneIssues: readonly SceneIssue[] = loaded.issues;
      let schematicChoices: readonly SchematicChoice[] = [];
      for (const viewport of viewports) {
        const built = buildWorldViews(world, viewport, inputs.resolver, loaded.artwork, loaded.issues);
        views.push(...built.result.views);
        sceneIssues = built.scene.issues;
        schematicChoices = built.scene.schematicChoices;
        sheets.push({ viewport, svg: composeContactSheet(built.result.contactSheetTiles, { worldId: world.id, status: world.provenance.status, usesQuarantinedAssets: world.provenance.usesQuarantinedAssets, registryHash: inputs.registryHash, canonicalHash: world.provenance.canonicalHash }) });
        built.scene.dispose();
      }
      const validation = validateWorld(world, inputs.validation);
      const questions = (inputs.bundles ?? []).flatMap((bundle) => bundle.questions).filter((question, index, all) => question.worldId === world.id && all.findIndex((candidate) => candidate.id === question.id) === index);
      const questionReports = Object.fromEntries(questions.map((question) => [question.id, validateQuestion(question, world, inputs.validation)]));
      const worldPack: ReviewWorldPack = {
        worldId: world.id,
        provenance: buildWorldProvenance(world, index, inputs.registry, inputs.repoRoot),
        validation: { world: validation, missing: missingValidators(validation), questions: questionReports },
        diagnostics: { sceneIssues, schematicChoices },
        views,
        contactSheets: sheets,
        closure: index.worldClosure(world.id) ?? { root: world.id, assets: [], definitions: [], references: [], worlds: [], templates: [], missing: [world.id] },
        release: exportRelease({
          registry: inputs.registry,
          registryHash: inputs.registryHash,
          worlds: [world],
          ...(inputs.templates ? { templates: inputs.templates } : {}),
          ...(inputs.bundles ? { bundles: inputs.bundles } : {}),
          roots: { worlds: [world.id] },
        }),
      };
      return worldPack;
    });
    worlds.push(worldPack);
  }
  const withoutHash = { registryHash: inputs.registryHash, registryDiagnostics: inputs.registry.diagnostics, sourceConflicts: inputs.registry.sourceConflicts, conflictedIds: inputs.registry.conflictedIds, rendererLimitations: RENDERER_LIMITATIONS, worlds };
  return { ...withoutHash, packHash: sha256Hex(canonicalJson(withoutHash)) as Sha256 };
}
