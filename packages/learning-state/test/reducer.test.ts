import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { attemptId, eventId, runId, seed, topicId } from '@ottie/contracts';
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

function event(id: string, type: 'run_started' | 'attempt_presented' | 'option_selected' | 'attempt_graded' | 'attempt_continued', extra: object) {
  return { id: eventId(id), at: 1, type, ...extra } as never;
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
});
