/**
 * Adversarial records. Every "approved" record in this file is synthetic test data used to prove
 * the registry refuses transitive bypasses; nothing here touches or approves a real manifest.
 */
import { describe, expect, it } from 'vitest';
import { assetId, sha256 } from '@ottie/contracts';
import { ASSET_DEV_CAR } from '@ottie/contracts/fixtures';
import { compileRegistry } from '../src/compile';
import { buildDependencyIndex } from '../src/dependencies';
import { type ExtractionLibrary, parseAssemblyDefinitionsFile } from '../src/records';
import { exportRelease } from '../src/release';
import { createRegistryResolver } from '../src/resolver';
import { HEX_A, HEX_B, HEX_C, cloneLibrary, findAsset, libraryOf, rawManifest, rawReference, rawSign, rawSource, realLibrary } from './helpers';

const HASH = sha256(HEX_C);
const APPROVED_REVIEW = { status: 'approved', warnings: [], content_approved: true, reuse_approved: true, approval_evidence: ['test-only synthetic approval'] };

function codes(registry: ReturnType<typeof compileRegistry>): string[] {
  return registry.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
}

function approvedSign(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return rawSign(id, { release_ready: true, license_status: 'test', review: APPROVED_REVIEW, ...extra });
}

function definitionsFile(definitions: Record<string, unknown>[], releaseReady = true): ExtractionLibrary['assemblyDefinitions'] {
  return parseAssemblyDefinitionsFile({ schema_version: 1, family: 'assemblies', review_status: 'test', release_ready: releaseReady, definitions });
}

