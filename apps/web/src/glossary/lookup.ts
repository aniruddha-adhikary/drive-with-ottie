import {
  type ComparisonRequest,
  type ContentBundle,
  type SourceLocator,
  type Term,
  type TermBinding,
  type TermId,
} from '@ottie/contracts';
import { type BindingPresence, type ExplainerModel, type TermLookup } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Runtime shape check for bindings that arrive as JSON later (T1/ET content). Anything that is not
 * one of the three authored roles with the fields the contract requires is rejected here so the UI
 * can fall back to plain text instead of rendering a broken control.
 */
export function isTermBinding(value: unknown): value is TermBinding {
  if (!isRecord(value) || typeof value.text !== 'string') return false;
  switch (value.role) {
    case 'actual':
      return (
        typeof value.entityId === 'string' &&
        (value.termId === null || typeof value.termId === 'string') &&
        isStringArray(value.evidenceIds)
      );
    case 'hypothetical':
      return (
        (value.termId === null || typeof value.termId === 'string') &&
        (value.comparisonId === null || typeof value.comparisonId === 'string')
      );
    case 'glossary':
      return typeof value.termId === 'string';
    default:
      return false;
  }
}

/** Problems with a term record that would make its explainer misleading rather than merely thin. */
export function termProblems(term: Term): readonly string[] {
  const problems: string[] = [];
  if (typeof term.label !== 'string' || term.label.trim().length === 0)
    problems.push('label is empty');
  if (typeof term.shortDefinition !== 'string' || term.shortDefinition.trim().length === 0)
    problems.push('shortDefinition is empty');
  if (!Array.isArray(term.explainer) || !term.explainer.every((p) => typeof p === 'string'))
    problems.push('explainer is not a list of paragraphs');
  if (!Array.isArray(term.confusableWith)) problems.push('confusableWith is not a list');
  if (!Array.isArray(term.illustratedBy)) problems.push('illustratedBy is not a list');
  if (!Array.isArray(term.sourceRefs)) problems.push('sourceRefs is not a list');
  return problems;
}

export function findTerm(bundle: ContentBundle, termId: TermId): Term | null {
  return bundle.terms.find((t) => t.id === termId) ?? null;
}

/** Resolves a term and its confusables; self-references and duplicates are dropped, unknown IDs reported. */
export function lookupTerm(bundle: ContentBundle, termId: TermId): TermLookup {
  const term = findTerm(bundle, termId);
  if (!term) return { kind: 'missing', termId };
  const problems = termProblems(term);
  if (problems.length > 0) return { kind: 'malformed', termId, problems };

  const confusables: Term[] = [];
  const unresolvedConfusables: TermId[] = [];
  const seen = new Set<TermId>([term.id]);
  for (const id of term.confusableWith) {
    if (seen.has(id)) continue;
    seen.add(id);
    const sibling = findTerm(bundle, id);
    if (sibling && termProblems(sibling).length === 0) confusables.push(sibling);
    else unresolvedConfusables.push(id);
  }
  return { kind: 'found', term, confusables, unresolvedConfusables };
}

export function findComparison(
  bundle: ContentBundle,
  comparisonId: string | null,
): ComparisonRequest | null {
  if (comparisonId === null) return null;
  return bundle.comparisons.find((c) => c.id === comparisonId) ?? null;
}

export function bindingPresence(binding: TermBinding): BindingPresence {
  switch (binding.role) {
    case 'actual':
      return { kind: 'in_scene', entityId: binding.entityId };
    case 'hypothetical':
      return { kind: 'not_in_scene', comparisonId: binding.comparisonId };
    case 'glossary':
      return { kind: 'glossary_only' };
  }
}

function dedupeSources(sources: readonly SourceLocator[]): readonly SourceLocator[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.sourceId}|${String(s.pdfPage)}|${s.drawing ?? ''}|${s.section ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Human-readable citation for a locator; never invents a page the locator does not carry. */
export function describeLocator(locator: SourceLocator): string {
  const parts: string[] = [String(locator.sourceId)];
  if (locator.drawing)
    parts.push(
      locator.drawing + (locator.drawingRevision ? ` rev ${locator.drawingRevision}` : ''),
    );
  if (locator.section) parts.push(locator.section);
  if (locator.printedPage) parts.push(`p. ${locator.printedPage}`);
  else if (locator.pdfPage !== null) parts.push(`PDF p. ${locator.pdfPage}`);
  return parts.join(' · ');
}

/**
 * Builds everything the explainer needs for one help request. `termId` is the term currently shown;
 * it starts as the binding's own term and changes when the learner follows a confusable chip, in
 * which case scene presence still describes the original binding.
 */
export function explainerModel(
  bundle: ContentBundle,
  binding: TermBinding,
  termId: TermId | null,
): ExplainerModel {
  const lookup = termId === null ? null : lookupTerm(bundle, termId);
  const showingOriginal = termId === binding.termId;
  const presence: BindingPresence = showingOriginal
    ? bindingPresence(binding)
    : { kind: 'glossary_only' };
  const comparison =
    showingOriginal && binding.role === 'hypothetical'
      ? findComparison(bundle, binding.comparisonId)
      : null;
  const comparisonMissing =
    showingOriginal &&
    binding.role === 'hypothetical' &&
    binding.comparisonId !== null &&
    comparison === null;
  const title = lookup?.kind === 'found' ? lookup.term.label : binding.text;
  const sources = lookup?.kind === 'found' ? dedupeSources(lookup.term.sourceRefs) : [];
  return { title, presence, lookup, comparison, comparisonMissing, sources };
}
