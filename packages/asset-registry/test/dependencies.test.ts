import { describe, expect, it } from 'vitest';
import { assetId } from '@ottie/contracts';
import {
  ASSET_GIVE_WAY_LINE_D,
  ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED,
  ASSET_STOP_LINE_J,
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_CONTENT_BUNDLE,
  DEVELOPMENT_TEMPLATES,
  DEVELOPMENT_WORLDS,
  EXTRACTED_DEVELOPMENT_ASSETS,
  QUESTION_GIVE_WAY,
  QUESTION_RED_RIGHT_ARROW,
  QUESTION_STOP,
  TERM_GIVE_WAY_LINE,
  ref,
} from '@ottie/contracts/fixtures';
import { compileRegistry } from '../src/compile';
import { curationFromDefinitions } from '../src/curation';
import { buildDependencyIndex, bundleKey } from '../src/dependencies';
import { exportRelease } from '../src/release';
import { computeRegistryHash } from '../src/hash.node';
import { realLibrary } from './helpers';

const registry = compileRegistry(realLibrary(), {
  curation: curationFromDefinitions(EXTRACTED_DEVELOPMENT_ASSETS),
  runtimeAssets: DEVELOPMENT_ASSETS.filter((a) => a.provenance.family === 'runtime'),
});
const index = buildDependencyIndex({
  registry,
  worlds: DEVELOPMENT_WORLDS,
  templates: DEVELOPMENT_TEMPLATES,
  bundles: [DEVELOPMENT_CONTENT_BUNDLE],
});
const bundleRef = { id: DEVELOPMENT_CONTENT_BUNDLE.id, version: DEVELOPMENT_CONTENT_BUNDLE.version };

describe('dependency index over the development fixtures', () => {
  it('every fixture world resolves all of its asset refs in the compiled registry', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const closure = index.worldClosure(world.id);
      expect(closure, world.id).not.toBeNull();
      expect(closure?.missing, world.id).toEqual([]);
      expect(closure?.assets.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('bundle closure is the exact union of its questions, comparisons and term illustrations', () => {
    const closure = index.bundleClosure(bundleRef);
    expect(closure).not.toBeNull();
    if (!closure) return;
    expect(closure.worlds).toEqual([...new Set(DEVELOPMENT_WORLDS.map((w) => w.id))].sort());
    const ids = closure.assets.map((a) => a.id);
    expect(ids).toContain(ASSET_GIVE_WAY_LINE_D.id);
    expect(ids).toContain(ASSET_STOP_LINE_J.id);
    expect(ids).toContain(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED.id);
    expect(closure.definitions).toContain('sg.assemblies.definition.signal-vertical-rag');
    expect(new Set(ids).size).toBe(ids.length);
    expect(closure.missing).toEqual([]);
  });

  it('reverse lookup walks asset → world → template → question → bundle', () => {
    const dependents = index.dependents(ASSET_GIVE_WAY_LINE_D.id);
    expect(dependents.worlds).toContain(QUESTION_GIVE_WAY.worldId);
    expect(dependents.questions).toContain(QUESTION_GIVE_WAY.id);
    expect(dependents.questions).not.toContain(QUESTION_RED_RIGHT_ARROW.id);
    expect(dependents.terms).toContain(TERM_GIVE_WAY_LINE.id);
    expect(dependents.bundles.map(bundleKey)).toEqual([bundleKey(bundleRef)]);
    expect(dependents.templates.length).toBeGreaterThan(0);

    const stop = index.dependents(ASSET_STOP_LINE_J.id);
    expect(stop.questions).toContain(QUESTION_STOP.id);
    expect(stop.questions).not.toContain(QUESTION_GIVE_WAY.id);
  });

  it('a signal lens cited only through inherited definitions is still reachable from the question', () => {
    const lens = index.dependents(assetId('sg.assemblies.signal-circular-red'));
    expect(lens.assets.map((a) => a.id)).toContain(ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED.id);
    expect(lens.questions).toContain(QUESTION_RED_RIGHT_ARROW.id);
    expect(lens.definitions).toEqual(['sg.assemblies.definition.signal-vertical-rag']);
  });

  it('unknown roots return null instead of empty closures', () => {
    expect(index.worldClosure('sg.world.nope' as never)).toBeNull();
    expect(index.bundleClosure({ id: bundleRef.id, version: 999 })).toBeNull();
    expect(index.dependents(assetId('sg.mandatory.never-referenced')).worlds).toEqual([]);
  });

  it('closure of an unknown asset ref reports it missing without throwing', () => {
    const closure = index.assetClosure(ref({ ...ASSET_GIVE_WAY_LINE_D, version: 42 }));
    expect(closure.assets).toEqual([]);
    expect(closure.missing).toEqual([`${ASSET_GIVE_WAY_LINE_D.id}@42`]);
  });

  it('release export rejects the development bundle on every unapproved dependency, not just the first', () => {
    const result = exportRelease({
      registry,
      registryHash: computeRegistryHash(registry.assets),
      worlds: DEVELOPMENT_WORLDS,
      templates: DEVELOPMENT_TEMPLATES,
      bundles: [DEVELOPMENT_CONTENT_BUNDLE],
    });
    expect(result.ok).toBe(false);
    expect(result.rejectedRoots).toEqual([bundleKey(bundleRef)]);
    const subjects = new Set(result.rejections.map((r) => r.subject));
    expect(subjects.has(`${ASSET_GIVE_WAY_LINE_D.id}@${String(ASSET_GIVE_WAY_LINE_D.version)}`)).toBe(true);
    expect(subjects.has('sg.assemblies.definition.signal-vertical-rag')).toBe(true);
    expect(result.rejections.some((r) => r.reason === 'content_not_reviewed')).toBe(true);
    expect(result.rejections.some((r) => r.reason === 'not_release_ready')).toBe(true);
  });
});
