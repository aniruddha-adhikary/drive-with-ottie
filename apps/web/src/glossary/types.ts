import {
  type AssetDefinition,
  type AssetFile,
  type ComparisonRequest,
  type SourceLocator,
  type Term,
  type TermBinding,
  type TermId,
} from '@ottie/contracts';

/**
 * Where a term binding stands relative to the question's scene. The glossary tells the learner the
 * difference but never acts on the world: an `actual` binding is already there, a `hypothetical`
 * one must stay out of it and is only ever shown through an explicit comparison request.
 */
export type BindingPresence =
  | { readonly kind: 'in_scene'; readonly entityId: string }
  | { readonly kind: 'not_in_scene'; readonly comparisonId: string | null }
  | { readonly kind: 'glossary_only' };

/** Outcome of looking a term up in the ContentBundle. Missing or malformed content is described, never thrown. */
export type TermLookup =
  | {
      readonly kind: 'found';
      readonly term: Term;
      readonly confusables: readonly Term[];
      readonly unresolvedConfusables: readonly TermId[];
    }
  | { readonly kind: 'missing'; readonly termId: TermId }
  | { readonly kind: 'malformed'; readonly termId: TermId; readonly problems: readonly string[] };

/** What the explainer shows for the current help request once every reference has been checked. */
export interface ExplainerModel {
  readonly title: string;
  readonly presence: BindingPresence;
  readonly lookup: TermLookup | null;
  readonly comparison: ComparisonRequest | null;
  /** True when the binding names a comparison ID the bundle does not contain. */
  readonly comparisonMissing: boolean;
  readonly sources: readonly SourceLocator[];
}

/** Which asset file the explainer shows for a term and how it was resolved. */
export type ArtworkChoice =
  | {
      readonly kind: 'file';
      readonly asset: AssetDefinition;
      readonly file: AssetFile;
      readonly quarantined: boolean;
    }
  | { readonly kind: 'unresolved'; readonly reason: string }
  | { readonly kind: 'none' };

/** Maps a repository-relative asset file to a URL the browser can load, or null when it is not bundled. */
export interface ArtworkSource {
  urlFor(file: AssetFile): Promise<string | null>;
}

/**
 * Explicit learner requests the glossary emits. Nothing here is performed by the glossary itself:
 * the host decides whether it can show a comparison or replay and where. Attempt, seed and traffic
 * state are never touched.
 */
export type GlossaryRequest =
  | {
      readonly kind: 'compare';
      readonly comparison: ComparisonRequest;
      readonly fromBinding: TermBinding;
    }
  | {
      readonly kind: 'replay';
      readonly comparison: ComparisonRequest;
      readonly fromBinding: TermBinding;
    };
