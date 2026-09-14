import { type AssetRef, type EntityId, type ExplanationId, type QuestionId, type RuleId, type TermId, type TopicId, type WorldId } from './ids';
import { type SourceLocator } from './source';

/* ------------------------------------------------------------------------------------------------
 * Terms and rules
 * ---------------------------------------------------------------------------------------------- */

export interface Term {
  readonly id: TermId;
  readonly label: string;
  readonly shortDefinition: string;
  readonly explainer: readonly string[];
  /** Terms learners confuse with this one; the glossary offers explicit comparisons. */
  readonly confusableWith: readonly TermId[];
  /** Assets that illustrate the term (may be quarantined in development). */
  readonly illustratedBy: readonly AssetRef[];
  readonly sourceRefs: readonly SourceLocator[];
  readonly reviewStatus: 'development' | 'reviewed';
}

/** A source-backed rule predicate. The runtime evaluates `predicate` against World facts. */
export interface Rule {
  readonly id: RuleId;
  readonly version: number;
  readonly summary: string;
  readonly predicate: string;
  readonly sourceRefs: readonly SourceLocator[];
  /** Unresolved source conflicts about this rule; block release while non-empty. */
  readonly unresolved: readonly string[];
}

export interface Explanation {
  readonly id: ExplanationId;
  readonly ruleIds: readonly RuleId[];
  readonly paragraphs: readonly string[];
  readonly termIds: readonly TermId[];
  readonly sourceRefs: readonly SourceLocator[];
}

/* ------------------------------------------------------------------------------------------------
 * Bindings between text and the world
 * ---------------------------------------------------------------------------------------------- */

/**
 * A word/phrase in a stem or option bound to something. `actual` bindings point at an entity that
 * really exists in the World; `hypothetical` bindings describe a distractor that must NOT appear
 * in the World and instead reference a comparison request; `glossary` bindings open a term only.
 */
export type TermBinding =
  | {
      readonly role: 'actual';
      readonly text: string;
      readonly termId: TermId | null;
      readonly entityId: EntityId;
      /** Evidence requirement IDs that must be satisfied for this binding to be answerable. */
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly role: 'hypothetical';
      readonly text: string;
      readonly termId: TermId | null;
      /** Optional comparison that shows the hypothetical control in an explicitly separate scene. */
      readonly comparisonId: string | null;
    }
  | {
      readonly role: 'glossary';
      readonly text: string;
      readonly termId: TermId;
    };

/** Explicit request for a comparison/replay scene sharing the same road context with an authored delta. */
export interface ComparisonRequest {
  readonly id: string;
  readonly baseWorldId: WorldId;
  readonly kind: 'replace_control' | 'replay_action' | 'swap_actor_class' | 'change_signal_state';
  /** Authored, reviewed delta. The base world is never mutated; the comparison is a second world. */
  readonly delta: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly explanationId: ExplanationId | null;
}

export interface Option {
  readonly id: string;
  readonly text: string;
  readonly bindings: readonly TermBinding[];
  readonly correct: boolean;
  /** Why this option is wrong/right, shown after grading. */
  readonly rationaleExplanationId: ExplanationId;
}

/** Exactly four options; one primary action; no timer. */
export interface Question {
  readonly id: QuestionId;
  readonly version: number;
  readonly topicId: TopicId;
  readonly worldId: WorldId;
  readonly stem: string;
  readonly stemBindings: readonly TermBinding[];
  readonly options: readonly [Option, Option, Option, Option];
  readonly requiredEvidenceIds: readonly string[];
  readonly answerRule: { readonly ruleId: RuleId; readonly version: number };
  readonly explanationId: ExplanationId;
  readonly sourceRefs: readonly SourceLocator[];
  readonly reviewStatus: 'development' | 'reviewed';
  /** Original authoring; never copied from any third-party question bank. */
  readonly authorship: 'original';
}

export interface Topic {
  readonly id: TopicId;
  readonly label: string;
  readonly description: string;
  readonly questionIds: readonly QuestionId[];
  readonly termIds: readonly TermId[];
}

export interface ContentBundleRef {
  readonly id: string;
  readonly version: number;
}

/** Everything the lesson shell needs for one set of reviewed questions. Worlds are referenced by ID. */
export interface ContentBundle extends ContentBundleRef {
  readonly topics: readonly Topic[];
  readonly questions: readonly Question[];
  readonly terms: readonly Term[];
  readonly rules: readonly Rule[];
  readonly explanations: readonly Explanation[];
  readonly comparisons: readonly ComparisonRequest[];
  readonly worldIds: readonly WorldId[];
  readonly reviewStatus: 'development' | 'reviewed';
}
