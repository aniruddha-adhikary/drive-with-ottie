import { type ModuleStatus, isSkeleton } from '@ottie/contracts';
import { MODULE_STATUS as ASSET_REGISTRY } from '@ottie/asset-registry';
import { MODULE_STATUS as LEARNING_STATE } from '@ottie/learning-state';
import { MODULE_STATUS as RENDERER_CAMERAS } from '@ottie/renderer-cameras';
import { MODULE_STATUS as RENDERER_EVIDENCE } from '@ottie/renderer-evidence';
import { MODULE_STATUS as RENDERER_GEOMETRY } from '@ottie/renderer-geometry';
import { MODULE_STATUS as REVIEW_EXPORT } from '@ottie/review-export';
import { MODULE_STATUS as SCENARIO_CORE } from '@ottie/scenario-core';
import { MODULE_STATUS as SCENARIO_VALIDATION } from '@ottie/scenario-validation';

export const MODULE_STATUSES: readonly ModuleStatus[] = [
  ASSET_REGISTRY,
  SCENARIO_CORE,
  SCENARIO_VALIDATION,
  RENDERER_GEOMETRY,
  RENDERER_CAMERAS,
  RENDERER_EVIDENCE,
  LEARNING_STATE,
  REVIEW_EXPORT,
];

export function ModuleStatusPanel(): React.JSX.Element {
  return (
    <div className="ottie-panel" data-testid="module-status">
      <h2>Module status</h2>
      <ul className="ottie-status-list">
        {MODULE_STATUSES.map((s) => (
          <li key={s.module}>
            <code>{s.module}</code> ({s.owner}): {isSkeleton(s) ? 'skeleton' : `${s.implemented.length} helper(s)`}, {s.pending.length} pending
          </li>
        ))}
      </ul>
    </div>
  );
}
