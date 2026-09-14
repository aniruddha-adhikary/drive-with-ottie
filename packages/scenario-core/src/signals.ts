import { type AspectStateEntry, type EntityId, type MovementId, type MovementPermission, type SignalAspect } from '@ottie/contracts';

export type CircularState = 'red' | 'amber' | 'green';
export type ArrowState = 'red' | 'amber' | 'green' | 'dark';

export interface HeadSignalInput {
  readonly headId: EntityId;
  /** The head's aspects with their movement bindings; every controlled movement must be bound here. */
  readonly aspects: readonly SignalAspect[];
  readonly circular: CircularState;
  readonly rightArrow: ArrowState;
}

export interface HeadSignalState {
  readonly aspectStates: readonly AspectStateEntry[];
  readonly movementPermissions: readonly MovementPermission[];
}

/**
 * Derives lit/dark aspect states and per-movement permissions from the semantic signal state of a
 * head. Meaning comes from the aspect → movement bindings, never from lens position or artwork:
 * a lit arrow governs exactly the movements bound to it (Rule 11: a red arrow prohibits those
 * movements while a circular green still permits the rest); with the arrow column dark the
 * circular column governs every movement bound to it.
 */
export function deriveHeadSignalState(input: HeadSignalInput): HeadSignalState {
  const circularAspects = input.aspects.filter((a) => a.shape === 'circular');
  const arrowAspects = input.aspects.filter((a) => a.shape === 'arrow_right');
  const litCircular = circularAspects.find((a) => a.colour === input.circular);
  const litArrow = input.rightArrow === 'dark' ? undefined : arrowAspects.find((a) => a.colour === input.rightArrow);
  if (!litCircular) throw new RangeError(`head ${input.headId} has no circular ${input.circular} aspect`);
  if (input.rightArrow !== 'dark' && !litArrow) throw new RangeError(`head ${input.headId} has no right-arrow ${input.rightArrow} aspect`);

  const aspectStates: AspectStateEntry[] = input.aspects.map((a) => ({
    headId: input.headId,
    slot: a.slot,
    state: a === litCircular || a === litArrow ? 'lit' : 'dark',
  }));

  const movementIds: MovementId[] = [];
  for (const a of input.aspects) for (const m of a.controlsMovementIds) if (!movementIds.includes(m)) movementIds.push(m);

  const movementPermissions: MovementPermission[] = movementIds.map((movementId) => {
    if (litArrow?.controlsMovementIds.includes(movementId)) {
      return {
        movementId,
        permission: input.rightArrow === 'green' ? 'proceed_protected' : input.rightArrow === 'amber' ? 'prepare_to_stop' : 'stop',
        // Precedence order: the lit arrow outranks the simultaneously lit circular aspect.
        governedByAspects: [
          { headId: input.headId, slot: litArrow.slot },
          { headId: input.headId, slot: litCircular.slot },
        ],
      };
    }
    return {
      movementId,
      permission: input.circular === 'green' ? 'proceed_permissive' : input.circular === 'amber' ? 'prepare_to_stop' : 'stop',
      governedByAspects: [{ headId: input.headId, slot: litCircular.slot }],
    };
  });

  return { aspectStates, movementPermissions };
}
