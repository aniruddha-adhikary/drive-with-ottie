import { useCallback, useState } from 'react';
import { type PresentationState } from '@ottie/contracts';
import { type HelpRequest } from '../lesson/types';

export interface GlossaryController {
  /** The open help request, or null. Pass straight to `GlossaryExplainer.request`. */
  readonly request: HelpRequest | null;
  /** Wire to `LessonScreen.onHelp`. Only the help request changes; nothing else is touched. */
  readonly open: (request: HelpRequest) => void;
  readonly close: () => void;
  /**
   * Reflects the open term into the presentation slice the host owns. Returns the same object when
   * nothing changes so hosts can store it without extra renders.
   */
  readonly reflect: (presentation: PresentationState) => PresentationState;
}

/**
 * Tiny host-side state for the explainer. It deliberately holds only the HelpRequest: attempt,
 * camera, seed and traffic state stay with their owners, and `reflect` writes nothing but
 * `helpTermId`.
 */
export function useGlossary(): GlossaryController {
  const [request, setRequest] = useState<HelpRequest | null>(null);
  const open = useCallback((next: HelpRequest) => {
    setRequest(next);
  }, []);
  const close = useCallback(() => {
    setRequest(null);
  }, []);
  const helpTermId = request?.binding.termId ?? null;
  const reflect = useCallback(
    (presentation: PresentationState): PresentationState =>
      presentation.helpTermId === helpTermId ? presentation : { ...presentation, helpTermId },
    [helpTermId],
  );
  return { request, open, close, reflect };
}
