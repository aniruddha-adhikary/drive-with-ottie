import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/learning-state',
  owner: 'U2',
  implemented: ['createMemoryStorage', 'createFixedClock', 'createLocalStorageAdapter'],
  pending: ['LearningStore', 'event log + snapshot migration', 'run/attempt lifecycle', 'export/erase'],
};
