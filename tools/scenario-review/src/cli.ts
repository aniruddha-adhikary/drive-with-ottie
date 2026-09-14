import { DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { type WorldReviewSummary, describeWorldForReview } from '@ottie/review-export';
import { missingValidators, validateWorld } from '@ottie/scenario-validation';

/**
 * `npm run review:export [-- --json]` — prints a review summary of the development fixtures.
 * H1 extends this into real review packs. Output always states development status and which
 * validators have not run; nothing here can mark content approved.
 */
export function buildReviewOutput(): readonly WorldReviewSummary[] {
  return DEVELOPMENT_WORLDS.map((world) => {
    const report = validateWorld(world);
    return describeWorldForReview(world, report, missingValidators(report));
  });
}

export function formatText(summaries: readonly WorldReviewSummary[]): string {
  const lines: string[] = ['Drive with Ottie — development fixture review (NOT release content)', ''];
  for (const s of summaries) {
    lines.push(`${s.worldId}  [${s.status}${s.usesQuarantinedAssets ? ', quarantined assets' : ''}]  regime=${s.controlRegime}`);
    lines.push(`  lanes=${s.lanes} movements=${s.movements} assets=${s.assets.length} evidence=${s.evidenceIds.length} cameras=${s.cameraPresets.join(',')}`);
    lines.push(`  validation: ok=${String(s.validation.ok)} errors=${s.validation.errors} warnings=${s.validation.warnings}`);
    lines.push(`  validators run: ${s.validation.validatorsRun.join(', ')}`);
    lines.push(`  validators NOT run (semantic status unknown): ${s.validation.validatorsNotRun.join(', ')}`);
    for (const note of s.notes) lines.push(`  note: ${note}`);
    lines.push('');
  }
  return lines.join('\n');
}

const isMain = process.argv[1]?.endsWith('cli.ts') ?? false;
if (isMain) {
  const summaries = buildReviewOutput();
  const json = process.argv.includes('--json');
  process.stdout.write(json ? `${JSON.stringify(summaries, null, 2)}\n` : `${formatText(summaries)}\n`);
}
