import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_TEMPLATES } from '@ottie/contracts/fixtures';
import { type AssetId, type DeepReadonly, type Viewport, type World } from '@ottie/contracts';
import { createFileArtworkSource } from '@ottie/renderer-geometry/artwork.node.js';
import { type ValidationContextOverrides, missingValidators, REQUIRED_WORLD_VALIDATORS, validateWorld } from '@ottie/scenario-validation';
import { assetChangeImpact, assessReleaseExport, buildReviewPack, describeWorldForReview, type ReviewInputs, type WorldReviewSummary } from '@ottie/review-export';
import { writeReviewPack } from '@ottie/review-export/write.node.js';
import { type StarterContentSet, loadStarterContentSet } from '@ottie/starter-content';
import {
  CLOSURE_COMMAND,
  PINS_COMMAND,
  STARTER_CLOSURE_PATH,
  checkStarterClosure,
  checkStarterPins,
  compileStarterRegistry,
  readCommittedClosure,
  serialiseClosure,
  writeStarterClosure,
  writeStarterPins,
} from '@ottie/starter-content/closure.node.js';

/**
 * Usage: summary [--json], export --out <dir> [--world <id>]... [--viewport WxH] [--json],
 * impact --asset <id> [--json], release [--json], closure [--write] [--json], pins [--write] [--json].
 *
 * Every command except `closure`/`pins` reviews the REAL starter content set: T1's committed
 * packages generated through the C2 generator over the committed C1 closure, validated by V1 with
 * A3 + C1 source records. The full extraction library is compiled alongside so impact analysis and
 * release export see every definition; its hash must equal the closure's or the closure is stale.
 */
