import {
  DEFAULT_PREFERENCES,
  LEARNING_STATE_SCHEMA_VERSION,
  freezeDeep,
  type AttemptState,
  type ContentBundle,
  type LearningEvent,
  type LearningSnapshot,
  type Preferences,
  type RunState,
} from '@ottie/contracts';
import { seed } from '@ottie/contracts';
import { planQuestionQueue } from './queue';

export interface ReducerContext {
  readonly bundle: ContentBundle;
}

export type ReduceOutcome =
  | { readonly kind: 'applied'; readonly snapshot: LearningSnapshot }
  | { readonly kind: 'duplicate'; readonly snapshot: LearningSnapshot }
  | { readonly kind: 'rejected'; readonly snapshot: LearningSnapshot; readonly reason: string };

export const EMPTY_SNAPSHOT: LearningSnapshot = freezeDeep({
  schemaVersion: LEARNING_STATE_SCHEMA_VERSION,
  runs: [],
  attempts: [],
  preferences: DEFAULT_PREFERENCES,
  appliedEventIds: [],
});

function rejected(snapshot: LearningSnapshot, reason: string): ReduceOutcome {
  return { kind: 'rejected', snapshot, reason };
}

function applied(snapshot: LearningSnapshot, event: LearningEvent): ReduceOutcome {
  return {
    kind: 'applied',
    snapshot: freezeDeep({ ...snapshot, appliedEventIds: [...snapshot.appliedEventIds, event.id] }),
  };
}

function findRun(snapshot: LearningSnapshot, runId: RunState['id']): RunState | undefined {
  return snapshot.runs.find((run) => run.id === runId);
}

function findAttempt(snapshot: LearningSnapshot, attemptId: AttemptState['id']): AttemptState | undefined {
  return snapshot.attempts.find((attempt) => attempt.id === attemptId);
}

function withRun(snapshot: LearningSnapshot, updated: RunState): LearningSnapshot {
  return { ...snapshot, runs: snapshot.runs.map((run) => (run.id === updated.id ? updated : run)) };
}

function withAttempt(snapshot: LearningSnapshot, updated: AttemptState): LearningSnapshot {
  return { ...snapshot, attempts: snapshot.attempts.map((attempt) => (attempt.id === updated.id ? updated : attempt)) };
}

function validPreferences(preferences: Preferences): boolean {
  return (
    preferences !== null &&
    typeof preferences === 'object' &&
    (preferences.textScale === 1 || preferences.textScale === 1.25 || preferences.textScale === 1.5 || preferences.textScale === 2) &&
    (preferences.theme === 'light' || preferences.theme === 'dark' || preferences.theme === 'system') &&
    typeof preferences.reducedMotion === 'boolean' &&
    typeof preferences.longHaul === 'boolean' &&
    typeof preferences.sound === 'boolean'
  );
}

