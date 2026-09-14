import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/asset-registry',
  owner: 'C1',
  implemented: [
    'compileRegistry over the six real manifests (sign/marking/signal adapters, reference records kept apart)',
    'record shape checks: ids, dangling sources, missing hashes, duplicate ids, source hash conflicts, self-approval',
    'assembly definitions with inheritance and reference evidence',
    'buildDependencyIndex: exact closures for asset/world/template/bundle and reverse asset → world/template/question/term/bundle',
    'createRegistryResolver (explicit development load, transitive release checks)',
    'exportRelease: default rejects unapproved, conflicted, blocked, retired, unreviewed or transitively unapproved records',
    'createInMemoryResolver, registryHashInput, computeRegistryHash (hash.node)',
    'loadExtractionLibrary, verifyFileHashes, verifySourcePdfs (library.node)',
  ],
  pending: [
    'sign face geometry (FaceProfile) for uncurated faces: manifests hold dimensions but no shape/front frame',
    'signal head geometry for uncurated signal records',
    'context curation (allowedContexts) for the 300+ uncurated assets',
  ],
};
