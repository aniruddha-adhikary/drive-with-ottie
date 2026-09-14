import {
  attemptId,
  eventId,
  runId as makeRunId,
  seed,
  type AttemptState,
  type Clock,
  type ContentBundle,
  type LearningSnapshot,
  type Preferences,
  type RunId,
  type TopicId,
} from '@ottie/contracts';
import { nextStep, type NextStep } from './queue';
import { LearningStateError, type LearningStoreWithPersistence } from './store';

export class ContentExhaustedError extends Error {
  readonly step: Extract<NextStep, { kind: 'exhausted' }>;

  constructor(step: Extract<NextStep, { kind: 'exhausted' }>) {
    super(step.note);
    this.name = 'ContentExhaustedError';
    this.step = step;
  }
}

export interface LearningSession {
  startRun(topicIds: readonly TopicId[], runId?: RunId): Promise<LearningSnapshot>;
  present(runId: RunId): Promise<LearningSnapshot>;
  select(runId: RunId, optionId: string): Promise<LearningSnapshot>;
  check(runId: RunId): Promise<LearningSnapshot>;
  continue(runId: RunId, roadDeltaM: number): Promise<LearningSnapshot>;
  openHelp(runId: RunId, termId: string): Promise<LearningSnapshot>;
  pause(runId: RunId): Promise<LearningSnapshot>;
  end(runId: RunId): Promise<LearningSnapshot>;
  setPreferences(preferences: Preferences): Promise<LearningSnapshot>;
}

export function createLearningSession({
  store,
  bundle,
  clock,
}: {
  readonly store: LearningStoreWithPersistence;
  readonly bundle: ContentBundle;
  readonly clock: Clock;
}): LearningSession {
  const eventKey = (snapshot: LearningSnapshot, run: RunId): ReturnType<typeof eventId> => eventId(`${run}.e${snapshot.appliedEventIds.length + 1}`);
  const prefEventKey = (snapshot: LearningSnapshot): ReturnType<typeof eventId> => eventId(`pref.e${snapshot.appliedEventIds.length + 1}`);
  const currentAttempt = (snapshot: LearningSnapshot, run: RunId): AttemptState | undefined => {
    const state = snapshot.runs.find((candidate) => candidate.id === run);
    return state?.currentAttemptId ? snapshot.attempts.find((attempt) => attempt.id === state.currentAttemptId) : undefined;
  };
  const loadedSnapshot = (): Promise<LearningSnapshot> => store.load();

  return {
    startRun: async (topicIds, requestedRunId) => {
      const snapshot = await loadedSnapshot();
      const id = requestedRunId ?? makeRunId(`run-${clock.now()}`);
      return store.apply({ type: 'run_started', id: eventKey(snapshot, id), at: clock.now(), runId: id, topicIds });
    },
    present: async (run) => {
      const snapshot = await loadedSnapshot();
      const step = nextStep(snapshot, run, bundle);
      if (step.kind === 'resume_attempt') return snapshot;
      if (step.kind === 'exhausted') throw new ContentExhaustedError(step);
      if (step.kind !== 'present') throw new LearningStateError(`Cannot present: ${step.kind}`, { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      const attemptsForRun = snapshot.attempts.filter((attempt) => attempt.runId === run);
      const question = bundle.questions.find((candidate) => candidate.id === step.questionId);
      if (!question) throw new LearningStateError(`Question ${step.questionId} does not exist`, { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      const attempt: AttemptState = {
        id: attemptId(`${run}.a${attemptsForRun.length + 1}`),
        runId: run,
        questionId: question.id,
        questionVersion: question.version,
        worldId: question.worldId,
        seed: seed(`${run}.${question.id}`),
        phase: 'presented',
        selectedOptionId: null,
        gradedCorrect: null,
        presentedAt: clock.now(),
        gradedAt: null,
        helpOpens: 0,
      };
      return store.apply({ type: 'attempt_presented', id: eventKey(snapshot, run), at: clock.now(), attempt });
    },
    select: async (run, optionId) => {
      const snapshot = await loadedSnapshot();
      const attempt = currentAttempt(snapshot, run);
      if (!attempt) throw new LearningStateError('No current attempt', { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      return store.apply({ type: 'option_selected', id: eventKey(snapshot, run), at: clock.now(), attemptId: attempt.id, optionId });
    },
    check: async (run) => {
      const snapshot = await loadedSnapshot();
      const attempt = currentAttempt(snapshot, run);
      if (!attempt) throw new LearningStateError('No current attempt', { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      if (attempt.phase === 'graded' || attempt.phase === 'continued') return snapshot;
      if (attempt.selectedOptionId === null) throw new LearningStateError('Select an option before checking', { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      const question = bundle.questions.find((candidate) => candidate.id === attempt.questionId);
      const selected = question?.options.find((option) => option.id === attempt.selectedOptionId);
      if (!selected) throw new LearningStateError('Selected option does not belong to the question', { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      return store.apply({ type: 'attempt_graded', id: eventKey(snapshot, run), at: clock.now(), attemptId: attempt.id, correct: selected.correct });
    },
    continue: async (run, roadDeltaM) => {
      const snapshot = await loadedSnapshot();
      const attempt = currentAttempt(snapshot, run);
      if (!attempt || attempt.phase === 'continued') return snapshot;
      return store.apply({ type: 'attempt_continued', id: eventKey(snapshot, run), at: clock.now(), attemptId: attempt.id, roadDeltaM });
    },
    openHelp: async (run, termId) => {
      const snapshot = await loadedSnapshot();
      const attempt = currentAttempt(snapshot, run);
      if (!attempt) throw new LearningStateError('No current attempt', { type: 'run_paused', id: eventId(`invalid.${snapshot.appliedEventIds.length + 1}`), at: clock.now(), runId: run });
      return store.apply({ type: 'help_opened', id: eventKey(snapshot, run), at: clock.now(), attemptId: attempt.id, termId });
    },
    pause: async (run) => {
      const snapshot = await loadedSnapshot();
      return store.apply({ type: 'run_paused', id: eventKey(snapshot, run), at: clock.now(), runId: run });
    },
    end: async (run) => {
      const snapshot = await loadedSnapshot();
      return store.apply({ type: 'run_ended', id: eventKey(snapshot, run), at: clock.now(), runId: run });
    },
    setPreferences: async (preferences) => {
      const snapshot = await loadedSnapshot();
      return store.apply({ type: 'preferences_changed', id: prefEventKey(snapshot), at: clock.now(), preferences });
    },
  };
}
