import { useEffect, useId, useMemo, useRef } from 'react';
import { type CameraPresetName, type Explanation, type Option } from '@ottie/contracts';
import { ThemeScope } from '../theme';
import { ChoiceList } from './ChoiceList';
import { initialPresetFor, questionEvidence } from './presets';
import { SceneHost } from './SceneHost';
import { PRESET_LABELS, SceneViewer } from './SceneViewer';
import { TermText } from './TermText';
import { type LessonScreenProps } from './types';
import './lesson.css';

function findExplanation(props: LessonScreenProps, option: Option | undefined): Explanation | null {
  if (!option) return null;
  return props.bundle.explanations.find((e) => e.id === option.rationaleExplanationId) ?? null;
}

/**
 * Compact four-option lesson (docs/VISUAL-SYSTEM.md §Lesson composition): compact header, one scene
 * with a single Enlarge affordance, two-line stem, choice instruction, four full-text choices and one
 * primary action that reads "Check answer" until grading and "Continue" after. The screen is a
 * controlled view over attempt + presentation state supplied by the caller; it owns neither.
 */
export function LessonScreen(props: LessonScreenProps): React.JSX.Element {
  const { question, world, bundle, attempt, presentation, preferences, sceneView, helpSlot, progressLabel, onSelectOption, onCheckAnswer, onContinue, onPresentationChange, onHelp, onLeave } = props;

  const stemId = useId();
  const instructionId = useId();
  const feedbackId = useId();
  const enlargeRef = useRef<HTMLButtonElement>(null);
  const wasEnlarged = useRef(presentation.viewerEnlarged);

  const evidence = useMemo(() => questionEvidence(question, world), [question, world]);
  const initialPreset = useMemo(() => initialPresetFor(question, world), [question, world]);
  const topic = bundle.topics.find((t) => t.id === question.topicId) ?? null;

  const phase = attempt.phase;
  const graded = phase === 'graded' || phase === 'continued';
  const selectedOption = question.options.find((o) => o.id === attempt.selectedOptionId);
  const explanation = graded ? findExplanation(props, selectedOption) : null;
  const primaryDisabled = phase === 'presented' || phase === 'continued';
  const primaryLabel = graded ? 'Continue' : 'Check answer';

  // Closing the viewer returns focus to the Enlarge button so keyboard users keep their place.
  useEffect(() => {
    if (wasEnlarged.current && !presentation.viewerEnlarged) enlargeRef.current?.focus();
    wasEnlarged.current = presentation.viewerEnlarged;
  }, [presentation.viewerEnlarged]);

  const setPreset = (cameraPreset: CameraPresetName) => {
    onPresentationChange({ ...presentation, cameraPreset });
  };
  const openViewer = () => {
    onPresentationChange({ ...presentation, viewerEnlarged: true });
  };
  const closeViewer = () => {
    onPresentationChange({ ...presentation, viewerEnlarged: false });
  };

  const highlightEntityId = null;

  return (
    <ThemeScope preferences={preferences}>
      <div className="ottie-lesson" data-testid="lesson" data-phase={phase}>
        <header className="ottie-lesson__nav">
          <span className="ottie-type-metadata ottie-lesson__topic">{topic ? topic.label : question.topicId}</span>
          {progressLabel ? (
            <span className="ottie-type-metadata" data-testid="progress-label">
              {progressLabel}
            </span>
          ) : null}
          {onLeave ? (
            <button type="button" className="ottie-btn ottie-btn--quiet ottie-lesson__leave" onClick={onLeave}>
              Park for now
            </button>
          ) : null}
        </header>

        <main className="ottie-lesson__content">
          {presentation.viewerEnlarged ? (
            <div className="ottie-lesson__scene ottie-lesson__scene--placeholder" aria-hidden="true" />
          ) : (
            <section className="ottie-lesson__scene" aria-label="Scene">
              <SceneHost
                sceneView={sceneView}
                world={world}
                evidence={evidence}
                preset={presentation.cameraPreset}
                preferences={preferences}
                highlightEntityId={highlightEntityId}
                label={`Road scene for this question, ${PRESET_LABELS[presentation.cameraPreset]}`}
              />
              <button ref={enlargeRef} type="button" className="ottie-btn ottie-btn--quiet ottie-lesson__enlarge" onClick={openViewer} aria-haspopup="dialog" aria-expanded={false}>
                Enlarge
              </button>
            </section>
          )}

          <h1 id={stemId} className="ottie-type-question ottie-lesson__stem">
            <TermText text={question.stem} bindings={question.stemBindings} origin={{ kind: 'stem' }} onHelp={onHelp} />
          </h1>
          <p id={instructionId} className="ottie-type-metadata ottie-lesson__instruction">
            Choose one answer
          </p>

          <ChoiceList question={question} attempt={attempt} labelledBy={instructionId} onSelect={onSelectOption} onHelp={onHelp} />

          <section id={feedbackId} className="ottie-lesson__feedback" aria-live="polite" data-testid="feedback" data-result={graded ? (attempt.gradedCorrect ? 'correct' : 'incorrect') : 'none'}>
            {graded ? (
              <>
                <p className="ottie-type-control ottie-lesson__verdict">{attempt.gradedCorrect ? 'Correct.' : 'Not quite.'}</p>
                {explanation ? (
                  explanation.paragraphs.map((paragraph, index) => (
                    <p key={index} className="ottie-type-explanation">
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="ottie-type-explanation">No explanation is available for this option yet.</p>
                )}
              </>
            ) : null}
          </section>

          {helpSlot ? (
            <div className="ottie-lesson__help" data-testid="help-slot">
              {helpSlot}
            </div>
          ) : null}
        </main>

        <footer className="ottie-lesson__action">
          <button
            type="button"
            className="ottie-btn ottie-btn--primary"
            data-testid="primary-action"
            disabled={primaryDisabled}
            aria-describedby={graded ? feedbackId : undefined}
            onClick={() => {
              if (graded) onContinue();
              else onCheckAnswer();
            }}
          >
            {primaryLabel}
          </button>
        </footer>

        {presentation.viewerEnlarged ? (
          <SceneViewer
            sceneView={sceneView}
            world={world}
            evidence={evidence}
            preset={presentation.cameraPreset}
            initialPreset={initialPreset}
            preferences={preferences}
            highlightEntityId={highlightEntityId}
            onPresetChange={setPreset}
            onClose={closeViewer}
          />
        ) : null}
      </div>
    </ThemeScope>
  );
}
