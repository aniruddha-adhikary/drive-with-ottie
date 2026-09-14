import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { type AttemptState, type LearningSnapshot, type Question } from '@ottie/contracts';
import LessonFeature, { ROAD_PER_QUESTION_M } from './LessonFeature';
import { LESSON_STORAGE_KEY } from './runtime';
import { createTestRuntime, starterContent } from './test-runtime';

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}

async function lessonReady(): Promise<HTMLElement> {
  const lesson = await screen.findByTestId('lesson', undefined, { timeout: 15_000 });
  await waitFor(() => {
    expect(screen.getByTestId('scene-host')).toHaveAttribute('data-status', 'ready');
  }, { timeout: 15_000 });
  return lesson;
}

function shownQuestion(): Question {
  const stem = screen.getByRole('heading', { level: 1 }).textContent ?? '';
  return must(
    starterContent().bundle.questions.find((q) => q.stem === stem),
    `question for stem "${stem}"`,
  );
}

function currentAttempt(snapshot: LearningSnapshot): AttemptState {
  const run = must(snapshot.runs.find((r) => !r.ended), 'open run');
  return must(snapshot.attempts.find((a) => a.id === run.currentAttemptId), 'current attempt');
}

async function answerCorrectly(user: ReturnType<typeof userEvent.setup>, question: Question): Promise<void> {
  const index = question.options.findIndex((o) => o.correct);
  await user.click(must(screen.getAllByRole('radio')[index], 'radio'));
  await user.click(screen.getByRole('button', { name: 'Check answer' }));
  await screen.findByText('Correct.');
}

