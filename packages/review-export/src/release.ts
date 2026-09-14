import { type ReleaseRoots, exportRelease, type ReleaseExport } from '@ottie/asset-registry';
import { type DeepReadonly, type FixtureStatus, type World } from '@ottie/contracts';
import { missingValidators, validateQuestion, validateWorld } from '@ottie/scenario-validation';
import { verifyCanonicalHash } from '@ottie/scenario-core';
import { type ReviewInputs } from './inputs';

export type ReviewRefusalReason =
  | 'fixture_not_release_candidate'
  | 'uses_quarantined_assets'
  | 'validation_errors'
  | 'validators_missing'
  | 'question_validation_errors'
  | 'canonical_hash_missing'
  | 'canonical_hash_mismatch';

export interface ReleaseRefusal {
  readonly worldId: string;
  readonly reason: ReviewRefusalReason;
  readonly detail: string;
  /** Present for question-level refusals so a reviewer can find the offending question. */
  readonly questionId?: string;
}

/**
 * One release assessment shared by the CLI `release` command and every exported per-world
 * `release.json`. `c1` is the asset-registry closure export (never suppressed); `refusals` layers
 * the world/question semantics on top. `ok` is true only when BOTH accept.
 */
export interface ReviewReleaseExport {
  readonly ok: boolean;
  readonly registryHash: ReviewInputs['registryHash'];
  readonly c1: ReleaseExport;
  readonly refusals: readonly ReleaseRefusal[];
  /** Question ids validated per world (bundled questions bound to that world), so the record shows what was checked. */
  readonly questionsChecked: Readonly<Record<string, readonly string[]>>;
}

function bundledQuestionsFor(inputs: ReviewInputs, world: DeepReadonly<World>) {
  return (inputs.bundles ?? [])
    .flatMap((bundle) => bundle.questions)
    .filter((question, index, all) => question.worldId === world.id && all.findIndex((candidate) => candidate.id === question.id) === index);
}

export function assessWorldRelease(inputs: ReviewInputs, world: DeepReadonly<World>): { readonly refusals: readonly ReleaseRefusal[]; readonly questionIds: readonly string[] } {
  const refusals: ReleaseRefusal[] = [];
  const report = validateWorld(world, inputs.validation);
  const releaseCandidateStatus: FixtureStatus = 'generated';
  if (world.provenance.status !== releaseCandidateStatus) refusals.push({ worldId: world.id, reason: 'fixture_not_release_candidate', detail: `status=${world.provenance.status}` });
  if (world.provenance.usesQuarantinedAssets) refusals.push({ worldId: world.id, reason: 'uses_quarantined_assets', detail: 'world explicitly uses quarantined assets' });
  if (!report.ok) {
    const errors = report.diagnostics.filter((d) => d.severity === 'error');
    refusals.push({ worldId: world.id, reason: 'validation_errors', detail: `${errors.length} validation errors: ${errors.map((d) => `${d.validator}.${d.code}`).join(', ')}` });
  }
  if (missingValidators(report).length > 0) refusals.push({ worldId: world.id, reason: 'validators_missing', detail: missingValidators(report).join(', ') });
  const questions = bundledQuestionsFor(inputs, world);
  for (const question of questions) {
    const questionReport = validateQuestion(question, world, inputs.validation);
    if (!questionReport.ok) {
      const errors = questionReport.diagnostics.filter((d) => d.severity === 'error');
      refusals.push({
        worldId: world.id,
        questionId: question.id,
        reason: 'question_validation_errors',
        detail: `${question.id}: ${errors.length} validation errors: ${errors.map((d) => `${d.validator}.${d.code}`).join(', ')}`,
      });
    }
  }
  if (world.provenance.canonicalHash === null) refusals.push({ worldId: world.id, reason: 'canonical_hash_missing', detail: 'canonical hash is not present on the world' });
  else if (!verifyCanonicalHash(world)) refusals.push({ worldId: world.id, reason: 'canonical_hash_mismatch', detail: 'canonical hash does not match the world' });
  return { refusals, questionIds: questions.map((q) => q.id as string) };
}

export function assessReleaseExport(inputs: ReviewInputs, roots?: ReleaseRoots): ReviewReleaseExport {
  const c1 = exportRelease({
    registry: inputs.registry,
    registryHash: inputs.registryHash,
    worlds: inputs.worlds,
    ...(inputs.templates ? { templates: inputs.templates } : {}),
    ...(inputs.bundles ? { bundles: inputs.bundles } : {}),
    ...(roots ? { roots } : {}),
  });
  const rootWorldIds = roots?.worlds ? new Set<string>(roots.worlds) : null;
  const refusals: ReleaseRefusal[] = [];
  const questionsChecked: Record<string, readonly string[]> = {};
  for (const world of inputs.worlds) {
    if (rootWorldIds && !rootWorldIds.has(world.id)) continue;
    const assessed = assessWorldRelease(inputs, world);
    refusals.push(...assessed.refusals);
    questionsChecked[world.id] = assessed.questionIds;
  }
  return { ok: c1.ok && refusals.length === 0, registryHash: inputs.registryHash, c1, refusals, questionsChecked };
}
