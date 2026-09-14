import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/asset-registry',
  owner: 'C1',
  implemented: ['createInMemoryResolver', 'registryHashInput', 'computeRegistryHash (hash.node)'],
  pending: ['manifest family adapters', 'asset file loading', 'dependents index over content'],
};
