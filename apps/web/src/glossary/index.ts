import { type ModuleStatus } from '@ottie/contracts';

export { GlossaryExplainer, type GlossaryExplainerProps } from './GlossaryExplainer';
export { useGlossary, type GlossaryController } from './useGlossary';
export {
  chooseArtwork,
  createStaticArtworkSource,
  createViteArtworkSource,
  displayFile,
} from './artwork';
export {
  bindingPresence,
  describeLocator,
  explainerModel,
  findComparison,
  findTerm,
  isTermBinding,
  lookupTerm,
  termProblems,
} from './lookup';
export type {
  ArtworkChoice,
  ArtworkSource,
  BindingPresence,
  ExplainerModel,
  GlossaryRequest,
  TermLookup,
} from './types';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/web/glossary',
  owner: 'U3',
  implemented: [
    'GlossaryExplainer bottom sheet (role=dialog, focus trap, Escape, close button) rendered through LessonScreen.helpSlot from U1 HelpRequests in stems and choices',
    'term lookup over ContentBundle: label, meaning, explainer paragraphs, confusable chips with back trail, deduplicated source citations',
    'actual / hypothetical / glossary presence copy; hypothetical bindings never add controls to the scene',
    'explicit comparison / replay GlossaryRequest callbacks (compare for every ComparisonRequest, replay only for replay_action)',
    'canonical artwork through the host AssetResolver (reference_svg > reference_png > renderer_svg), quarantine caption, lazy Vite URL loading; nothing invented',
    'focus + window scroll captured on open and restored on close; opening emits no attempt/presentation/seed/traffic change',
    'malformed binding, missing term, malformed term, missing confusable and missing comparison all render as explicit notices',
    'useGlossary host hook holding only the HelpRequest and reflecting helpTermId into PresentationState',
    'em/rem sizing under --ottie-text-scale; sheet scrolls, never clips',
  ],
  pending: [
    'comparison / replay scene rendering — GlossaryRequest is emitted but no renderer consumes it (R1/R2, I1)',
    'route registration of GlossaryFeature and wiring GlossaryExplainer into the integrated lesson (I1)',
    'reviewed terms and content packs from T1/ET; current terms are development fixtures',
    'release-mode artwork: every current asset is release_ready=false so release resolvers show none',
    'no browser/UI verification; behaviour covered by jsdom tests only',
  ],
};
