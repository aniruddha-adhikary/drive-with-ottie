import { describe, expect, it } from 'vitest';
import { termId, type TermBinding } from '@ottie/contracts';
import { QUESTION_GIVE_WAY } from '@ottie/contracts/fixtures';
import { segmentText } from './segments';

describe('segmentText', () => {
  it('splits a fixture stem into plain and term segments in text order', () => {
    const segments = segmentText(QUESTION_GIVE_WAY.stem, QUESTION_GIVE_WAY.stemBindings);
    expect(segments.map((s) => s.text).join('')).toBe(QUESTION_GIVE_WAY.stem);
    const terms = segments.filter((s) => s.kind === 'term').map((s) => s.text);
    expect(terms).toEqual(['the car', 'double broken lines', 'bus']);
  });

  it('ignores bindings whose text is absent and never overlaps matches', () => {
    const bindings: TermBinding[] = [
      { role: 'glossary', text: 'stop line', termId: termId('stop-line') },
      { role: 'glossary', text: 'line', termId: termId('line') },
      { role: 'glossary', text: 'missing', termId: termId('missing') },
    ];
    const segments = segmentText('Stop at the stop line.', bindings);
    expect(segments).toEqual([
      { kind: 'text', text: 'Stop at the ' },
      { kind: 'term', text: 'stop line', binding: bindings[0] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('returns one plain segment when there are no bindings', () => {
    expect(segmentText('Plain.', [])).toEqual([{ kind: 'text', text: 'Plain.' }]);
  });
});
