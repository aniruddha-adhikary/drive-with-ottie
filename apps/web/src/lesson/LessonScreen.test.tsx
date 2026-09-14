import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type PresentationState, type SceneView } from '@ottie/contracts';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS, QUESTION_GIVE_WAY } from '@ottie/contracts/fixtures';
import { LessonScreen } from './LessonScreen';
import { createStubSceneView } from './stub-scene-view';
import { type LessonActions, type LessonAttempt, type LessonScreenProps } from './types';

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}

const world = must(
  DEVELOPMENT_WORLDS.find((w) => w.id === QUESTION_GIVE_WAY.worldId),
  'fixture world',
);

const PRESENTED: LessonAttempt = { phase: 'presented', selectedOptionId: null, gradedCorrect: null };
const PRESENTATION: PresentationState = { cameraPreset: 'plan', viewerEnlarged: false, helpTermId: null, comparisonId: null };

function setup(overrides: Partial<LessonScreenProps> = {}, sceneView: SceneView = createStubSceneView()) {
  const actions = {
    onSelectOption: vi.fn<LessonActions['onSelectOption']>(),
    onCheckAnswer: vi.fn<LessonActions['onCheckAnswer']>(),
    onContinue: vi.fn<LessonActions['onContinue']>(),
    onPresentationChange: vi.fn<LessonActions['onPresentationChange']>(),
    onHelp: vi.fn<LessonActions['onHelp']>(),
  };
  const props: LessonScreenProps = {
    question: QUESTION_GIVE_WAY,
    world,
    bundle: DEVELOPMENT_CONTENT_BUNDLE,
    attempt: PRESENTED,
    presentation: PRESENTATION,
    preferences: DEFAULT_PREFERENCES,
    sceneView,
    ...actions,
    ...overrides,
  };
  const view = render(<LessonScreen {...props} />);
  return { ...view, actions, props };
}