describe('LessonFeature (real starter content, R1/R2 stage, U2 store)', () => {
  it('presents a generated starter question with its world drawn and evidence fitted before Enlarge', async () => {
    const t = createTestRuntime();
    render(<LessonFeature runtime={t.runtime} />);
    const lesson = await lessonReady();

    const question = shownQuestion();
    expect(lesson).toHaveAttribute('data-phase', 'presented');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByTestId('progress-label')).toHaveTextContent('+0.0 km · Question 1');
    expect(screen.getByTestId('development-status')).toHaveTextContent(/Development content, not approved for release/);
    expect(screen.getByTestId('development-status')).toHaveTextContent(String(starterContent().closure.assets.length));

    // The world on the stage is the question's pinned generated world, not a fixture.
    const scene = must(t.runtime.stage.renderer.scene, 'scene');
    expect(scene.worldId).toBe(question.worldId);
    const world = must(t.runtime.worldFor(question.worldId), 'world');
    expect(world.provenance.status).toBe('generated');
    expect(world.provenance.canonicalHash).not.toBeNull();
    expect(scene.issues.filter((i) => i.code === 'artwork_unavailable' || i.code === 'unresolved_asset')).toEqual([]);

    // R2 chose a preset at the compact size in which every requirement this question needs is visible.
    expect(t.surface.frames.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('scene-no-webgl')).toBeNull();
    const host = screen.getByTestId('scene-host');
    expect(host.dataset.preset).not.toBe('entity_detail');
    const hidden = within(host).queryByTestId('hidden-evidence');
    expect(hidden).toBeNull();

    // Camera controls live only inside the enlarged viewer.
    expect(screen.queryByRole('group', { name: 'Camera view' })).toBeNull();
    expect(screen.getByRole('button', { name: /Enlarge/ })).toBeInTheDocument();
  });

  it('grades once, continues, persists, and restores run/attempt/selection/seed from storage', async () => {
    const user = userEvent.setup();
    const t = createTestRuntime();
    const first = render(<LessonFeature runtime={t.runtime} />);
    await lessonReady();
    const question = shownQuestion();
    const before = currentAttempt(t.runtime.store.snapshot());

    const wrongIndex = question.options.findIndex((o) => !o.correct);
    await user.click(must(screen.getAllByRole('radio')[wrongIndex], 'radio'));
    await waitFor(() => {
      expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    });

    // Two Check presses dispatched before the first grade lands grade exactly once (U2 dedupes).
    const check = screen.getByRole('button', { name: 'Check answer' });
    fireEvent.click(check);
    fireEvent.click(check);
    await waitFor(() => {
      expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'graded');
    });
    const graded = t.runtime.store.snapshot();
    expect(graded.appliedEventIds.filter((id) => id.endsWith('.e3'))).toHaveLength(1);
    const gradedAttempt = currentAttempt(graded);
    expect(gradedAttempt.id).toBe(before.id);
    expect(gradedAttempt.seed).toBe(before.seed);
    expect(gradedAttempt.gradedCorrect).toBe(false);
    expect(screen.getByTestId('feedback')).toHaveAttribute('data-result', 'incorrect');

    // State is durable on the device before the learner continues.
    const persisted = await t.storage.get(LESSON_STORAGE_KEY);
    expect(persisted).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByTestId('progress-label')).toHaveTextContent(`+${(ROAD_PER_QUESTION_M / 1000).toFixed(1)} km · Question 2`);
    }, { timeout: 15_000 });
    await lessonReady();
    const second = shownQuestion();
    expect(second.id).not.toBe(question.id);

    // Select on the second question, then reload the app against the same storage: the same run,
    // attempt, selected option and seed come back without re-presenting or re-grading anything.
    await user.click(must(screen.getAllByRole('radio')[1], 'radio'));
    await waitFor(() => {
      expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    });
    const beforeReload = currentAttempt(t.runtime.store.snapshot());
    first.unmount();

    const again = createTestRuntime({ storage: t.storage, startMs: 1_760_000_500_000 });
    render(<LessonFeature runtime={again.runtime} />);
    await lessonReady();
    expect(shownQuestion().id).toBe(second.id);
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    expect(must(screen.getAllByRole('radio')[1], 'radio')).toBeChecked();
    const restored = currentAttempt(again.runtime.store.snapshot());
    expect(restored).toEqual(beforeReload);
    expect(again.runtime.store.snapshot().runs).toHaveLength(1);
    expect(again.runtime.store.loadReport()?.status).toBe('ok');
  });

  it('keeps attempt, seed, camera and traffic untouched while help and a comparison are open', async () => {
    const user = userEvent.setup();
    const t = createTestRuntime();
    render(<LessonFeature runtime={t.runtime} />);
    await lessonReady();
    const question = shownQuestion();
    const world = must(t.runtime.worldFor(question.worldId), 'world');

    await user.click(must(screen.getAllByRole('radio')[0], 'radio'));
    await waitFor(() => {
      expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    });
    const before = currentAttempt(t.runtime.store.snapshot());
    const presetBefore = screen.getByTestId('scene-host').dataset.preset;
    const framesBefore = t.surface.frames.length;
    const sceneBefore = must(t.runtime.stage.renderer.scene, 'scene');
    const facesBefore = [...sceneBefore.entities.values()]
      .filter((e) => e.kind === 'sign_face' || e.kind === 'signal_head')
      .map((e) => ({ id: e.id, q: e.object.getWorldQuaternion(e.object.quaternion.clone()).toArray(), p: e.object.getWorldPosition(e.object.position.clone()).toArray() }));

    // Open help from a glossary/actual term.
    const terms = screen.getAllByRole('button', { name: /^Show / });
    await user.click(must(terms[0], 'term'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const during = currentAttempt(t.runtime.store.snapshot());
    expect(during.selectedOptionId).toBe(before.selectedOptionId);
    expect(during.seed).toBe(before.seed);
    expect(during.phase).toBe('selected');
    expect(during.helpOpens).toBeGreaterThanOrEqual(before.helpOpens);
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    expect(screen.getByTestId('scene-host').dataset.preset).toBe(presetBefore);
    // Opening help repaints nothing: the world, camera and traffic are exactly as before.
    expect(t.surface.frames.length).toBe(framesBefore);
    expect(t.runtime.stage.renderer.scene).toBe(sceneBefore);

    await user.click(screen.getByTestId('glossary-close'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Open a hypothetical binding that carries a comparison and show it on the SEPARATE stage.
    const hypothetical = screen.getAllByRole('button', { name: /^Show / }).find((b) => b.dataset.termRole === 'hypothetical');
    if (hypothetical) {
      await user.click(hypothetical);
      const compare = await screen.findByTestId('glossary-compare');
      await user.click(compare);
      const panel = await screen.findByTestId('comparison-panel');
      expect(panel.dataset.state).toBe('available');
      const comparisonId = must(panel.dataset.comparisonId, 'comparison id');
      const outcome = must(t.runtime.comparisonFor(comparisonId), 'outcome');
      if (outcome.kind !== 'available') throw new Error('expected available comparison');
      await waitFor(() => {
        expect(within(panel).getByTestId('scene-host')).toHaveAttribute('data-status', 'ready');
      }, { timeout: 15_000 });

      // The comparison world is a different, immutable world drawn by a different renderer.
      expect(outcome.world.id).not.toBe(world.id);
      expect(outcome.world.provenance.canonicalHash).not.toBe(world.provenance.canonicalHash);
      expect(must(t.runtime.comparisonStage.renderer.scene, 'comparison scene').worldId).toBe(outcome.world.id);
      expect(must(t.runtime.stage.renderer.scene, 'lesson scene').worldId).toBe(world.id);
      expect(t.runtime.worldFor(question.worldId)).toBe(world);
      const after = currentAttempt(t.runtime.store.snapshot());
      expect(after.selectedOptionId).toBe(before.selectedOptionId);
      expect(after.seed).toBe(before.seed);
      expect(after.phase).toBe('selected');
      expect(after.worldId).toBe(before.worldId);
      expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');

      await user.click(screen.getByTestId('comparison-close'));
      await waitFor(() => {
        expect(screen.queryByTestId('comparison-panel')).toBeNull();
      });
    }

    // Physical controls never turned to face the camera while the views changed.
    const facesAfter = [...must(t.runtime.stage.renderer.scene, 'scene').entities.values()]
      .filter((e) => e.kind === 'sign_face' || e.kind === 'signal_head')
      .map((e) => ({ id: e.id, q: e.object.getWorldQuaternion(e.object.quaternion.clone()).toArray(), p: e.object.getWorldPosition(e.object.position.clone()).toArray() }));
    expect(facesAfter).toEqual(facesBefore);
  });

  it('offers review and other stretches when the content is exhausted instead of ending the session', async () => {
    const user = userEvent.setup();
    const t = createTestRuntime();
    render(<LessonFeature runtime={t.runtime} />);
    await lessonReady();

    const total = starterContent().bundle.questions.length;
    let wrongOnce = false;
    for (let index = 0; index < total; index += 1) {
      await lessonReady();
      const question = shownQuestion();
      if (!wrongOnce) {
        wrongOnce = true;
        const wrongIndex = question.options.findIndex((o) => !o.correct);
        await user.click(must(screen.getAllByRole('radio')[wrongIndex], 'radio'));
        await user.click(screen.getByRole('button', { name: 'Check answer' }));
        await screen.findByText(/Not quite/);
      } else {
        await answerCorrectly(user, question);
      }
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      if (index < total - 1) {
        await waitFor(() => {
          expect(screen.getByTestId('progress-label')).toHaveTextContent(`Question ${index + 2}`);
        }, { timeout: 15_000 });
      }
    }

    const exhausted = await screen.findByTestId('lesson-exhausted', undefined, { timeout: 15_000 });
    expect(exhausted).toHaveTextContent(/driven this whole stretch/);
    expect(screen.getByTestId('review-candidates').children.length).toBeGreaterThan(0);
    expect(screen.getByTestId('review-again')).toBeInTheDocument();
    expect(screen.getByTestId('drive-again')).toBeInTheDocument();
    // No timer, no forced stop: the run is still open until the learner chooses.
    const snapshot = t.runtime.store.snapshot();
    expect(snapshot.runs.filter((r) => !r.ended)).toHaveLength(1);
    expect(snapshot.attempts.filter((a) => a.phase === 'continued')).toHaveLength(total);

    await act(async () => {
      await user.click(screen.getByTestId('review-again'));
    });
    await lessonReady();
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'presented');
    const next = t.runtime.store.snapshot();
    expect(next.runs).toHaveLength(2);
    expect(next.runs.filter((r) => r.ended)).toHaveLength(1);
    expect(screen.getByTestId('progress-label')).toHaveTextContent('+0.0 km · Question 1');
  });

  it('parks and resumes without losing the attempt', async () => {
    const user = userEvent.setup();
    const t = createTestRuntime();
    render(<LessonFeature runtime={t.runtime} />);
    await lessonReady();
    await user.click(must(screen.getAllByRole('radio')[2], 'radio'));
    const before = currentAttempt(t.runtime.store.snapshot());

    await user.click(screen.getByRole('button', { name: 'Park for now' }));
    await screen.findByTestId('lesson-parked');
    await user.click(screen.getByTestId('keep-driving'));
    await lessonReady();
    expect(screen.getByTestId('lesson')).toHaveAttribute('data-phase', 'selected');
    expect(currentAttempt(t.runtime.store.snapshot())).toEqual(before);
  });
});
