import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { QUESTION_GIVE_WAY, TERM_GIVE_WAY_LINE, TERM_STOP_LINE } from '@ottie/contracts/fixtures';
import GlossaryFeature from './GlossaryFeature';

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}

/** Everything about the attempt that the glossary must leave alone. */
function attemptSnapshot() {
  return {
    states: screen
      .getAllByRole('radio')
      .map((r) => `${r.getAttribute('aria-checked') ?? ''}/${r.getAttribute('data-state') ?? ''}`),
    primary: screen.getByTestId('primary-action').textContent,
    primaryDisabled: screen.getByTestId<HTMLButtonElement>('primary-action').disabled,
    scene: screen.getByTestId('scene-stub').getAttribute('data-preset'),
    stem: must(screen.getByRole('heading', { level: 1 }).textContent, 'stem'),
  };
}

describe('GlossaryFeature (U1 shell + glossary explainer)', () => {
  beforeAll(() => {
    // jsdom has no layout; scroll restoration is asserted in GlossaryExplainer.test.tsx.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  it('opens the explainer from a stem term without selecting, grading or moving the scene, then restores focus', async () => {
    const user = userEvent.setup();
    render(<GlossaryFeature />);
    await screen.findByTestId('scene-stub');
    const before = attemptSnapshot();

    const stemBinding = must(
      QUESTION_GIVE_WAY.stemBindings.find((b) => b.termId === TERM_GIVE_WAY_LINE.id),
      'stem binding',
    );
    const stemTerm = screen.getByRole('button', { name: `Show ${stemBinding.text} in the scene` });
    stemTerm.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog', { name: TERM_GIVE_WAY_LINE.label });
    expect(within(screen.getByTestId('help-slot')).getByRole('dialog')).toBe(dialog);
    expect(screen.getByTestId('glossary-close')).toHaveFocus();
    expect(attemptSnapshot()).toEqual(before);
    expect(screen.queryByTestId('last-glossary-request')).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stemTerm).toHaveFocus();
    expect(attemptSnapshot()).toEqual(before);
  });

  it('opens hypothetical help from a choice without selecting that choice, and keeps an existing selection', async () => {
    const user = userEvent.setup();
    render(<GlossaryFeature />);
    await screen.findByTestId('scene-stub');
    const radios = screen.getAllByRole('radio');
    await user.click(must(radios[0], 'first choice'));
    expect(must(screen.getAllByRole('radio')[0], 'first choice')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const before = attemptSnapshot();

    const hypothetical = must(
      QUESTION_GIVE_WAY.options.find((o) => o.bindings.some((b) => b.role === 'hypothetical')),
      'hypothetical option',
    );
    const optionRadio = screen.getByRole('radio', {
      name: new RegExp(hypothetical.text.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    const termButton = within(optionRadio).getByRole('button', {
      name: /not present in this scene/,
    });
    await user.click(termButton);

    expect(screen.getByRole('dialog', { name: TERM_STOP_LINE.label })).toHaveAttribute(
      'data-binding-role',
      'hypothetical',
    );
    expect(screen.getByTestId('glossary-presence')).toHaveAttribute(
      'data-presence',
      'not_in_scene',
    );
    expect(attemptSnapshot()).toEqual(before);
    expect(must(screen.getAllByRole('radio')[0], 'first choice')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(optionRadio).toHaveAttribute('aria-checked', 'false');

    // Asking for the comparison is an explicit request, not a scene mutation.
    await user.click(screen.getByTestId('glossary-compare'));
    expect(screen.getByTestId('last-glossary-request')).toHaveTextContent(
      'cmp.give-way-vs-stop (replace_control)',
    );
    expect(attemptSnapshot()).toEqual(before);

    // Keys typed in the sheet never reach the radiogroup or the primary action.
    await user.keyboard('{ArrowDown}{Enter} ');
    expect(attemptSnapshot()).toEqual(before);

    await user.click(screen.getByTestId('glossary-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(termButton).toHaveFocus();
    expect(attemptSnapshot()).toEqual(before);
  });

  it('works at 2x text scale', async () => {
    const user = userEvent.setup();
    const { container } = render(<GlossaryFeature />);
    await screen.findByTestId('scene-stub');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    const scope = must(container.querySelector<HTMLElement>('.ottie-theme'), 'theme scope');
    expect(scope.style.getPropertyValue('--ottie-text-scale')).toBe('2');
    await user.click(screen.getByRole('button', { name: /double broken lines/ }));
    const dialog = screen.getByRole('dialog', { name: TERM_GIVE_WAY_LINE.label });
    expect(dialog.style.height).toBe('');
    expect(screen.getByTestId('glossary-meaning')).toHaveTextContent(
      TERM_GIVE_WAY_LINE.shortDefinition,
    );
    expect(screen.getByTestId('glossary-close')).toHaveFocus();
  });
});