describe('malformed records', () => {
  it('a source referenced by no manifest source list is a dangling error and marks the record conflicted', () => {
    const registry = compileRegistry(libraryOf(rawManifest({ assets: [rawSign('sg.mandatory.x', { source: { source_id: 'ghost', pdf_page: 1, printed_page: null, drawing: null, drawing_revision: null, bbox_pdf_points: [0, 0, 1, 1] } })] })));
    expect(codes(registry)).toContain('asset_registry.dangling_source');
    expect(registry.conflictedIds).toEqual(['sg.mandatory.x']);
  });

  it('the same source id with two different hashes is a source conflict that no record may release through', () => {
    const a = rawManifest({ family: 'mandatory', assets: [approvedSign('sg.mandatory.a')] });
    const b = rawManifest({ family: 'prohibitory', sources: [rawSource({ sha256: HEX_B })], assets: [rawSign('sg.prohibitory.b', { kind: 'sign_face', files: { reference_png: 'assets/sg/prohibitory/b.png', renderer_svg: 'assets/sg/prohibitory/b.svg' }, file_sha256: { reference_png: HEX_A, renderer_svg: HEX_B } })] });
    const registry = compileRegistry(libraryOf(a, b));
    expect(registry.sourceConflicts).toEqual([{ sourceId: 'test-source', sha256s: [HEX_A, HEX_B], families: ['mandatory', 'prohibitory'] }]);
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [{ id: assetId('sg.mandatory.a'), version: 1 }] } });
    expect(result.ok).toBe(false);
    expect(result.rejections.map((r) => r.reason)).toContain('source_conflict');
  });

  it('renderer candidates without a manifest hash are errors', () => {
    const registry = compileRegistry(libraryOf(rawManifest({ assets: [rawSign('sg.mandatory.x', { file_sha256: { reference_png: HEX_A, renderer_svg: null } })] })));
    expect(codes(registry)).toContain('asset_registry.missing_file_hash');
    expect(registry.conflictedIds).toEqual(['sg.mandatory.x']);
  });

  it('reference records may not smuggle renderer candidates', () => {
    const png = 'assets/sg/assemblies/r.png';
    const svg = 'assets/sg/assemblies/r.svg';
    const registry = compileRegistry(libraryOf(rawManifest({ family: 'assemblies', assets: [rawReference('sg.assemblies.r', { files: { reference_png: png, renderer_svg: svg }, file_sha256: { reference_png: HEX_A, renderer_svg: HEX_B } })] })));
    expect(codes(registry)).toContain('asset_registry.reference_with_renderer_file');
    expect(registry.assets).toEqual([]);
    expect(registry.references.map((r) => r.id)).toEqual(['sg.assemblies.r']);
  });

  it('duplicate ids, foreign-family ids and path escapes are all rejected', () => {
    const registry = compileRegistry(libraryOf(rawManifest({ assets: [rawSign('sg.mandatory.dup'), rawSign('sg.mandatory.dup'), rawSign('sg.warning.wrong-family'), rawSign('sg.mandatory.escape', { files: { reference_png: '../../etc/passwd', renderer_svg: '/abs.svg' }, file_sha256: { reference_png: HEX_A, renderer_svg: HEX_B } })] })));
    const found = codes(registry);
    expect(found).toContain('asset_registry.duplicate_id');
    expect(found).toContain('asset_registry.id_family_mismatch');
    expect(found).toContain('asset_registry.unsafe_file_path');
  });

  it('release_ready without content/reuse approval evidence is self-approval and is rejected', () => {
    const registry = compileRegistry(libraryOf(rawManifest({ assets: [rawSign('sg.mandatory.x', { release_ready: true })] })));
    expect(codes(registry)).toContain('asset_registry.release_ready_without_approval');
    const resolver = createRegistryResolver(registry, { mode: 'release' }, HASH);
    expect(resolver.resolve({ id: assetId('sg.mandatory.x'), version: 1 }).ok).toBe(false);
  });

  it('a blocked record marked release_ready never resolves in release mode', () => {
    const registry = compileRegistry(libraryOf(rawManifest({ assets: [approvedSign('sg.mandatory.x', { review: { ...APPROVED_REVIEW, status: 'blocked', warnings: ['source unreadable'] } })] })));
    expect(codes(registry)).toContain('asset_registry.blocked_release_ready');
    const rejected = createRegistryResolver(registry, { mode: 'release' }, HASH).resolve({ id: assetId('sg.mandatory.x'), version: 1 });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('blocked');
  });

  it('hand-authored runtime assets may not claim extraction provenance, renderer files or approvals', () => {
    const forged = { ...ASSET_DEV_CAR, provenance: { ...ASSET_DEV_CAR.provenance, family: 'mandatory' as const, files: [{ role: 'renderer_svg' as const, path: 'assets/sg/mandatory/car.svg', sha256: null }] }, review: { ...ASSET_DEV_CAR.review, releaseReady: true, contentApproved: true, reuseApproved: true } };
    const registry = compileRegistry(libraryOf(rawManifest()), { runtimeAssets: [forged] });
    const found = codes(registry);
    expect(found).toContain('asset_registry.runtime_asset_claims_extraction');
    expect(found).toContain('asset_registry.runtime_asset_with_renderer_file');
    expect(found).toContain('asset_registry.runtime_asset_self_approved');
    expect(createRegistryResolver(registry, { mode: 'release' }, HASH).resolve({ id: forged.id, version: forged.version }).ok).toBe(false);
  });

  it('malformed assembly definitions: bad ids, dangling sources, dangling parents and cycles', () => {
    const library: ExtractionLibrary = {
      manifests: [rawManifest({ family: 'assemblies', assets: [rawReference('sg.assemblies.ref')] })],
      markingGeometry: {},
      assemblyDefinitions: definitionsFile([
        { id: 'sg.assemblies.definition.a', name: 'A', source_assets: ['sg.assemblies.ref', 'sg.assemblies.missing'], inherits: 'sg.assemblies.definition.b', release_ready: false, license_status: 'pending' },
        { id: 'sg.assemblies.definition.b', name: 'B', source_assets: [], inherits: 'sg.assemblies.definition.a', release_ready: false, license_status: 'pending' },
        { id: 'sg.assemblies.definition.c', name: 'C', source_assets: ['not an id'], inherits: 'sg.assemblies.definition.nope', release_ready: false, license_status: 'pending' },
      ], false),
    };
    const registry = compileRegistry(library);
    const found = codes(registry);
    expect(found).toContain('asset_registry.dangling_definition_source');
    expect(found).toContain('asset_registry.dangling_definition_parent');
    expect(found).toContain('asset_registry.definition_inheritance_cycle');
    expect(found).toContain('asset_registry.malformed_id');
    expect(registry.conflictedIds).toEqual(expect.arrayContaining(['sg.assemblies.definition.a', 'sg.assemblies.definition.b', 'sg.assemblies.definition.c']));
  });

  it('a corrupted real manifest record surfaces as a diagnostic, not an exception, and the rest still compiles', () => {
    const library = cloneLibrary(realLibrary());
    const victim = findAsset(library, 'sg.mandatory.stop');
    (victim as { source: { source_id: string } }).source.source_id = 'ghost';
    const registry = compileRegistry(library);
    expect(registry.conflictedIds).toEqual(['sg.mandatory.stop']);
    expect(registry.assets.length + registry.references.length).toBe(339);
  });
});