export function applyLearningEvent(snapshot: LearningSnapshot, event: LearningEvent, context: ReducerContext): ReduceOutcome {
  if (snapshot.appliedEventIds.includes(event.id)) return { kind: 'duplicate', snapshot };

  switch (event.type) {
    case 'run_started': {
      if (findRun(snapshot, event.runId)) return rejected(snapshot, `Run ${event.runId} already exists`);
      const run: RunState = {
        id: event.runId,
        startedAt: event.at,
        lastActiveAt: event.at,
        topicIds: [...event.topicIds],
        currentAttemptId: null,
        completedAttemptIds: [],
        roadCoveredM: 0,
        questionQueue: planQuestionQueue({ bundle: context.bundle, topicIds: event.topicIds, seed: seed(event.runId) }),
        ended: false,
      };
      return applied({ ...snapshot, runs: [...snapshot.runs, run] }, event);
    }
    case 'attempt_presented': {
      const attempt = event.attempt;
      const run = findRun(snapshot, attempt.runId);
      if (!run) return rejected(snapshot, `Run ${attempt.runId} does not exist`);
      if (run.ended) return rejected(snapshot, `Run ${attempt.runId} has ended`);
      if (run.currentAttemptId) return rejected(snapshot, `Run ${attempt.runId} already has an active attempt`);
      if (findAttempt(snapshot, attempt.id)) return rejected(snapshot, `Attempt ${attempt.id} already exists`);
      if (attempt.phase !== 'presented' || attempt.selectedOptionId !== null || attempt.gradedCorrect !== null) {
        return rejected(snapshot, 'Presented attempts must be unselected and ungraded');
      }
      const question = context.bundle.questions.find((candidate) => candidate.id === attempt.questionId);
      if (!question) return rejected(snapshot, `Question ${attempt.questionId} does not exist`);
      const updatedRun: RunState = {
        ...run,
        currentAttemptId: attempt.id,
        lastActiveAt: event.at,
        questionQueue: run.questionQueue.filter((questionId) => questionId !== attempt.questionId),
      };
      return applied(withRun({ ...snapshot, attempts: [...snapshot.attempts, attempt] }, updatedRun), event);
    }
    case 'option_selected': {
      const attempt = findAttempt(snapshot, event.attemptId);
      if (!attempt) return rejected(snapshot, `Attempt ${event.attemptId} does not exist`);
      const run = findRun(snapshot, attempt.runId);
      if (!run || run.ended) return rejected(snapshot, `Run ${attempt.runId} has ended or does not exist`);
      if (attempt.phase !== 'presented' && attempt.phase !== 'selected') return rejected(snapshot, 'Only presented attempts can accept an option');
      const question = context.bundle.questions.find((candidate) => candidate.id === attempt.questionId);
      if (!question?.options.some((option) => option.id === event.optionId)) return rejected(snapshot, `Option ${event.optionId} does not belong to the question`);
      return applied(withAttempt(snapshot, { ...attempt, phase: 'selected', selectedOptionId: event.optionId }), event);
    }
    case 'attempt_graded': {
      const attempt = findAttempt(snapshot, event.attemptId);
      if (!attempt) return rejected(snapshot, `Attempt ${event.attemptId} does not exist`);
      const run = findRun(snapshot, attempt.runId);
      if (!run || run.ended) return rejected(snapshot, `Run ${attempt.runId} has ended or does not exist`);
      if (attempt.phase !== 'selected') return rejected(snapshot, 'Only selected attempts can be graded');
      return applied(withAttempt(snapshot, { ...attempt, phase: 'graded', gradedCorrect: event.correct, gradedAt: event.at }), event);
    }
    case 'attempt_continued': {
      const attempt = findAttempt(snapshot, event.attemptId);
      if (!attempt) return rejected(snapshot, `Attempt ${event.attemptId} does not exist`);
      const run = findRun(snapshot, attempt.runId);
      if (!run || run.ended) return rejected(snapshot, `Run ${attempt.runId} has ended or does not exist`);
      if (attempt.phase !== 'graded') return rejected(snapshot, 'Only graded attempts can continue');
      if (!Number.isFinite(event.roadDeltaM) || event.roadDeltaM < 0) return rejected(snapshot, 'roadDeltaM must be finite and non-negative');
      const updatedRun: RunState = {
        ...run,
        currentAttemptId: null,
        completedAttemptIds: [...run.completedAttemptIds, attempt.id],
        roadCoveredM: run.roadCoveredM + event.roadDeltaM,
        lastActiveAt: event.at,
      };
      return applied(withRun(withAttempt(snapshot, { ...attempt, phase: 'continued' }), updatedRun), event);
    }
    case 'help_opened': {
      const attempt = findAttempt(snapshot, event.attemptId);
      if (!attempt) return rejected(snapshot, `Attempt ${event.attemptId} does not exist`);
      const run = findRun(snapshot, attempt.runId);
      if (!run || run.ended) return rejected(snapshot, `Run ${attempt.runId} has ended or does not exist`);
      if (attempt.phase === 'continued') return rejected(snapshot, 'Continued attempts cannot open help');
      return applied(withAttempt(snapshot, { ...attempt, helpOpens: attempt.helpOpens + 1 }), event);
    }
    case 'run_paused': {
      const run = findRun(snapshot, event.runId);
      if (!run) return rejected(snapshot, `Run ${event.runId} does not exist`);
      if (run.ended) return rejected(snapshot, `Run ${event.runId} has ended`);
      return applied(withRun(snapshot, { ...run, lastActiveAt: event.at }), event);
    }
    case 'run_ended': {
      const run = findRun(snapshot, event.runId);
      if (!run) return rejected(snapshot, `Run ${event.runId} does not exist`);
      return applied(withRun(snapshot, { ...run, ended: true, lastActiveAt: event.at }), event);
    }
    case 'preferences_changed': {
      if (!validPreferences(event.preferences)) return rejected(snapshot, 'Invalid preferences');
      return applied({ ...snapshot, preferences: { ...event.preferences } }, event);
    }
  }
}
