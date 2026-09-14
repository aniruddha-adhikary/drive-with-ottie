import { type TermBinding } from '@ottie/contracts';

export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly binding: TermBinding };

/**
 * Splits authored text into plain and term segments. Each binding's `text` is matched once, at its
 * first non-overlapping occurrence, in the order bindings are authored. Bindings whose text is not
 * present are ignored here (structural checks report them); nothing is invented.
 */
export function segmentText(text: string, bindings: readonly TermBinding[]): readonly TextSegment[] {
  const matches: { start: number; end: number; binding: TermBinding }[] = [];
  for (const binding of bindings) {
    if (binding.text.length === 0) continue;
    let from = 0;
    while (from <= text.length) {
      const start = text.indexOf(binding.text, from);
      if (start === -1) break;
      const end = start + binding.text.length;
      const overlaps = matches.some((m) => start < m.end && end > m.start);
      if (!overlaps) {
        matches.push({ start, end, binding });
        break;
      }
      from = start + 1;
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, m.start) });
    segments.push({ kind: 'term', text: text.slice(m.start, m.end), binding: m.binding });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}
