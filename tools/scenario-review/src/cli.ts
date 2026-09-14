import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRegistry, curationFromDefinitions, createRegistryResolver } from '../../../packages/asset-registry/src/index.js';
import { loadExtractionLibrary } from '../../../packages/asset-registry/src/library.node.js';
import { computeRegistryHash } from '../../../packages/asset-registry/src/hash.node.js';
import { DEVELOPMENT_ASSETS, DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_TEMPLATES, DEVELOPMENT_WORLDS, EXTRACTED_DEVELOPMENT_ASSETS } from '../../../packages/contracts/src/fixtures/index.js';
import { type AssetId, type DeepReadonly, type Viewport, type World } from '../../../packages/contracts/src/index.js';
import { createFileArtworkSource } from '../../../packages/renderer/geometry/src/artwork.node.js';
import { developmentAssetResolver, missingValidators, validateWorld } from '../../../packages/scenario-validation/src/index.js';
import { assetChangeImpact, assessReleaseExport, buildReviewPack, describeWorldForReview, type ReviewInputs, type WorldReviewSummary } from '../../../packages/review-export/src/index.js';
import { writeReviewPack } from '../../../packages/review-export/src/write.node.js';

export function repoRootFromModule(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export function buildReviewInputs(repoRoot = repoRootFromModule()): ReviewInputs {
  const registry = compileRegistry(loadExtractionLibrary(repoRoot), {
    curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
    runtimeAssets: DEVELOPMENT_ASSETS.filter((asset) => asset.provenance.family === 'runtime'),
  });
  const registryHash = computeRegistryHash(registry.assets);
  return {
    registry,
    registryHash,
    worlds: DEVELOPMENT_WORLDS,
    templates: DEVELOPMENT_TEMPLATES,
    bundles: [DEVELOPMENT_CONTENT_BUNDLE],
    resolver: createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, registryHash),
    validation: { assets: developmentAssetResolver() },
    repoRoot,
  };
}

export function buildReviewOutput(worlds: readonly DeepReadonly<World>[] = DEVELOPMENT_WORLDS): readonly WorldReviewSummary[] {
  return worlds.map((world) => {
    const report = validateWorld(world);
    return describeWorldForReview(world, report, missingValidators(report));
  });
}

export function formatText(summaries: readonly WorldReviewSummary[]): string {
  const lines: string[] = ['Drive with Ottie — development fixture review (NOT release content)', ''];
  for (const summary of summaries) {
    lines.push(`${summary.worldId}  [${summary.status}${summary.usesQuarantinedAssets ? ', quarantined assets' : ''}]  regime=${summary.controlRegime}`);
    lines.push(`  lanes=${summary.lanes} movements=${summary.movements} assets=${summary.assets.length} evidence=${summary.evidenceIds.length} cameras=${summary.cameraPresets.join(',')}`);
    lines.push(`  validation: ok=${String(summary.validation.ok)} errors=${summary.validation.errors} warnings=${summary.validation.warnings}`);
    lines.push(`  validators run: ${summary.validation.validatorsRun.join(', ')}`);
    if (summary.validation.validatorsNotRun.length > 0) lines.push(`  validators NOT run (semantic status unknown): ${summary.validation.validatorsNotRun.join(', ')}`);
    else lines.push(`  validators: all ${summary.validation.validatorsRun.length - 1} required families ran`);
    for (const note of summary.notes) lines.push(`  note: ${note}`);
    lines.push('');
  }
  return lines.join('\n');
}

function parseViewport(value: string): Viewport {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid viewport ${value}; expected WxH`);
  return { widthPx: Number(match[1]), heightPx: Number(match[2]), devicePixelRatio: 1, safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 } };
}

function argValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

export async function runCli(argv: readonly string[]): Promise<{ readonly code: number; readonly stdout: string }> {
  const command = argv[0] ?? 'summary';
  const json = argv.includes('--json');
  const inputs = buildReviewInputs();
  if (command === 'summary') {
    const summaries = buildReviewOutput(inputs.worlds);
    return { code: 0, stdout: json ? `${JSON.stringify(summaries, null, 2)}\n` : `${formatText(summaries)}\n` };
  }
  if (command === 'impact') {
    const id = argValue(argv, '--asset');
    if (!id) return { code: 2, stdout: 'impact requires --asset <id>\n' };
    const report = assetChangeImpact(inputs, id as AssetId);
    return { code: 0, stdout: `${JSON.stringify(report, null, 2)}\n` };
  }
  if (command === 'release') {
    const report = assessReleaseExport(inputs);
    const text = json ? JSON.stringify(report, null, 2) : `development fixture review (NOT release content): refused\n${report.refusals.map((refusal) => `${refusal.worldId}: ${refusal.reason} — ${refusal.detail}`).join('\n')}`;
    return { code: report.ok ? 0 : 1, stdout: `${text}\n` };
  }
  if (command === 'export') {
    const out = argValue(argv, '--out');
    if (!out) return { code: 2, stdout: 'export requires --out <dir>\n' };
    const selected = argv.flatMap((value, index) => value === '--world' ? [argv[index + 1]] : []).filter((value): value is string => value !== undefined);
    const viewport = argValue(argv, '--viewport');
    const pack = await buildReviewPack(inputs, {
      ...(selected.length > 0 ? { worldIds: selected as World['id'][] } : {}),
      ...(viewport ? { viewports: [parseViewport(viewport)] } : {}),
      artwork: createFileArtworkSource(inputs.repoRoot ?? repoRootFromModule()),
    });
    const manifest = await writeReviewPack(pack, out);
    return { code: 0, stdout: json ? `${JSON.stringify(manifest, null, 2)}\n` : `development fixture review (NOT release content)\nexported ${manifest.worlds.length} worlds to ${out}\npackHash=${manifest.packHash}\n` };
  }
  return { code: 2, stdout: `unknown command ${command}\n` };
}

const isMain = process.argv[1]?.endsWith('cli.ts') ?? false;
if (isMain) {
  runCli(process.argv.slice(2)).then(({ code, stdout }) => {
    process.stdout.write(stdout);
    process.exitCode = code;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