describe('transitive approval bypasses', () => {
  const head = { id: assetId('sg.assemblies.head'), version: 1 };

  function signalLibrary(options: { referenceApproved: boolean; definitionReady: boolean; parentReady: boolean; lensApproved: boolean }): ExtractionLibrary {
    const png = 'assets/sg/assemblies/ref.png';
    const reference = rawReference('sg.assemblies.ref', options.referenceApproved ? { release_ready: true, license_status: 'test', review: APPROVED_REVIEW, files: { reference_png: png }, file_sha256: { reference_png: HEX_A } } : {});
    const lens = rawSign('sg.assemblies.lens', { kind: 'signal', files: { reference_png: 'assets/sg/assemblies/lens.png' }, file_sha256: { reference_png: HEX_A }, representation: 'source_reference', ...(options.lensApproved ? { release_ready: true, license_status: 'test', review: APPROVED_REVIEW } : {}) });
    const headRecord = rawSign('sg.assemblies.head', { kind: 'signal', representation: 'source_reference', files: { reference_png: 'assets/sg/assemblies/head.png' }, file_sha256: { reference_png: HEX_A }, release_ready: true, license_status: 'test', review: APPROVED_REVIEW, assembly_definition_ids: ['sg.assemblies.definition.child'] });
    return {
      manifests: [rawManifest({ family: 'assemblies', assets: [reference, lens, headRecord] })],
      markingGeometry: {},
      assemblyDefinitions: definitionsFile([
        { id: 'sg.assemblies.definition.parent', name: 'Parent', source_assets: ['sg.assemblies.ref', 'sg.assemblies.lens'], release_ready: options.parentReady, license_status: 'test' },
        { id: 'sg.assemblies.definition.child', name: 'Child', source_assets: [], inherits: 'sg.assemblies.definition.parent', release_ready: options.definitionReady, license_status: 'test' },
      ]),
    };
  }

  it('a fully approved chain resolves in release mode (control case)', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: true, definitionReady: true, parentReady: true, lensApproved: true }));
    expect(codes(registry)).toEqual([]);
    const resolution = createRegistryResolver(registry, { mode: 'release' }, HASH).resolve(head);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.quarantined).toBe(false);
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [head] } });
    expect(result.ok).toBe(true);
    expect(result.accepted[0]?.definitions).toEqual(['sg.assemblies.definition.child', 'sg.assemblies.definition.parent']);
    expect(result.accepted[0]?.references).toEqual(['sg.assemblies.ref']);
  });

  it('an approved head is rejected when its cited definition is not release-ready', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: true, definitionReady: false, parentReady: true, lensApproved: true }));
    const resolution = createRegistryResolver(registry, { mode: 'release' }, HASH).resolve(head);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.detail).toContain('sg.assemblies.definition.child: definition_not_release_ready');
  });

  it('an approved head is rejected when an inherited (grand-parent) definition is not release-ready', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: true, definitionReady: true, parentReady: false, lensApproved: true }));
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [head] } });
    expect(result.ok).toBe(false);
    expect(result.rejections).toEqual([expect.objectContaining({ subject: 'sg.assemblies.definition.parent', reason: 'definition_not_release_ready', root: 'sg.assemblies.head@1' })]);
  });

  it('an approved head is rejected when the reference drawing two definitions deep is unapproved', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: false, definitionReady: true, parentReady: true, lensApproved: true }));
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [head] } });
    expect(result.ok).toBe(false);
    expect(result.rejections.map((r) => [r.subject, r.reason])).toEqual([['sg.assemblies.ref', 'reference_not_approved']]);
  });

  it('an approved head is rejected when a sibling lens asset reached through the definition is unapproved', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: true, definitionReady: true, parentReady: true, lensApproved: false }));
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [head] } });
    expect(result.ok).toBe(false);
    expect(result.rejections.map((r) => [r.subject, r.reason])).toEqual([['sg.assemblies.lens@1', 'not_release_ready']]);
    expect(buildDependencyIndex({ registry }).dependents(assetId('sg.assemblies.lens')).assets).toEqual([head]);
  });

  it('a definition cited by an approved head but absent from the file is a missing dependency', () => {
    const library = signalLibrary({ referenceApproved: true, definitionReady: true, parentReady: true, lensApproved: true });
    const registry = compileRegistry({ ...library, assemblyDefinitions: null });
    expect(codes(registry)).toContain('asset_registry.unknown_definition');
    const result = exportRelease({ registry, registryHash: HASH, roots: { assets: [head] } });
    expect(result.ok).toBe(false);
    expect(result.rejections.map((r) => r.reason)).toContain('unknown_definition');
  });

  it('development mode loads the same broken chain, but only with the explicit flag and flagged quarantined', () => {
    const registry = compileRegistry(signalLibrary({ referenceApproved: false, definitionReady: false, parentReady: false, lensApproved: false }));
    const resolver = createRegistryResolver(registry, { mode: 'development', loadQuarantined: true }, HASH);
    const resolution = resolver.resolve(head);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.quarantined).toBe(true);
    const lens = resolver.resolve({ id: assetId('sg.assemblies.lens'), version: 1 });
    expect(lens.ok).toBe(true);
    if (lens.ok) expect(lens.quarantined).toBe(true);
    expect(resolver.resolve({ id: assetId('sg.assemblies.ref'), version: 1 }).ok).toBe(false);
  });
});
