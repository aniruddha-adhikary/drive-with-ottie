import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/scenario-core',
  owner: 'C2',
  implemented: ['createSeededRng', 'createFixtureGenerator (returns fixtures only, no variation)'],
  pending: ['template parameter sampling', 'safe variation', 'comparison world derivation', 'canonical world hashing'],
};
