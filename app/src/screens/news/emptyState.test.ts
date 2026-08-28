import { describe, it, expect } from 'vitest';
import { activeDay, emptyMessageKey } from './CalendarTab';

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

describe('activeDay', () => {
  it('keeps a selection the filtered week still offers', () => {
    expect(activeDay('2026-08-25', ['2026-08-24', '2026-08-25'])).toBe('2026-08-25');
  });

  // The trap: pick Tuesday, then switch to the watchlist, and Tuesday has no
  // watched report. Left as-is the strip highlights nothing, the list is
  // empty, and there is no chip to tap to undo it.
  it('drops a selection the filtered week no longer offers', () => {
    expect(activeDay('2026-08-25', ['2026-08-27'])).toBeNull();
  });

  it.each([
    ['no selection', null, ['2026-08-25']],
    ['an empty week', '2026-08-25', []],
  ])('is null for %s', (_label, day, available) => {
    expect(activeDay(day as string | null, available as string[])).toBeNull();
  });
});
