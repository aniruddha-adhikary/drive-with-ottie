import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { DEFAULT_PREFERENCES, attemptId, eventId, runId, seed, topicId, type LearningEvent } from '@ottie/contracts';
import { EMPTY_SNAPSHOT, applyLearningEvent } from '@ottie/learning-state';

const context = { bundle: DEVELOPMENT_CONTENT_BUNDLE };
const run = runId('run.test');
const question = DEVELOPMENT_CONTENT_BUNDLE.questions.at(0);
if (!question) throw new Error('Fixture has no questions');
const attempt = {
  id: attemptId('run.test.a1'),
  runId: run,
  questionId: question.id,
  questionVersion: question.version,
  worldId: question.worldId,
  seed: seed('run.test.question'),
  phase: 'presented' as const,
  selectedOptionId: null,
  gradedCorrect: null,
  presentedAt: 1,
  gradedAt: null,
  helpOpens: 0,
};

function event(
  id: string,
  type: 'run_started' | 'attempt_presented' | 'option_selected' | 'attempt_graded' | 'attempt_continued' | 'help_opened' | 'run_paused' | 'run_ended' | 'preferences_changed',
  extra: object,
) {
  return { id: eventId(id), at: 1, type, ...extra } as LearningEvent;
}

describe('learning reducer', () => {
  it('applies the complete attempt lifecycle and is idempotent', () => {
    let snapshot = EMPTY_SNAPSHOT;
    snapshot = applyLearningEvent(snapshot, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e3', 'option_selected', { attemptId: attempt.id, optionId: 'a' }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e4', 'attempt_graded', { attemptId: attempt.id, correct: true }), context).snapshot;
    const continued = applyLearningEvent(snapshot, event('e5', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: 12 }), context);
    expect(continued.kind).toBe('applied');
    expect(continued.snapshot.runs[0]?.roadCoveredM).toBe(12);
    expect(continued.snapshot.runs[0]?.currentAttemptId).toBeNull();
    const duplicate = applyLearningEvent(continued.snapshot, event('e5', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: 12 }), context);
    expect(duplicate.kind).toBe('duplicate');
    expect(duplicate.snapshot).toBe(continued.snapshot);
  });

  it('freezes results and rejects invalid transitions', () => {
    const started = applyLearningEvent(EMPTY_SNAPSHOT, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context);
    expect(Object.isFrozen(started.snapshot.runs)).toBe(true);
    expect(() => {
      (started.snapshot.runs as unknown as { push: () => void }).push();
    }).toThrow();
    const presented = applyLearningEvent(started.snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    const foreign = applyLearningEvent(presented, event('e3', 'option_selected', { attemptId: attempt.id, optionId: 'foreign' }), context);
    expect(foreign.kind).toBe('rejected');
    const duplicateRun = applyLearningEvent(started.snapshot, event('e4', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context);
    expect(duplicateRun.kind).toBe('rejected');
  });

  it('rejects distinct grading and continuation events without double counting', () => {
    let snapshot = applyLearningEvent(EMPTY_SNAPSHOT, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e3', 'option_selected', { attemptId: attempt.id, optionId: 'a' }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e4', 'attempt_graded', { attemptId: attempt.id, correct: true }), context).snapshot;
    const secondGrade = applyLearningEvent(snapshot, event('e5', 'attempt_graded', { attemptId: attempt.id, correct: false }), context);
    expect(secondGrade.kind).toBe('rejected');
    const continued = applyLearningEvent(snapshot, event('e6', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: 4 }), context);
    expect(continued.kind).toBe('applied');
    const secondContinue = applyLearningEvent(continued.snapshot, event('e7', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: 9 }), context);
    expect(secondContinue.kind).toBe('rejected');
    expect(secondContinue.snapshot.runs[0]?.roadCoveredM).toBe(4);
  });

  it('rejects negative and non-finite progress deltas', () => {
    let snapshot = applyLearningEvent(EMPTY_SNAPSHOT, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e3', 'option_selected', { attemptId: attempt.id, optionId: 'a' }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e4', 'attempt_graded', { attemptId: attempt.id, correct: true }), context).snapshot;
    expect(applyLearningEvent(snapshot, event('e5', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: -1 }), context).kind).toBe('rejected');
    expect(applyLearningEvent(snapshot, event('e6', 'attempt_continued', { attemptId: attempt.id, roadDeltaM: Number.NaN }), context).kind).toBe('rejected');
  });

  it('increments only help opens and preserves runs by reference', () => {
    let snapshot = applyLearningEvent(EMPTY_SNAPSHOT, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    const help = event('e3', 'help_opened', { attemptId: attempt.id, termId: 'term' });
    const expected = {
      ...snapshot,
      attempts: snapshot.attempts.map((candidate) => ({ ...candidate, helpOpens: candidate.helpOpens + 1 })),
      appliedEventIds: [...snapshot.appliedEventIds, help.id],
    };
    const outcome = applyLearningEvent(snapshot, help, context);
    expect(outcome.kind).toBe('applied');
    expect(outcome.snapshot).toEqual(expected);
    expect(outcome.snapshot.runs).toBe(snapshot.runs);
  });

  it('rejects all run activity after ending a run', () => {
    let snapshot = applyLearningEvent(EMPTY_SNAPSHOT, event('e1', 'run_started', { runId: run, topicIds: [topicId('junction-priority')] }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e2', 'attempt_presented', { attempt }), context).snapshot;
    snapshot = applyLearningEvent(snapshot, event('e3', 'run_ended', { runId: run }), context).snapshot;
    const attemptAfterEnd = { ...attempt, id: attemptId('run.test.a2') };
    const rejectedEvents = [
      event('e4', 'attempt_presented', { attempt: attemptAfterEnd }),
      event('e5', 'option_selected', { attemptId: attempt.id, optionId: 'a' }),
      event('e6', 'help_opened', { attemptId: attempt.id, termId: 'term' }),
      event('e7', 'run_paused', { runId: run }),
    ];
    for (const rejectedEvent of rejectedEvents) {
      const outcome = applyLearningEvent(snapshot, rejectedEvent, context);
      expect(outcome.kind).toBe('rejected');
      expect(outcome.snapshot).toBe(snapshot);
    }
  });

  it('validates and applies preferences', () => {
    const invalid = applyLearningEvent(
      EMPTY_SNAPSHOT,
      event('e1', 'preferences_changed', { preferences: { ...DEFAULT_PREFERENCES, textScale: 3 } }),
      context,
    );
    expect(invalid.kind).toBe('rejected');
    const preferences = { ...DEFAULT_PREFERENCES, textScale: 1.5 };
    const valid = applyLearningEvent(EMPTY_SNAPSHOT, event('e2', 'preferences_changed', { preferences }), context);
    expect(valid.kind).toBe('applied');
    expect(valid.snapshot.preferences).toEqual(preferences);
  });
});
