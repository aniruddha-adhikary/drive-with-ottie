import { describe, expect, it } from 'vitest';
import {
  type ContentBundle,
  type Term,
  type TermBinding,
  entityId,
  termId,
} from '@ottie/contracts';
import {
  COMPARISON_GIVE_WAY_VS_STOP,
  DEVELOPMENT_CONTENT_BUNDLE,
  TERM_GIVE_WAY_LINE,
  TERM_STOP_LINE,
} from '@ottie/contracts/fixtures';
import {
  bindingPresence,
  describeLocator,
  explainerModel,
  isTermBinding,
  lookupTerm,
  termProblems,
} from './lookup';

const bundle = DEVELOPMENT_CONTENT_BUNDLE;

describe('isTermBinding', () => {
  it('accepts the three authored roles and rejects anything else', () => {
    expect(
      isTermBinding({ role: 'actual', text: 'x', termId: null, entityId: 'e', evidenceIds: [] }),
    ).toBe(true);
    expect(
      isTermBinding({ role: 'hypothetical', text: 'x', termId: 't', comparisonId: null }),
    ).toBe(true);
    expect(isTermBinding({ role: 'glossary', text: 'x', termId: 't' })).toBe(true);
    expect(isTermBinding({ role: 'glossary', text: 'x', termId: null })).toBe(false);
    expect(isTermBinding({ role: 'actual', text: 'x', termId: null })).toBe(false);
    expect(isTermBinding({ role: 'imaginary', text: 'x' })).toBe(false);
    expect(isTermBinding(null)).toBe(false);
    expect(isTermBinding('give way')).toBe(false);
  });
});

describe('lookupTerm', () => {
  it('finds a term with its confusables', () => {
    const result = lookupTerm(bundle, TERM_GIVE_WAY_LINE.id);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.term).toBe(TERM_GIVE_WAY_LINE);
    expect(result.confusables.map((t) => t.id)).toEqual([TERM_STOP_LINE.id]);
    expect(result.unresolvedConfusables).toEqual([]);
  });

  it('reports a missing term instead of throwing', () => {
    expect(lookupTerm(bundle, termId('no-such-term'))).toEqual({
      kind: 'missing',
      termId: 'no-such-term',
    });
  });

  it('reports malformed terms and unresolved confusables', () => {
    const broken: Term = { ...TERM_STOP_LINE, id: termId('broken'), shortDefinition: '   ' };
    const pointsAtBroken: Term = {
      ...TERM_GIVE_WAY_LINE,
      confusableWith: [termId('broken'), termId('ghost'), TERM_GIVE_WAY_LINE.id],
    };
    const custom: ContentBundle = { ...bundle, terms: [pointsAtBroken, broken] };
    expect(lookupTerm(custom, termId('broken'))).toEqual({
      kind: 'malformed',
      termId: 'broken',
      problems: ['shortDefinition is empty'],
    });
    const result = lookupTerm(custom, TERM_GIVE_WAY_LINE.id);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.confusables).toEqual([]);
    expect(result.unresolvedConfusables).toEqual(['broken', 'ghost']);
  });

  it('termProblems tolerates fields of the wrong runtime type', () => {
    const junk = {
      ...TERM_STOP_LINE,
      explainer: 'not a list',
      illustratedBy: null,
    } as unknown as Term;
    expect(termProblems(junk)).toEqual([
      'explainer is not a list of paragraphs',
      'illustratedBy is not a list',
    ]);
  });
});

describe('explainerModel', () => {
  const actual: TermBinding = {
    role: 'actual',
    text: 'double broken lines',
    termId: TERM_GIVE_WAY_LINE.id,
    entityId: entityId('e1'),
    evidenceIds: [],
  };
  const hypothetical: TermBinding = {
    role: 'hypothetical',
    text: 'a stop line',
    termId: TERM_STOP_LINE.id,
    comparisonId: COMPARISON_GIVE_WAY_VS_STOP.id,
  };
  const glossary: TermBinding = { role: 'glossary', text: 'stop line', termId: TERM_STOP_LINE.id };

  it('distinguishes presence per role', () => {
    expect(bindingPresence(actual)).toEqual({ kind: 'in_scene', entityId: 'e1' });
    expect(bindingPresence(hypothetical)).toEqual({
      kind: 'not_in_scene',
      comparisonId: COMPARISON_GIVE_WAY_VS_STOP.id,
    });
    expect(bindingPresence(glossary)).toEqual({ kind: 'glossary_only' });
  });

  it('attaches the comparison only to hypothetical bindings', () => {
    expect(explainerModel(bundle, hypothetical, hypothetical.termId).comparison).toBe(
      COMPARISON_GIVE_WAY_VS_STOP,
    );
    expect(explainerModel(bundle, actual, actual.termId).comparison).toBeNull();
    expect(explainerModel(bundle, glossary, glossary.termId).comparison).toBeNull();
  });

  it('flags a comparison ID the bundle does not have', () => {
    const model = explainerModel(
      bundle,
      { ...hypothetical, comparisonId: 'cmp.ghost' },
      hypothetical.termId,
    );
    expect(model.comparison).toBeNull();
    expect(model.comparisonMissing).toBe(true);
  });

  it('falls back to the binding text when the term is missing, and to glossary presence when following a confusable', () => {
    const missing = explainerModel(
      bundle,
      { ...glossary, termId: termId('ghost') },
      termId('ghost'),
    );
    expect(missing.title).toBe('stop line');
    expect(missing.lookup).toEqual({ kind: 'missing', termId: 'ghost' });
    expect(missing.sources).toEqual([]);

    const followed = explainerModel(bundle, hypothetical, TERM_GIVE_WAY_LINE.id);
    expect(followed.presence).toEqual({ kind: 'glossary_only' });
    expect(followed.comparison).toBeNull();
    expect(followed.title).toBe(TERM_GIVE_WAY_LINE.label);
  });

  it('handles a null term ID on an actual binding', () => {
    const model = explainerModel(bundle, { ...actual, termId: null }, null);
    expect(model.lookup).toBeNull();
    expect(model.title).toBe('double broken lines');
  });

  it('deduplicates source citations', () => {
    const model = explainerModel(bundle, glossary, glossary.termId);
    const keys = model.sources.map(describeLocator);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(0);
  });
});
