/**
 * @ottie/asset-registry — C1 owns this module.
 *
 * Browser-safe: compiles parsed extraction manifests into runtime records (`compileRegistry`),
 * indexes dependencies both ways (`buildDependencyIndex`), resolves refs (`createRegistryResolver`)
 * and produces the strict release export (`exportRelease`). Filesystem loading, byte verification
 * and SHA-256 hashing live in `./library.node` and `./hash.node`.
 */
export { MODULE_STATUS } from './status';
export { createInMemoryResolver, createRegistryResolver, type RegistryResolver, type RegistryResolverOptions } from './resolver';
export { registryHashInput } from './hash';
export { compileRegistry, COMPILED_ASSET_VERSION, REFERENCE_KINDS, RUNTIME_KINDS, type CompileOptions } from './compile';
export { type AssetCuration, type CurationTable, curationFromDefinitions } from './curation';
export {
  type AssemblyDefinitionRecord,
  type AssemblyDefinitionsFile,
  type CompiledRegistry,
  type ExtractionLibrary,
  type FileClassification,
  type ReferenceRecord,
  type SourceConflict,
  RENDERER_FILE_ROLES,
  classifyFiles,
  parseAssemblyDefinitionsFile,
  refKey,
} from './records';
export {
  type AssetDependents,
  type DependencyClosure,
  type DependencyIndex,
  type DependencyInputs,
  buildDependencyIndex,
  bundleKey,
} from './dependencies';
export {
  type ReleaseExport,
  type ReleaseExportInput,
  type ReleaseRejection,
  type ReleaseRejectionReason,
  type ReleaseRoots,
  assessClosure,
  exportRelease,
  isApproved,
} from './release';
export { MARKING_ROLE_BY_ID, markingGeometryFor, markingRoleFor } from './adapters/markings';
export { signRoleFor } from './adapters/signs';
export { REGISTRY_VALIDATOR, registryDiagnostic } from './diagnostics';
