import { useMemo, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  type DeepReadonly,
  type Preferences,
  type PresentationState,
  type Question,
  type World,
} from '@ottie/contracts';
import {
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_ASSET_REGISTRY_HASH,
  DEVELOPMENT_CONTENT_BUNDLE,
  DEVELOPMENT_WORLDS,
} from '@ottie/contracts/fixtures';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { LessonScreen } from '../lesson/LessonScreen';
import { initialPresetFor } from '../lesson/presets';
import { createStubSceneView } from '../lesson/stub-scene-view';
import { type LessonAttempt } from '../lesson/types';
import { GlossaryExplainer } from './GlossaryExplainer';
import { type GlossaryRequest } from './types';
import { useGlossary } from './useGlossary';

function worldFor(question: Question): DeepReadonly<World> {
  const world = DEVELOPMENT_WORLDS.find((w) => w.id === question.worldId);
  if (!world) throw new Error(`fixture world ${question.worldId} missing for ${question.id}`);
  return world;
}

function presentationFor(question: Question): PresentationState {
  return {
    cameraPreset: initialPresetFor(question, worldFor(question)),
    viewerEnlarged: false,
    helpTermId: null,
    comparisonId: null,
  };
}

const FRESH_ATTEMPT: LessonAttempt = {
  phase: 'presented',
  selectedOptionId: null,
  gradedCorrect: null,
};

/**
 * Development preview: the U1 lesson shell with the glossary explainer in its help slot. Attempt
 * state is ephemeral preview state exactly as in LessonFeature; comparison/replay requests are
 * listed as text because no comparison renderer exists yet (R1/R2 + I1).
 */
export default function GlossaryFeature(): React.JSX.Element {
  const questions = DEVELOPMENT_CONTENT_BUNDLE.questions;
  const [index, setIndex] = useState(0);
  const question = questions[index % questions.length] ?? questions[0];
  if (!question) throw new Error('development bundle has no questions');
  const world = worldFor(question);
  const sceneView = useMemo(() => createStubSceneView(), []);
  const assets = useMemo(
    () =>
      createInMemoryResolver(DEVELOPMENT_ASSETS, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH),
    [],
  );

  const [attempt, setAttempt] = useState<LessonAttempt>(FRESH_ATTEMPT);
  const [presentation, setPresentation] = useState<PresentationState>(() =>
    presentationFor(question),
  );
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [lastRequest, setLastRequest] = useState<GlossaryRequest | null>(null);
  const glossary = useGlossary();

  const goTo = (nextIndex: number) => {
    const next = questions[nextIndex % questions.length];
    if (!next) return;
    setIndex(nextIndex % questions.length);
    setAttempt(FRESH_ATTEMPT);
    setPresentation(presentationFor(next));
    setLastRequest(null);
    glossary.close();
  };

  return (
    <div data-testid="glossary-feature">
      <div
        className="ottie-panel"
        style={{ margin: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
        data-testid="glossary-dev-controls"
      >
        <strong>U3 preview.</strong> Glossary explainer over the U1 shell; stub scene, ephemeral
        state, quarantined development fixtures only.{' '}
        <label>
          Text scale{' '}
          <select
            value={String(preferences.textScale)}
            onChange={(event) => {
              const scale = Number(event.target.value);
              if (scale === 1 || scale === 1.25 || scale === 1.5 || scale === 2)
                setPreferences({ ...preferences, textScale: scale });
            }}
          >
            <option value="1">1</option>
            <option value="1.25">1.25</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
          </select>
        </label>
        {lastRequest ? (
          <span data-testid="last-glossary-request">
            {' '}
            {lastRequest.kind === 'compare' ? 'Comparison' : 'Replay'} requested:{' '}
            {lastRequest.comparison.id} ({lastRequest.comparison.kind}) — no comparison renderer
            yet.
          </span>
        ) : null}
      </div>
      <LessonScreen
        question={question}
        world={world}
        bundle={DEVELOPMENT_CONTENT_BUNDLE}
        attempt={attempt}
        presentation={glossary.reflect(presentation)}
        preferences={preferences}
        sceneView={sceneView}
        progressLabel={`Question ${index + 1} of ${questions.length}`}
        onSelectOption={(optionId) => {
          setAttempt({ phase: 'selected', selectedOptionId: optionId, gradedCorrect: null });
        }}
        onCheckAnswer={() => {
          const chosen = question.options.find((o) => o.id === attempt.selectedOptionId);
          if (!chosen) return;
          setAttempt({
            phase: 'graded',
            selectedOptionId: chosen.id,
            gradedCorrect: chosen.correct,
          });
        }}
        onContinue={() => {
          goTo(index + 1);
        }}
        onPresentationChange={setPresentation}
        onHelp={glossary.open}
        helpSlot={
          <GlossaryExplainer
            request={glossary.request}
            bundle={DEVELOPMENT_CONTENT_BUNDLE}
            assets={assets}
            onClose={glossary.close}
            onRequest={setLastRequest}
          />
        }
      />
    </div>
  );
}
