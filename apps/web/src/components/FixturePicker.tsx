import { type DeepReadonly, type World } from '@ottie/contracts';

interface Props {
  readonly worlds: readonly DeepReadonly<World>[];
  readonly selected: DeepReadonly<World>;
  readonly onSelect: (world: DeepReadonly<World>) => void;
}

export function FixturePicker({ worlds, selected, onSelect }: Props): React.JSX.Element {
  return (
    <div className="ottie-panel">
      <h2>Development fixture</h2>
      <div className="ottie-controls" role="group" aria-label="Development fixture">
        {worlds.map((w) => (
          <button key={w.id} type="button" aria-pressed={w.id === selected.id} onClick={() => {
            onSelect(w);
          }}>
            {w.id}
          </button>
        ))}
      </div>
    </div>
  );
}
