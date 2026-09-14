import { type KeyboardEvent, type MouseEvent } from 'react';
import { type TermBinding } from '@ottie/contracts';
import { segmentText } from './segments';
import { type HelpOrigin, type HelpRequest } from './types';

interface Props {
  readonly text: string;
  readonly bindings: readonly TermBinding[];
  readonly origin: HelpOrigin;
  readonly onHelp: (request: HelpRequest) => void;
}

function bindingLabel(binding: TermBinding): string {
  switch (binding.role) {
    case 'actual':
      return `Show ${binding.text} in the scene`;
    case 'hypothetical':
      return `Explain ${binding.text} (not present in this scene)`;
    case 'glossary':
      return `Explain ${binding.text}`;
  }
}

/**
 * Authored text with safe term slots. Every bound term is a real button, so it is focusable and
 * announced, and its activation is stopped before it can reach a surrounding choice or action.
 */
export function TermText({ text, bindings, origin, onHelp }: Props): React.JSX.Element {
  const segments = segmentText(text, bindings);
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') return <span key={index}>{segment.text}</span>;
        const { binding } = segment;
        const activate = (event: MouseEvent | KeyboardEvent) => {
          event.stopPropagation();
          event.preventDefault();
          onHelp({ binding, origin });
        };
        return (
          <button
            key={index}
            type="button"
            className="ottie-term"
            data-term-role={binding.role}
            data-term-id={binding.termId ?? undefined}
            aria-label={bindingLabel(binding)}
            onClick={activate}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                activate(event);
                return;
              }
              // Arrow keys and space must not reach a radio group around the term.
              if (event.key.startsWith('Arrow')) event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {segment.text}
          </button>
        );
      })}
    </>
  );
}
