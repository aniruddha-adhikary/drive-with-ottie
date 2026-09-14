import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/learning-state',
  owner: 'U2',
  implemented: [
    'EMPTY_SNAPSHOT',
    'applyLearningEvent',
    'planQuestionQueue',
    'reviewCandidates',
    'nextStep',
    'learningSnapshotSchema',
    'persistedPayloadSchema',
    'createLearningStore',
    'createLearningSession',
    'DEFAULT_PRESENTATION',
    'reducePresentation',
    'createMemoryStorage',
    'createFixedClock',
    'createLocalStorageAdapter',
  ],
  pending: ['migrations beyond schema v1', 'IndexedDB adapter', 'mock-exam timing (D3)'],
};
