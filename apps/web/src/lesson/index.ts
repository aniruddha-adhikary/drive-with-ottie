import { type ModuleStatus } from '@ottie/contracts';

export { LessonScreen } from './LessonScreen';
export { ChoiceList, optionResult } from './ChoiceList';
export { TermText } from './TermText';
export { SceneHost } from './SceneHost';
export { PRESET_LABELS, SceneViewer } from './SceneViewer';
export { createStubSceneView } from './stub-scene-view';
export { initialPresetFor, questionEvidence } from './presets';
export { segmentText, type TextSegment } from './segments';
export type { HelpOrigin, HelpRequest, LessonActions, LessonAttempt, LessonScreenProps, OptionResult } from './types';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/web/lesson',
  owner: 'U1',
  implemented: [
    'compact four-option LessonScreen (controlled over AttemptState/PresentationState slices)',
    'one scene + Enlarge; camera presets and reset only inside the SceneViewer dialog',
    'Check answer -> Continue single primary action; selected/locked/feedback states',
    'radiogroup with roving focus; term slots in stem and choices that cannot select/submit',
    'SceneHost for the SceneView port; typed stub SceneView (no geometry)',
    'text scale, reduced motion, 320px widths, sticky action with content padding',
  ],
  pending: [
    'real SceneView from R1/R2 (stub draws no geometry, no linked detail inset)',
    'attempt/run engine and persistence (U2) — LessonFeature preview state is ephemeral',
    'glossary explainer rendered into helpSlot (U3); hypothetical comparison scenes',
    'route registration in apps/web/src/routes.tsx (I1)',
    'bundled Plus Jakarta Sans font files (D4)',
  ],
};