describe('LessonScreen', () => {
  it('renders one scene, the stem, four full-text choices and a disabled Check answer', async () => {
    setup();
    expect(await screen.findByTestId('scene-stub')).toHaveAttribute('data-preset', 'plan');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(QUESTION_GIVE_WAY.stem);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    QUESTION_GIVE_WAY.options.forEach((option, i) => {
      expect(radios[i]).toHaveTextContent(option.text);
    });
    expect(screen.getAllByRole('button', { name: 'Enlarge' })).toHaveLength(1);
    const primary = screen.getByTestId('primary-action');
    expect(primary).toHaveTextContent('Check answer');
    expect(primary).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Camera view' })).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('selects with pointer and keyboard without ever submitting', async () => {
    const user = userEvent.setup();
    const { actions, rerender, props } = setup();
    const radios = screen.getAllByRole('radio');
    await user.click(must(radios[1], 'radio'));
    expect(actions.onSelectOption).toHaveBeenCalledWith('b');
    expect(actions.onCheckAnswer).not.toHaveBeenCalled();

    rerender(<LessonScreen {...props} attempt={{ phase: 'selected', selectedOptionId: 'b', gradedCorrect: null }} />);
    const selected = must(screen.getAllByRole('radio')[1], 'radio');
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected).toHaveAttribute('data-state', 'selected');
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('primary-action')).toBeEnabled();

    selected.focus();
    await user.keyboard('{ArrowDown}');
    expect(actions.onSelectOption).toHaveBeenLastCalledWith('c');
    expect(screen.getAllByRole('radio')[2]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(actions.onCheckAnswer).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('primary-action'));
    expect(actions.onCheckAnswer).toHaveBeenCalledTimes(1);
  });

  it('shows graded feedback, locks the choices and turns the action into Continue', async () => {
    const user = userEvent.setup();
    const { actions } = setup({ attempt: { phase: 'graded', selectedOptionId: 'b', gradedCorrect: false } });
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-disabled', 'true');
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('data-result', 'correct');
    expect(radios[0]).toHaveTextContent('Correct answer');
    expect(radios[1]).toHaveAttribute('data-result', 'incorrect_selected');
    expect(radios[1]).toHaveTextContent('Your answer');
    await user.click(must(radios[2], 'radio'));
    expect(actions.onSelectOption).not.toHaveBeenCalled();

    const feedback = screen.getByTestId('feedback');
    expect(feedback).toHaveTextContent('Not quite.');
    expect(feedback).toHaveTextContent(DEVELOPMENT_CONTENT_BUNDLE.explanations.find((e) => e.id === QUESTION_GIVE_WAY.options[1].rationaleExplanationId)?.paragraphs[0] ?? 'missing');

    const primary = screen.getByTestId('primary-action');
    expect(primary).toHaveTextContent('Continue');
    await user.click(primary);
    expect(actions.onContinue).toHaveBeenCalledTimes(1);
    expect(actions.onCheckAnswer).not.toHaveBeenCalled();
  });

  it('exposes term slots in the stem and choices that open help without selecting', async () => {
    const user = userEvent.setup();
    const { actions } = setup();
    const stem = screen.getByRole('heading', { level: 1 });
    const stemTerm = within(stem).getByRole('button', { name: /double broken lines/ });
    await user.click(stemTerm);
    const stemCall = must(actions.onHelp.mock.calls[0], 'help call')[0];
    expect(stemCall.origin).toEqual({ kind: 'stem' });
    expect(stemCall.binding.text).toBe('double broken lines');

    const optionB = must(screen.getAllByRole('radio')[1], 'radio');
    const optionTerm = within(optionB).getByRole('button', { name: /a stop line/ });
    await user.click(optionTerm);
    const optionCall = must(actions.onHelp.mock.calls[1], 'help call')[0];
    expect(optionCall.origin).toEqual({ kind: 'option', optionId: 'b' });
    expect(optionCall.binding.role).toBe('hypothetical');
    optionTerm.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(actions.onHelp).toHaveBeenCalledTimes(4);
    expect(actions.onSelectOption).not.toHaveBeenCalled();
    expect(actions.onCheckAnswer).not.toHaveBeenCalled();
  });

  it('puts camera selection inside the enlarged viewer and only changes presentation state', async () => {
    const user = userEvent.setup();
    const { actions, rerender, props } = setup({ attempt: { phase: 'selected', selectedOptionId: 'a', gradedCorrect: null } });
    await user.click(screen.getByRole('button', { name: 'Enlarge' }));
    expect(actions.onPresentationChange).toHaveBeenCalledWith({ ...PRESENTATION, viewerEnlarged: true });

    rerender(<LessonScreen {...props} presentation={{ ...PRESENTATION, viewerEnlarged: true }} />);
    const dialog = screen.getByRole('dialog', { name: 'Scene viewer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close scene viewer' })).toHaveFocus();
    const cameras = within(dialog).getByRole('group', { name: 'Camera view' });
    expect(within(cameras).getByRole('button', { name: 'Top view' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(cameras).getByRole('button', { name: 'Approach view' }));
    expect(actions.onPresentationChange).toHaveBeenLastCalledWith({ ...PRESENTATION, viewerEnlarged: true, cameraPreset: 'approach_ego' });

    rerender(<LessonScreen {...props} presentation={{ ...PRESENTATION, viewerEnlarged: true, cameraPreset: 'approach_ego' }} />);
    expect(await screen.findByTestId('scene-stub')).toHaveAttribute('data-preset', 'approach_ego');
    await user.click(within(dialog).getByRole('button', { name: 'Reset view' }));
    expect(actions.onPresentationChange).toHaveBeenLastCalledWith(expect.objectContaining({ cameraPreset: 'plan' }));

    await user.keyboard('{Escape}');
    expect(actions.onPresentationChange).toHaveBeenLastCalledWith(expect.objectContaining({ viewerEnlarged: false }));
    expect(actions.onSelectOption).not.toHaveBeenCalled();
    expect(actions.onCheckAnswer).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true');

    rerender(<LessonScreen {...props} presentation={PRESENTATION} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enlarge' })).toHaveFocus();
  });

  it('mounts the SceneView port once and forwards read-only input', async () => {
    const mount = vi.fn<SceneView['mount']>(() => Promise.resolve());
    const update = vi.fn<SceneView['update']>();
    const setPreset = vi.fn<SceneView['setPreset']>();
    const unmount = vi.fn<SceneView['unmount']>();
    const sceneView: SceneView = { mount, update, setPreset, unmount, onViewChange: () => () => undefined };
    const { unmount: unmountScreen } = setup({}, sceneView);
    await vi.waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    const input = mount.mock.calls[0]?.[1];
    expect(input?.world.id).toBe(world.id);
    expect(input?.preset).toBe('plan');
    expect(input?.evidence.map((e) => e.id).sort()).toEqual([...QUESTION_GIVE_WAY.requiredEvidenceIds].sort());
    expect(input?.viewport.widthPx).toBeGreaterThan(0);
    unmountScreen();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it('applies text scale through the theme scope and keeps the choices in the normal document flow', () => {
    setup({ preferences: { ...DEFAULT_PREFERENCES, textScale: 2, reducedMotion: true } });
    const theme = screen.getByTestId('lesson').parentElement;
    expect(theme).toHaveAttribute('data-text-scale', '2');
    expect(theme).toHaveAttribute('data-reduced-motion', 'true');
    expect(theme?.style.getPropertyValue('--ottie-text-scale')).toBe('2');
    expect(theme?.style.getPropertyValue('--ottie-motion-duration')).toBe('0ms');
    expect(screen.getByRole('radiogroup').closest('form')).toBeNull();
  });
});
