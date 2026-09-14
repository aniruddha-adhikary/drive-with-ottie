import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AttemptState,
  type LearningSnapshot,
  type PresentationState,
  type Question,
  type QuestionId,
  type RunId,
  type RunState,
  type TopicId,
  runId as makeRunId,
} from '@ottie/contracts';
import { ContentExhaustedError } from '@ottie/learning-state';
import { GlossaryExplainer } from '../glossary/GlossaryExplainer';
import { type GlossaryRequest } from '../glossary/types';
import { useGlossary } from '../glossary/useGlossary';
import { ComparisonPanel } from './ComparisonPanel';
import { LessonScreen } from './LessonScreen';
import { chooseInitialPreset } from './presets';
import { type LessonRuntime, createBrowserLessonRuntime, estimateCompactViewport } from './runtime';
import { type HelpRequest } from './types';
import './lesson.css';

/** Road covered per continued question. Positive-delta only; the run's road never rolls back. */
export const ROAD_PER_QUESTION_M = 250;

export interface LessonFeatureProps {
  /** Injected by tests and previews; the default is the device-local browser runtime. */
  readonly runtime?: LessonRuntime;
}

type Exhausted = ContentExhaustedError['step'];

interface ReadyScene {
  readonly attemptId: AttemptState['id'];
  readonly presentation: PresentationState;
}

function activeRun(snapshot: LearningSnapshot): RunState | null {
  const open = snapshot.runs.filter((run) => !run.ended);
  return open.reduce<RunState | null>((best, run) => (!best || run.lastActiveAt >= best.lastActiveAt ? run : best), null);
}

function currentAttempt(snapshot: LearningSnapshot, run: RunState | null): AttemptState | null {
  if (!run?.currentAttemptId) return null;
  const attempt = snapshot.attempts.find((a) => a.id === run.currentAttemptId) ?? null;
  return attempt && attempt.phase !== 'continued' ? attempt : null;
}

