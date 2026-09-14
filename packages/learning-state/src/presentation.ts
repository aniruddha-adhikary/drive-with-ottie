import { type PresentationState } from '@ottie/contracts';

export const DEFAULT_PRESENTATION: PresentationState = Object.freeze({
  cameraPreset: 'study_oblique',
  viewerEnlarged: false,
  helpTermId: null,
  comparisonId: null,
});

export type PresentationAction =
  | { readonly type: 'set_camera'; readonly cameraPreset: PresentationState['cameraPreset'] }
  | { readonly type: 'toggle_enlarged' }
  | { readonly type: 'open_help'; readonly termId: string }
  | { readonly type: 'close_help' }
  | { readonly type: 'open_comparison'; readonly comparisonId: string }
  | { readonly type: 'close_comparison' };

export function reducePresentation(state: PresentationState, action: PresentationAction): PresentationState {
  switch (action.type) {
    case 'set_camera':
      return { ...state, cameraPreset: action.cameraPreset };
    case 'toggle_enlarged':
      return { ...state, viewerEnlarged: !state.viewerEnlarged };
    case 'open_help':
      return { ...state, helpTermId: action.termId };
    case 'close_help':
      return { ...state, helpTermId: null };
    case 'open_comparison':
      return { ...state, comparisonId: action.comparisonId };
    case 'close_comparison':
      return { ...state, comparisonId: null };
  }
}