export function repoRootFromModule(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export interface ReviewContext {
  readonly inputs: ReviewInputs;
  readonly content: StarterContentSet;
}

export function buildReviewContext(repoRoot = repoRootFromModule()): ReviewContext {
  const content = loadStarterContentSet();
  const compiled = compileStarterRegistry(repoRoot);
  if (compiled.registryHash !== content.closure.registryHash) {
    throw new Error(
      `${STARTER_CLOSURE_PATH} was projected from registry ${content.closure.registryHash} but the extraction library now compiles to ${compiled.registryHash}; run \`${CLOSURE_COMMAND}\` then \`${PINS_COMMAND}\` and review both diffs`,
    );
  }
  const templateIds = new Set(content.scenarios.map((s) => `${s.scenario.template.id}@${s.scenario.template.version}`));
  return {
    content,
    inputs: {
      registry: compiled.registry,
      registryHash: compiled.registryHash,
      worlds: [...content.worlds.values()],
      templates: DEVELOPMENT_TEMPLATES.filter((t) => templateIds.has(`${t.id}@${t.version}`)),
      bundles: [content.bundle],
      resolver: content.resolver,
      validation: content.validation,
      repoRoot,
    },
  };
}

export function buildReviewInputs(repoRoot = repoRootFromModule()): ReviewInputs {
  return buildReviewContext(repoRoot).inputs;
}

export function buildReviewOutput(worlds: readonly DeepReadonly<World>[], validation: ValidationContextOverrides): readonly WorldReviewSummary[] {
  return worlds.map((world) => {
    const report = validateWorld(world, validation);
    return describeWorldForReview(world, report, missingValidators(report));
  });
}

export function formatText(summaries: readonly WorldReviewSummary[]): string {
  const lines: string[] = ['Drive with Ottie — development content review (NOT release content)', ''];
  for (const summary of summaries) {
    lines.push(`${summary.worldId}  [${summary.status}${summary.usesQuarantinedAssets ? ', quarantined assets' : ''}]  regime=${summary.controlRegime}`);
    lines.push(`  lanes=${summary.lanes} movements=${summary.movements} assets=${summary.assets.length} evidence=${summary.evidenceIds.length} cameras=${summary.cameraPresets.join(',')}`);
    lines.push(`  validation: ok=${String(summary.validation.ok)} errors=${summary.validation.errors} warnings=${summary.validation.warnings}`);
    lines.push(`  validators run: ${summary.validation.validatorsRun.join(', ')}`);
    if (summary.validation.validatorsNotRun.length > 0) lines.push(`  validators NOT run (semantic status unknown): ${summary.validation.validatorsNotRun.join(', ')}`);
    else lines.push(`  validators: all ${REQUIRED_WORLD_VALIDATORS.length} required families ran`);
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
  const write = argv.includes('--write');
  const repoRoot = repoRootFromModule();
  if (command === 'closure') {
    const drift = checkStarterClosure(repoRoot);
    if (write && !drift.upToDate) writeStarterClosure(repoRoot, drift.computed);
    const summary = {
      path: STARTER_CLOSURE_PATH,
      upToDate: drift.upToDate,
      written: write && !drift.upToDate,
      registryHash: drift.computed.registryHash,
      committedRegistryHash: drift.committed?.registryHash ?? null,
      assets: drift.computed.assets.length,
      fullRegistryAssets: drift.computation.compiled.registry.assets.length,
      roots: drift.computed.roots,
      sources: drift.computed.sources.length,
      conflictedIds: drift.computed.conflictedIds,
      diagnostics: drift.computed.diagnostics.length,
      generationFailures: drift.computation.generationFailures,
    };
    if (json) return { code: drift.upToDate || write ? 0 : 1, stdout: `${JSON.stringify(summary, null, 2)}\n` };
    return {
      code: drift.upToDate || write ? 0 : 1,
      stdout: [
        `starter registry closure (${STARTER_CLOSURE_PATH}) — development only, NOT release content`,
        `registry: ${summary.registryHash} (committed: ${summary.committedRegistryHash ?? 'none'})`,
        `assets: ${summary.assets} of ${summary.fullRegistryAssets}; sources ${summary.sources}; conflicted ${summary.conflictedIds.length}; diagnostics ${summary.diagnostics}`,
        `roots: ${summary.roots.join(', ')}`,
        summary.generationFailures.length > 0 ? `generation failures: ${summary.generationFailures.map((f) => `${f.worldId}: ${f.detail}`).join('; ')}` : 'generation failures: none',
        drift.upToDate ? 'closure: up to date' : summary.written ? `closure: rewritten (${serialiseClosure(drift.computed).length} bytes); review the diff` : `closure: STALE — run ${CLOSURE_COMMAND}`,
        '',
      ].join('\n'),
    };
  }
  if (command === 'pins') {
    const closure = readCommittedClosure(repoRoot);
    if (!closure) return { code: 1, stdout: `no committed closure at ${STARTER_CLOSURE_PATH}; run ${CLOSURE_COMMAND} first\n` };
    const report = checkStarterPins(closure);
    const written = write && !report.ok ? writeStarterPins(repoRoot, report) : [];
    const after = written.length > 0 ? checkStarterPins(closure, undefined) : report;
    if (json) return { code: after.ok ? 0 : 1, stdout: `${JSON.stringify({ ...report, written, okAfterWrite: after.ok }, null, 2)}\n` };
    return {
      code: after.ok || written.length > 0 ? 0 : 1,
      stdout: [
        `starter package pins against closure registry ${report.registryHash} — development only`,
        ...Object.entries(report.pinnedRegistryHashes).map(([id, hash]) => `${id}: pins registry ${hash}${hash === report.registryHash ? '' : ' (MISMATCH)'}`),
        ...report.checks.map((c) => `${c.matches ? 'ok  ' : 'DIFF'} ${c.kind} ${c.worldId}: pinned ${c.pinnedHash.slice(0, 12)}… generated ${c.actualHash?.slice(0, 12) ?? 'FAILED'}…${c.generationError ? ` (${c.generationError})` : ''}`),
        written.length > 0 ? `rewrote pins in: ${written.join(', ')} — review the diff before committing` : report.ok ? 'pins: all match' : `pins: STALE — run ${PINS_COMMAND}`,
        '',
      ].join('\n'),
    };
  }
  const { inputs, content } = buildReviewContext(repoRoot);
  if (command === 'summary') {
    const summaries = buildReviewOutput(inputs.worlds, content.validation);
    return { code: 0, stdout: json ? `${JSON.stringify(summaries, null, 2)}\n` : `${formatText(summaries)}\n` };
  }
  if (command === 'impact') {
    const id = argValue(argv, '--asset');
    if (!id) return { code: 2, stdout: 'impact requires --asset <id>\n' };
    const report = assetChangeImpact(inputs, id as AssetId);
    if (json) return { code: 0, stdout: `${JSON.stringify(report, null, 2)}\n` };
    return {
      code: 0,
      stdout: [
        `asset: ${report.assetId}`,
        `found: ${String(report.found)}`,
        `releaseReady: ${String(report.directRecord?.releaseReady ?? false)}`,
        `worlds: ${report.regenerate.worlds.join(', ')}`,
        `templates: ${report.review.templates.join(', ')}`,
        `questions: ${report.review.questions.join(', ')}`,
        `terms: ${report.review.terms.join(', ')}`,
        `bundles: ${report.review.bundles.map((bundle) => `${bundle.id}@${bundle.version}`).join(', ')}`,
        `via definitions: ${report.viaDefinitions.join(', ')}`,
        '',
      ].join('\n'),
    };
  }
  if (command === 'release') {
    const report = assessReleaseExport(inputs);
    const text = json ? JSON.stringify(report, null, 2) : `Drive with Ottie — development content review (NOT release content): ${report.ok ? 'release export permitted' : 'refused'}\n${report.refusals.map((refusal) => `${refusal.worldId}: ${refusal.reason} — ${refusal.detail}`).join('\n')}\nC1 registry: ${report.c1.ok ? 'accepted' : `rejected ${report.c1.rejectedRoots.length} roots`}\n${report.c1.rejections.map((rejection) => `${rejection.root}: ${rejection.subject} ${rejection.reason} — ${rejection.detail}`).join('\n')}`;
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
      artwork: createFileArtworkSource(repoRoot),
    });
    const manifest = await writeReviewPack(pack, out);
    return { code: 0, stdout: json ? `${JSON.stringify(manifest, null, 2)}\n` : `development content review (NOT release content)\nexported ${manifest.worlds.length} worlds to ${out}\npackHash=${manifest.packHash}\n` };
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
