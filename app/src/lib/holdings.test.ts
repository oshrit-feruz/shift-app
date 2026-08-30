import { describe, expect, it } from 'vitest';
import { mergeManualTransactions } from './holdings';
import type { Holding } from '../data/types';
import type { ManualTransaction } from '../state/appState';

describe('mergeManualTransactions and short positions', () => {
  // The first real brokerage account this app read: one short, one long.
  const alb: Holding = { ticker: 'ALB', shares: -77, avgCost: 129.52753247, value: -10454.29, plPct: -4.82 };
  const orcl: Holding = { ticker: 'ORCL', shares: 33, avgCost: 183.07575758, value: 5014.02, plPct: -17.01 };

  it('keeps a short position — it is a real holding, not a sold-out one', () => {
    // This list used to end with `filter(shares > 0)`, written for the manual
    // sandbox where a sell clamps at zero and a negative count cannot arise.
    // Against a real account it deleted the ALB short outright, so the
    // holdings card showed one position where the account held two.
    const rows = mergeManualTransactions([alb, orcl], []);
    expect(rows.map((r) => r.ticker).sort()).toEqual(['ALB', 'ORCL']);
  });

  it('still drops a position sold down to nothing', () => {
    const sell: ManualTransaction = {
      id: 't1',
      side: 'sell',
      ticker: 'AAPL',
      shares: 5,
      price: 110,
      date: '2026-01-01',
    };
    const rows = mergeManualTransactions(
      [{ ticker: 'AAPL', shares: 5, avgCost: 100, value: 500, plPct: 0 }],
      [sell],
    );
    expect(rows).toEqual([]);
  });
});
