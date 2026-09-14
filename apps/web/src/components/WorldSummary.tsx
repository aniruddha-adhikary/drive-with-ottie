import { type DeepReadonly, type World } from '@ottie/contracts';

export function WorldSummary({ world }: { readonly world: DeepReadonly<World> }): React.JSX.Element {
  return (
    <div className="ottie-panel" data-testid="world-summary">
      <h2>World</h2>
      <dl>
        <dt>ID</dt>
        <dd>{world.id}</dd>
        <dt>Status</dt>
        <dd>
          {world.provenance.status}
          {world.provenance.usesQuarantinedAssets ? ' (uses quarantined assets)' : ''}
        </dd>
        <dt>Control regime</dt>
        <dd>{world.controlRegime}</dd>
        <dt>Lanes / movements</dt>
        <dd>
          {world.lanes.length} / {world.movements.length}
        </dd>
        <dt>Evidence</dt>
        <dd>{world.evidence.length}</dd>
      </dl>
    </div>
  );
}
