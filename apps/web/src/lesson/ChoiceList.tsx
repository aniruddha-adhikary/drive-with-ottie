import { type KeyboardEvent, useRef } from 'react';
import { type Option, type Question } from '@ottie/contracts';
import { TermText } from './TermText';
import { type HelpRequest, type LessonAttempt, type OptionResult } from './types';

interface Props {
  readonly question: Question;
  readonly attempt: LessonAttempt;
  readonly labelledBy: string;
  readonly onSelect: (optionId: string) => void;
  readonly onHelp: (request: HelpRequest) => void;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function optionResult(option: Option, attempt: LessonAttempt): OptionResult {
  if (attempt.phase !== 'graded' && attempt.phase !== 'continued') return 'neutral';
  const selected = attempt.selectedOptionId === option.id;
  if (option.correct) return selected ? 'correct_selected' : 'correct';
  return selected ? 'incorrect_selected' : 'neutral';
}

function resultCue(result: OptionResult): string | null {
  switch (result) {
    case 'correct_selected':
      return 'Your answer — correct';
    case 'correct':
      return 'Correct answer';
    case 'incorrect_selected':
      return 'Your answer';
    case 'neutral':
      return null;
  }
}

/**
 * Four answer choices as a radio group with roving focus. Choices are never inside a form, so no
 * key or tap here can submit; grading only happens through the primary action.
 */
export function ChoiceList({ question, attempt, labelledBy, onSelect, onHelp }: Props): React.JSX.Element {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const locked = attempt.phase === 'graded' || attempt.phase === 'continued';
  const selectedIndex = question.options.findIndex((o) => o.id === attempt.selectedOptionId);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const moveTo = (index: number) => {
    const count = question.options.length;
    const next = (index + count) % count;
    const option = question.options[next];
    if (!option) return;
    refs.current[next]?.focus();
    if (!locked) onSelect(option.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, option: Option) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        moveTo(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        moveTo(index - 1);
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        if (!locked) onSelect(option.id);
        break;
      default:
        break;
    }
  };

  return (
    <div className="ottie-choices" role="radiogroup" aria-labelledby={labelledBy} aria-disabled={locked || undefined} data-testid="choices">
      {question.options.map((option, index) => {
        const checked = option.id === attempt.selectedOptionId;
        const result = optionResult(option, attempt);
        const cue = resultCue(result);
        const cueId = `choice-${question.id}-${option.id}-cue`;
        return (
          <div
            key={option.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="radio"
            aria-checked={checked}
            aria-disabled={locked || undefined}
            aria-describedby={cue ? cueId : undefined}
            tabIndex={locked ? 0 : index === focusIndex ? 0 : -1}
            className="ottie-choice"
            data-option-id={option.id}
            data-state={locked ? 'locked' : checked ? 'selected' : 'idle'}
            data-result={result}
            onClick={() => {
              if (!locked) onSelect(option.id);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index, option);
            }}
          >
            <span className="ottie-choice__marker" aria-hidden="true">
              {LETTERS[index] ?? String(index + 1)}
            </span>
            <span className="ottie-choice__body">
              <span className="ottie-choice__text ottie-type-control">
                <TermText text={option.text} bindings={option.bindings} origin={{ kind: 'option', optionId: option.id }} onHelp={onHelp} />
              </span>
              {cue ? (
                <span id={cueId} className="ottie-choice__cue ottie-type-metadata">
                  {cue}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