function kmLabel(metres: number): string {
  return `+${(metres / 1000).toFixed(1)} km`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let browser: LessonRuntime | null = null;
/** Page-lifetime browser runtime: one store, one lesson stage, one comparison stage. */
function browserRuntime(): LessonRuntime {
  browser ??= createBrowserLessonRuntime();
  return browser;
}

/**
 * The runnable lesson: U2 durable run/attempt/seed state, the T1/C1 starter worlds rendered by R1
 * with R2 evidence-aware cameras, U1's four-option shell, U3's explainer in the help slot and
 * explicit comparison rendering on a separate stage. Help, camera and comparison changes only ever
 * touch presentation state; grading is idempotent in U2 and Continue is the only way forward.
 */
export default function LessonFeature(props: LessonFeatureProps): React.JSX.Element {
  const runtime = props.runtime ?? browserRuntime();

  const { content, session, store, stage } = runtime;
  const bundle = content.bundle;
  const allTopicIds = useMemo(() => bundle.topics.filter((t) => bundle.questions.some((q) => q.topicId === t.id)).map((t) => t.id), [bundle]);

  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [runId, setRunId] = useState<RunId | null>(null);
  const [exhausted, setExhausted] = useState<Exhausted | null>(null);
  const [parked, setParked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyScene | null>(null);
  const [comparison, setComparison] = useState<GlossaryRequest | null>(null);
  const glossary = useGlossary();

  useEffect(() => store.subscribe(setSnapshot), [store]);

  const presentNext = useCallback(
    async (run: RunId) => {
      try {
        setExhausted(null);
        await session.present(run);
      } catch (cause) {
        if (cause instanceof ContentExhaustedError) setExhausted(cause.step);
        else setError(describeError(cause));
      }
    },
    [session],
  );

  const startRun = useCallback(
    async (topicIds: readonly TopicId[], endRun: RunId | null = null) => {
      try {
        const before = endRun ? await session.end(endRun) : await store.load();
        const id = makeRunId(`run-${runtime.clock.now()}-${before.runs.length + 1}`);
        const next = await session.startRun(topicIds, id);
        const run = next.runs.find((r) => r.id === id);
        if (!run) throw new Error('run did not start');
        setParked(false);
        setRunId(run.id);
        await presentNext(run.id);
      } catch (cause) {
        setError(describeError(cause));
      }
    },
    [presentNext, runtime.clock, session, store],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await store.load();
        if (cancelled) return;
        setSnapshot(loaded);
        const run = activeRun(loaded);
        if (run) {
          setRunId(run.id);
          await presentNext(run.id);
        } else {
          await startRun(allTopicIds);
        }
      } catch (cause) {
        if (!cancelled) setError(describeError(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allTopicIds, presentNext, startRun, store]);

  const run = snapshot && runId ? (snapshot.runs.find((r) => r.id === runId) ?? null) : null;
  const attempt = snapshot ? currentAttempt(snapshot, run) : null;
  const question: Question | null = attempt ? (bundle.questions.find((q) => q.id === attempt.questionId) ?? null) : null;
  const world = attempt ? runtime.worldFor(attempt.worldId) : null;
  const preferences = snapshot?.preferences ?? store.snapshot().preferences;
  const closeGlossary = glossary.close;

  // Load the attempt's world on the lesson stage, then pick the first preset that actually shows the
  // question's evidence at the compact size (measured by R2 over the real geometry).
  useEffect(() => {
    if (!attempt || !question || !world) return undefined;
    if (ready?.attemptId === attempt.id) return undefined;
    let cancelled = false;
    void stage.sceneView
      .ensureLoaded(world)
      .then(() => {
        if (cancelled) return;
        const cameraPreset = chooseInitialPreset(stage.camera, question, world, estimateCompactViewport(), preferences);
        setReady({ attemptId: attempt.id, presentation: { cameraPreset, viewerEnlarged: false, helpTermId: null, comparisonId: null } });
        setComparison(null);
        closeGlossary();
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describeError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, closeGlossary, preferences, question, ready?.attemptId, stage, world]);

  const setPresentation = useCallback((next: PresentationState) => {
    setReady((current) => (current ? { ...current, presentation: next } : current));
  }, []);

  const onHelp = useCallback(
    (request: HelpRequest) => {
      glossary.open(request);
      if (runId && request.binding.termId) void session.openHelp(runId, request.binding.termId).catch((cause: unknown) => { setError(describeError(cause)); });
    },
    [glossary, runId, session],
  );

  const onComparison = useCallback(
    (request: GlossaryRequest) => {
      setComparison(request);
      setReady((current) => (current ? { ...current, presentation: { ...current.presentation, comparisonId: request.comparison.id } } : current));
    },
    [],
  );
  const closeComparison = useCallback(() => {
    setComparison(null);
    setReady((current) => (current ? { ...current, presentation: { ...current.presentation, comparisonId: null } } : current));
  }, []);

  const act = (operation: () => Promise<unknown>) => {
    void operation().catch((cause: unknown) => { setError(describeError(cause)); });
  };

  const loadReport = store.loadReport();
  const statusLine = (
    <p className="ottie-type-metadata ottie-lesson__status" data-testid="development-status">
      Development content, not approved for release — starter closure of {content.closure.assets.length} assets from registry {content.closure.registryHash.slice(0, 12)}…
      {world?.provenance.usesQuarantinedAssets ? ' Uses quarantined (unapproved) assets.' : ''}
      {loadReport && loadReport.status !== 'ok' && loadReport.status !== 'empty' ? ' Earlier saved progress could not be read and was set aside unchanged.' : ''}
    </p>
  );

  if (error) {
    return (
      <div className="ottie-lesson ottie-lesson--message" role="alert" data-testid="lesson-error">
        <h1 className="ottie-type-question">The lesson could not continue</h1>
        <p className="ottie-type-explanation">{error}</p>
        {statusLine}
      </div>
    );
  }

  if (exhausted && run) {
    const reviewQuestions = exhausted.review.map((id: QuestionId) => bundle.questions.find((q) => q.id === id)).filter((q): q is Question => q !== undefined);
    const reviewTopics = [...new Set(reviewQuestions.map((q) => q.topicId))];
    return (
      <div className="ottie-lesson ottie-lesson--message" data-testid="lesson-exhausted">
        <h1 className="ottie-type-question">You have driven this whole stretch</h1>
        <p className="ottie-type-explanation">{exhausted.note}</p>
        <p className="ottie-type-metadata" data-testid="progress-label">
          {preferences.longHaul ? 'Long haul' : kmLabel(run.roadCoveredM)}
        </p>
        {reviewQuestions.length > 0 ? (
          <section aria-labelledby="review-heading">
            <h2 id="review-heading" className="ottie-type-control">
              Worth another look
            </h2>
            <ul className="ottie-lesson__review" data-testid="review-candidates">
              {reviewQuestions.map((q) => (
                <li key={q.id} className="ottie-type-explanation">
                  {q.stem}
                </li>
              ))}
            </ul>
            <button type="button" className="ottie-btn ottie-btn--primary" data-testid="review-again" onClick={() => { act(() => startRun(reviewTopics, run.id)); }}>
              Review these again
            </button>
          </section>
        ) : null}
        {exhausted.otherTopicIds.length > 0 ? (
          <section aria-labelledby="topics-heading">
            <h2 id="topics-heading" className="ottie-type-control">
              Or drive a different stretch
            </h2>
            <div className="ottie-lesson__topics">
              {exhausted.otherTopicIds.map((topicId) => (
                <button key={topicId} type="button" className="ottie-btn ottie-btn--quiet" data-testid="other-topic" onClick={() => { act(() => startRun([topicId], run.id)); }}>
                  {bundle.topics.find((t) => t.id === topicId)?.label ?? topicId}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <button type="button" className="ottie-btn ottie-btn--quiet" data-testid="drive-again" onClick={() => { act(() => startRun(run.topicIds, run.id)); }}>
          Drive this stretch again
        </button>
        {statusLine}
      </div>
    );
  }

  if (parked && run) {
    return (
      <div className="ottie-lesson ottie-lesson--message" data-testid="lesson-parked">
        <h1 className="ottie-type-question">Parked</h1>
        <p className="ottie-type-explanation">Your place is saved on this device. Come back whenever you like — nothing is lost while you are away.</p>
        <p className="ottie-type-metadata" data-testid="progress-label">
          {preferences.longHaul ? 'Long haul' : kmLabel(run.roadCoveredM)}
        </p>
        <button type="button" className="ottie-btn ottie-btn--primary" data-testid="keep-driving" onClick={() => { setParked(false); }}>
          Keep driving
        </button>
        {statusLine}
      </div>
    );
  }

  if (!run || !attempt || !question || !world || ready?.attemptId !== attempt.id) {
    return (
      <div className="ottie-lesson ottie-lesson--message" aria-busy="true" data-testid="lesson-loading">
        <p className="ottie-type-explanation">Preparing the road scene…</p>
        {statusLine}
      </div>
    );
  }

  const progressLabel = preferences.longHaul ? undefined : `${kmLabel(run.roadCoveredM)} · Question ${run.completedAttemptIds.length + 1}`;

  return (
    <div data-testid="lesson-feature">
      <LessonScreen
        question={question}
        world={world}
        bundle={bundle}
        attempt={attempt}
        presentation={glossary.reflect(ready.presentation)}
        preferences={preferences}
        sceneView={stage.sceneView}
        {...(progressLabel === undefined ? {} : { progressLabel })}
        onSelectOption={(optionId) => { act(() => session.select(run.id, optionId)); }}
        onCheckAnswer={() => { act(() => session.check(run.id)); }}
        onContinue={() => { act(async () => {
            await session.continue(run.id, ROAD_PER_QUESTION_M);
            await presentNext(run.id);
          }); }
        }
        onPresentationChange={setPresentation}
        onHelp={onHelp}
        onLeave={() => { act(async () => {
            await session.pause(run.id);
            setParked(true);
          }); }
        }
        helpSlot={
          <>
            <GlossaryExplainer request={glossary.request} bundle={bundle} assets={content.resolver} onClose={glossary.close} onRequest={onComparison} />
            {comparison ? (
              <ComparisonPanel request={comparison} outcome={runtime.comparisonFor(comparison.comparison.id)} stage={runtime.comparisonStage} preset={ready.presentation.cameraPreset} preferences={preferences} onClose={closeComparison} />
            ) : null}
          </>
        }
      />
      {statusLine}
    </div>
  );
}
