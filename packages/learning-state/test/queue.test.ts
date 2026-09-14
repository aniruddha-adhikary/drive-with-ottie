import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures/content';
import { runId, seed, topicId } from '@ottie/contracts';
import { EMPTY_SNAPSHOT, nextStep, planQuestionQueue } from '@ottie/learning-state';

describe('learning queue', () => {
  it('plans deterministic shuffled queues and excludes questions', () => {
    const topics = [topicId('junction-priority')];
    const first = planQuestionQueue({ bundle: DEVELOPMENT_CONTENT_BUNDLE, topicIds: topics, seed: seed('one') });
    expect(planQuestionQueue({ bundle: DEVELOPMENT_CONTENT_BUNDLE, topicIds: topics, seed: seed('one') })).toEqual(first);
    expect([...planQuestionQueue({ bundle: DEVELOPMENT_CONTENT_BUNDLE, topicIds: topics, seed: seed('two') })].sort()).toEqual([...first].sort());
    const excluded = first.at(0);
    expect(excluded).toBeDefined();
    if (!excluded) return;
    expect(planQuestionQueue({ bundle: DEVELOPMENT_CONTENT_BUNDLE, topicIds: topics, seed: seed('one'), exclude: [excluded] })).not.toContain(excluded);
  });

  it('reports exhausted starter-set coverage and other topics', () => {
    const snapshot = {
      ...EMPTY_SNAPSHOT,
      runs: [
        {
          id: runId('run.queue'),
          startedAt: 1,
          lastActiveAt: 1,
          topicIds: [topicId('junction-priority')],
          currentAttemptId: null,
          completedAttemptIds: [],
          roadCoveredM: 0,
          questionQueue: [],
          ended: false,
        },
      ],
    } as unknown as typeof EMPTY_SNAPSHOT;
    const step = nextStep(snapshot, runId('run.queue'), DEVELOPMENT_CONTENT_BUNDLE);
    expect(step.kind).toBe('exhausted');
    if (step.kind === 'exhausted') {
      expect(step.otherTopicIds).toContain(topicId('traffic-signals'));
      expect(step.note).toContain('not the full');
    }
  });
});
