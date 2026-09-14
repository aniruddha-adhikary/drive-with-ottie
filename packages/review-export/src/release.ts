import { type ReleaseRoots, exportRelease, type ReleaseExport } from '@ottie/asset-registry';
import { missingValidators, validateWorld } from '@ottie/scenario-validation';
import { verifyCanonicalHash } from '@ottie/scenario-core';
import { type ReviewInputs } from './inputs.js';

export type ReviewRefusalReason = 'fixture_not_release_candidate' | 'uses_quarantined_assets' | 'validation_errors' | 'validators_missing' | 'canonical_hash_mismatch';

export interface ReleaseRefusal {
  readonly worldId: string;
  readonly reason: ReviewRefusalReason;
  readonly detail: string;
}

export interface ReviewReleaseExport {
  readonly ok: boolean;
  readonly registryHash: ReviewInputs['registryHash'];
  readonly c1: ReleaseExport;
  readonly refusals: readonly ReleaseRefusal[];
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
  const refusals: ReleaseRefusal[] = [];
  for (const world of inputs.worlds) {
    const report = validateWorld(world, inputs.validation);
    if ((world.provenance.status as string) !== 'release_candidate') refusals.push({ worldId: world.id, reason: 'fixture_not_release_candidate', detail: `status=${world.provenance.status}` });
    if (world.provenance.usesQuarantinedAssets) refusals.push({ worldId: world.id, reason: 'uses_quarantined_assets', detail: 'world explicitly uses quarantined assets' });
    if (!report.ok) refusals.push({ worldId: world.id, reason: 'validation_errors', detail: `${report.diagnostics.filter((d) => d.severity === 'error').length} validation errors` });
    if (missingValidators(report).length > 0) refusals.push({ worldId: world.id, reason: 'validators_missing', detail: missingValidators(report).join(', ') });
    if (!verifyCanonicalHash(world)) refusals.push({ worldId: world.id, reason: 'canonical_hash_mismatch', detail: 'canonical hash does not match the world' });
  }
  return { ok: c1.ok && refusals.length === 0, registryHash: inputs.registryHash, c1, refusals };
}
