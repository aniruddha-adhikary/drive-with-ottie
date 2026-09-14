/**
 * DEVELOPMENT fixtures. Everything exported here uses quarantined assets (release_ready=false) and
 * unreviewed original content. Nothing here is release-approved; release exports must reject
 * worlds whose `provenance.status !== 'release_candidate'`.
 */
export * from './sources';
export * from './assets';
export * from './registry-hash';
export * from './build';
export * from './give-way-t-junction';
export * from './stop-development-access';
export * from './signalised-junction-right-arrow';
export * from './content';
export * from './templates';
export * from './mutations';

import { type DeepReadonly } from '../immutable';
import { type World } from '../world';
import { GIVE_WAY_T_JUNCTION } from './give-way-t-junction';
import { SIGNALISED_JUNCTION_RIGHT_ARROW } from './signalised-junction-right-arrow';
import { STOP_DEVELOPMENT_ACCESS } from './stop-development-access';

export const DEVELOPMENT_WORLDS: readonly DeepReadonly<World>[] = [
  GIVE_WAY_T_JUNCTION,
  STOP_DEVELOPMENT_ACCESS,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
];
