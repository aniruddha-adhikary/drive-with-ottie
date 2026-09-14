import { type ReactNode } from 'react';
import {
  type AttemptState,
  type ContentBundle,
  type DeepReadonly,
  type Preferences,
  type PresentationState,
  type Question,
  type SceneView,
  type TermBinding,
  type World,
} from '@ottie/contracts';

/** Where a glossary term was activated. Help never selects or submits the choice it sits in. */
export type HelpOrigin = { readonly kind: 'stem' } | { readonly kind: 'option'; readonly optionId: string } | { readonly kind: 'feedback' };

export interface HelpRequest {
  readonly binding: TermBinding;
  readonly origin: HelpOrigin;
}

/** The slice of attempt state the shell renders. It is supplied by the attempt engine (U2), never owned here. */
export type LessonAttempt = Pick<AttemptState, 'phase' | 'selectedOptionId' | 'gradedCorrect'>;

export interface LessonActions {
  readonly onSelectOption: (optionId: string) => void;
  readonly onCheckAnswer: () => void;
  readonly onContinue: () => void;
  /** Camera / viewer / help changes. Presentation-only: must not touch attempt, seed or traffic state. */
  readonly onPresentationChange: (next: PresentationState) => void;
  readonly onHelp: (request: HelpRequest) => void;
  /** Optional voluntary exit ("Park for now"). Leaving is never penalised and there is no timer. */
  readonly onLeave?: () => void;
}

export interface LessonScreenProps extends LessonActions {
  readonly question: Question;
  readonly world: DeepReadonly<World>;
  readonly bundle: ContentBundle;
  readonly attempt: LessonAttempt;
  readonly presentation: PresentationState;
  readonly preferences: Preferences;
  readonly sceneView: SceneView;
  /** Rendered by the glossary module (U3) when `presentation.helpTermId` is set; the shell only hosts it. */
  readonly helpSlot?: ReactNode;
  /** Short progress copy for the compact header (e.g. "+0.8 km"). Positive-delta only; optional. */
  readonly progressLabel?: string;
}

export type OptionResult = 'neutral' | 'correct' | 'incorrect_selected' | 'correct_selected';
