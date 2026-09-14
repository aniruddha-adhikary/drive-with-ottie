import { type ContentBundle, type LearningSnapshot, type QuestionId, type RunId, type TopicId } from '@ottie/contracts';
import { createSeededRng } from '@ottie/scenario-core';

export function planQuestionQueue({
  bundle,
  topicIds,
  seed,
  exclude = [],
}: {
  readonly bundle: ContentBundle;
  readonly topicIds: readonly TopicId[];
  readonly seed: Parameters<typeof createSeededRng>[0];
  readonly exclude?: readonly QuestionId[];
}): readonly QuestionId[] {
  const excluded = new Set(exclude);
  const uniqueTopicIds = [...new Set(topicIds)];
  const questions = uniqueTopicIds.flatMap((topic) =>
    bundle.questions.filter((question) => question.topicId === topic && !excluded.has(question.id)).map((question) => question.id),
  );
  const rng = createSeededRng(seed);
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index);
    const current = shuffled[index];
    const replacement = shuffled[swapIndex];
    if (current === undefined || replacement === undefined) throw new RangeError('shuffle: index out of range');
    shuffled[index] = replacement;
    shuffled[swapIndex] = current;
  }
  return shuffled;
}

export function reviewCandidates(
  snapshot: LearningSnapshot,
  runId: RunId,
  bundle: ContentBundle,
): { readonly missedFirst: readonly QuestionId[]; readonly allSeen: readonly QuestionId[] } {
  const runAttempts = snapshot.attempts.filter((attempt) => attempt.runId === runId && attempt.phase !== 'presented' && attempt.phase !== 'selected');
  const seen = new Set<QuestionId>();
  const missed: QuestionId[] = [];
  const allSeen: QuestionId[] = [];
  for (const attempt of [...runAttempts].reverse()) {
    const question = bundle.questions.find((candidate) => candidate.id === attempt.questionId);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    allSeen.push(question.id);
    if (attempt.gradedCorrect === false) missed.push(question.id);
  }
  return { missedFirst: missed, allSeen };
}

export type NextStep =
  | { readonly kind: 'resume_attempt'; readonly attempt: LearningSnapshot['attempts'][number] }
  | { readonly kind: 'present'; readonly questionId: QuestionId }
  | {
      readonly kind: 'exhausted';
      readonly review: readonly QuestionId[];
      readonly otherTopicIds: readonly TopicId[];
      readonly coverage: 'starter_set';
      readonly note: string;
    }
  | { readonly kind: 'run_ended' }
  | { readonly kind: 'no_such_run' };

export function nextStep(snapshot: LearningSnapshot, runId: RunId, bundle: ContentBundle): NextStep {
  const run = snapshot.runs.find((candidate) => candidate.id === runId);
  if (!run) return { kind: 'no_such_run' };
  if (run.ended) return { kind: 'run_ended' };
  if (run.currentAttemptId) {
    const attempt = snapshot.attempts.find((candidate) => candidate.id === run.currentAttemptId);
    if (attempt && attempt.phase !== 'continued') return { kind: 'resume_attempt', attempt };
  }
  const questionId = run.questionQueue[0];
  if (questionId) return { kind: 'present', questionId };
  const candidates = reviewCandidates(snapshot, runId, bundle);
  const otherTopicIds = bundle.topics
    .filter((topic) => !run.topicIds.includes(topic.id) && bundle.questions.some((question) => question.topicId === topic.id))
    .map((topic) => topic.id);
  return {
    kind: 'exhausted',
    review: candidates.missedFirst.length > 0 ? candidates.missedFirst : candidates.allSeen,
    otherTopicIds,
    coverage: 'starter_set',
    note: `This development starter set of ${bundle.questions.length} questions is not the full Basic Theory Test syllabus.`,
  };
}
