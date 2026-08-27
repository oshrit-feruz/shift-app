import { describe, it, expect } from 'vitest';
import { emptyMessageKey } from './CalendarTab';

describe('calendar empty state honesty', () => {
  it('claims "no match" only when the whole week is in hand', () => {
    // With every row present, "nothing matches" is a fact about the week.
    expect(emptyMessageKey(true, false)).toBe('earn.noneMatch');
    // Truncated: a watched ticker may sit in the rows that were dropped, so
    // the same sentence would be a guess dressed as a fact.
    expect(emptyMessageKey(true, true)).toBe('earn.noneInShown');
  });

  it('reports an empty week when no filter is applied', () => {
    expect(emptyMessageKey(false, false)).toBe('earn.weekEmpty');
    expect(emptyMessageKey(false, true)).toBe('earn.weekEmpty');
  });
});
