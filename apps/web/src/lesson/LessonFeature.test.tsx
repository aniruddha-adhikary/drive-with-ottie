import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures';
import LessonFeature from './LessonFeature';

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

describe('LessonFeature (development preview)', () => {
  it('walks presented -> selected -> graded -> continue over the fixture questions', async () => {
    const user = userEvent.setup();
    render(<LessonFeature />);
    const first = must(DEVELOPMENT_CONTENT_BUNDLE.questions[0], 'question');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(first.stem);
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'presented');

    const correctIndex = first.options.findIndex((o) => o.correct);
    await user.click(must(screen.getAllByRole('radio')[correctIndex], 'radio'));
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');

    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'graded');
    expect(screen.getByTestId('feedback')).toHaveTextContent('Correct.');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(must(DEVELOPMENT_CONTENT_BUNDLE.questions[1], 'question').stem);
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'presented');
    expect(screen.getByTestId('progress-label')).toHaveTextContent('Question 2 of 3');
  });

  it('records help requests without touching the selection', async () => {
    const user = userEvent.setup();
    render(<LessonFeature />);
    const term = must(screen.getAllByRole('button', { name: /^Show / })[0], 'term');
    await user.click(term);
    expect(screen.getByTestId('last-help')).toHaveTextContent(/Help requested/);
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'presented');
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
  });
});
