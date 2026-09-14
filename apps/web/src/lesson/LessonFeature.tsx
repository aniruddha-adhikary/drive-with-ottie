import { useMemo, useState } from 'react';
import { DEFAULT_PREFERENCES, type DeepReadonly, type Preferences, type PresentationState, type Question, type World } from '@ottie/contracts';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { LessonScreen } from './LessonScreen';
import { initialPresetFor } from './presets';
import { createStubSceneView } from './stub-scene-view';
import { type HelpRequest, type LessonAttempt } from './types';

function worldFor(question: Question): DeepReadonly<World> {
  const world = DEVELOPMENT_WORLDS.find((w) => w.id === question.worldId);
  if (!world) throw new Error(`fixture world ${question.worldId} missing for ${question.id}`);
  return world;
}

function presentationFor(question: Question): PresentationState {
  return { cameraPreset: initialPresetFor(question, worldFor(question)), viewerEnlarged: false, helpTermId: null, comparisonId: null };
}

const FRESH_ATTEMPT: LessonAttempt = { phase: 'presented', selectedOptionId: null, gradedCorrect: null };

/**
 * Development preview of the lesson shell over the F0 fixtures and the stub SceneView. Attempt
 * state here is EPHEMERAL React state for previewing the four phases; it records no events, saves
 * nothing and is replaced by the learning-state store (U2) when I1 wires the slice. Help requests
 * are listed as text until the glossary module (U3) supplies the explainer.
 */
export default function LessonFeature(): React.JSX.Element {
  const questions = DEVELOPMENT_CONTENT_BUNDLE.questions;
  const [index, setIndex] = useState(0);
  const question = questions[index % questions.length] ?? questions[0];
  if (!question) throw new Error('development bundle has no questions');
  const world = worldFor(question);
  const sceneView = useMemo(() => createStubSceneView(), []);

  const [attempt, setAttempt] = useState<LessonAttempt>(FRESH_ATTEMPT);
  const [presentation, setPresentation] = useState<PresentationState>(() => presentationFor(question));
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [lastHelp, setLastHelp] = useState<HelpRequest | null>(null);

  const goTo = (nextIndex: number) => {
    const next = questions[nextIndex % questions.length];
    if (!next) return;
    setIndex(nextIndex % questions.length);
    setAttempt(FRESH_ATTEMPT);
    setPresentation(presentationFor(next));
    setLastHelp(null);
  };

  return (
    <div data-testid="lesson-feature">
      <div className="ottie-panel" style={{ margin: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }} data-testid="lesson-dev-controls">
        <strong>U1 preview.</strong> Stub scene, ephemeral state, development fixtures only — nothing here is release content.{' '}
        <label>
          Text scale{' '}
          <select
            value={String(preferences.textScale)}
            onChange={(event) => {
              const scale = Number(event.target.value);
              if (scale === 1 || scale === 1.25 || scale === 1.5 || scale === 2) setPreferences({ ...preferences, textScale: scale });
            }}
          >
            <option value="1">1</option>
            <option value="1.25">1.25</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
          </select>
        </label>
        {lastHelp ? (
          <span data-testid="last-help">
            {' '}
            Help requested: “{lastHelp.binding.text}” ({lastHelp.binding.role}) from {lastHelp.origin.kind}
            {lastHelp.origin.kind === 'option' ? ` ${lastHelp.origin.optionId}` : ''}
          </span>
        ) : null}
      </div>
      <LessonScreen
        question={question}
        world={world}
        bundle={DEVELOPMENT_CONTENT_BUNDLE}
        attempt={attempt}
        presentation={presentation}
        preferences={preferences}
        sceneView={sceneView}
        progressLabel={`Question ${index + 1} of ${questions.length}`}
        onSelectOption={(optionId) => {
          setAttempt({ phase: 'selected', selectedOptionId: optionId, gradedCorrect: null });
        }}
        onCheckAnswer={() => {
          const chosen = question.options.find((o) => o.id === attempt.selectedOptionId);
          if (!chosen) return;
          setAttempt({ phase: 'graded', selectedOptionId: chosen.id, gradedCorrect: chosen.correct });
        }}
        onContinue={() => {
          goTo(index + 1);
        }}
        onPresentationChange={setPresentation}
        onHelp={(request) => {
          setLastHelp(request);
          setPresentation((current) => ({ ...current, helpTermId: request.binding.termId ?? null }));
        }}
      />
    </div>
  );
}
