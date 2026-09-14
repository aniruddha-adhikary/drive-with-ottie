import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/scenario-core',
  owner: 'C2',
  implemented: [
    'createSeededRng',
    'createTemplateGenerator / createDevelopmentGenerator (three development templates: give-way T, STOP access, signalised crossroads)',
    'directed lanes, lane-boundary/roadside/control-line/support-base anchors, exact quarter-turn approach rotation',
    'template/version/schema/source-profile/parameter validation with diagnostics',
    'declared safe variation only (non-ego progress, daylight) from the seeded RNG; answer-bearing fields never vary',
    'authored priority/conflict/yield relationships with consistency and lane-connectivity checks',
    'signal aspect state and movement permissions derived from aspect bindings',
    'immutable worlds (freezeDeep) with provenance and canonical hash',
  ],
  pending: ['comparison world derivation (mutation catalogue application)', 'additional templates beyond the three development layouts', 'east–west signal heads (unsettled by sources)'],
};
