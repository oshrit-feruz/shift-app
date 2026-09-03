import { describe, expect, it } from 'vitest';
import { newestFirst } from './transactionOrder';
import type { ManualTransaction } from '../state/appState';

function tx(p: Partial<ManualTransaction>): ManualTransaction {
  return { id: 'a', side: 'buy', ticker: 'NVDA', shares: 1, price: 1, date: '2026-08-20', ...p };
}

describe('newestFirst', () => {
  it('puts the later trade date first', () => {
    const older = tx({ id: 'a', date: '2026-08-19' });
    const newer = tx({ id: 'b', date: '2026-08-20' });
    expect([older, newer].sort(newestFirst)).toEqual([newer, older]);
  });

  it('orders two trades on the same day by when they were entered', () => {
    // The bug this covers: the comparator returned 0 here, so the log showed
    // whichever row happened to arrive first — not the one just typed.
    const first = tx({ id: 'a', createdAt: '2026-08-20T10:00:00Z' });
    const second = tx({ id: 'b', createdAt: '2026-08-20T11:00:00Z' });
    expect([first, second].sort(newestFirst)).toEqual([second, first]);
    expect([second, first].sort(newestFirst)).toEqual([second, first]);
  });

  it('falls back on the id so two devices cannot disagree', () => {
    const a = tx({ id: 'a', createdAt: '2026-08-20T10:00:00Z' });
    const b = tx({ id: 'b', createdAt: '2026-08-20T10:00:00Z' });
    expect([b, a].sort(newestFirst)).toEqual([a, b]);
    expect([a, b].sort(newestFirst)).toEqual([a, b]);
  });

  it('sorts a row with no createdAt as the oldest of its day', () => {
    // Rows entered before createdAt was carried through still have to land
    // somewhere definite rather than unsettling everything around them.
    const legacy = tx({ id: 'z' });
    const stamped = tx({ id: 'a', createdAt: '2026-08-20T09:00:00Z' });
    expect([legacy, stamped].sort(newestFirst)).toEqual([stamped, legacy]);
  });
});
