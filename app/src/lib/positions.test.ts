import { describe, expect, it } from 'vitest';
import { buildPositions, oversellsAtAnyPoint, valuePositions } from './positions';
import type { ManualTransaction } from '../state/appState';
import type { Quote } from '../data/types';

let seq = 0;
const tx = (
  side: ManualTransaction['side'],
  ticker: string,
  shares: number,
  price: number,
  date = '2026-08-20',
): ManualTransaction => ({ id: `tx-${seq++}`, side, ticker, shares, price, date });

const quote = (price: number): Quote => ({
  price,
  change: 0,
  changePct: 0,
  prevClose: price,
  dayHigh: price,
  dayLow: price,
  open: price,
  asOf: '2026-08-31T13:00:00.000Z',
});

const only = (txs: ManualTransaction[]) => {
  const [pos] = buildPositions(txs);
  return pos;
};

describe('buildPositions — average cost', () => {
  it('averages across several buys', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('buy', 'NVDA', 10, 200)]);
    expect(pos.shares).toBe(20);
    expect(pos.avgCost).toBe(150);
    expect(pos.costBasis).toBe(3000);
  });

  // The exact bug this file replaces: the old fold moved avgCost to the sale
  // price, so selling at a profit read as the position getting more expensive.
  it('leaves avgCost untouched on a sell', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('sell', 'NVDA', 4, 180)]);
    expect(pos.shares).toBe(6);
    expect(pos.avgCost).toBe(100);
    expect(pos.costBasis).toBe(600);
  });

  it('books realised P/L against what the sold shares cost', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('sell', 'NVDA', 4, 180)]);
    expect(pos.realised).toBe(320);
    expect(pos.soldCost).toBe(400);
  });

  it('books a realised loss as a negative', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('sell', 'NVDA', 10, 60)]);
    expect(pos.realised).toBe(-400);
  });

  it('folds by trade date, not array order', () => {
    // Entered second, traded first: the sell must come off the 100 lot only.
    const late = tx('sell', 'NVDA', 5, 150, '2026-03-02');
    const early = tx('buy', 'NVDA', 5, 100, '2026-03-01');
    const byDate = only([late, early]);
    const inOrder = only([early, late]);
    expect(byDate).toEqual(inOrder);
    expect(byDate.realised).toBe(250);
  });
});

describe('buildPositions — sells that exhaust or exceed the holding', () => {
  it('keeps a fully-sold position with its realised P/L', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('sell', 'NVDA', 10, 130)]);
    expect(pos.shares).toBe(0);
    expect(pos.realised).toBe(300);
    expect(pos.costBasis).toBe(0);
  });

  it('records an oversell rather than clamping it away', () => {
    const pos = only([tx('buy', 'NVDA', 4, 100), tx('sell', 'NVDA', 10, 130)]);
    expect(pos.shares).toBe(0);
    expect(pos.oversold).toBe(6);
    // Only the shares actually held are booked.
    expect(pos.realised).toBe(120);
  });

  it('does not book a sell against a ticker never bought', () => {
    const pos = only([tx('sell', 'NVDA', 5, 130)]);
    expect(pos.shares).toBe(0);
    expect(pos.realised).toBe(0);
    expect(pos.oversold).toBe(5);
  });
});

describe('buildPositions — dividends', () => {
  it('accrues to dividends and touches neither shares nor cost basis', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('div', 'NVDA', 10, 0.5)]);
    expect(pos.shares).toBe(10);
    expect(pos.avgCost).toBe(100);
    expect(pos.costBasis).toBe(1000);
    expect(pos.dividends).toBe(5);
  });

  it('reads a share-less dividend row as a cash amount', () => {
    const pos = only([tx('buy', 'NVDA', 10, 100), tx('div', 'NVDA', 0, 42)]);
    expect(pos.dividends).toBe(42);
    expect(pos.shares).toBe(10);
  });
});

describe('valuePositions — three ways a price can be missing, and never zero', () => {
  const held = buildPositions([tx('buy', 'NVDA', 10, 100)]);

  it('values a covered ticker at shares × price', () => {
    const v = valuePositions(held, { NVDA: quote(150) });
    expect(v.positions[0].value).toBe(1500);
    expect(v.total).toBe(1500);
    expect(v.unpriced).toEqual([]);
  });

  it('reports null, not 0, when the quote snapshot is unavailable', () => {
    const v = valuePositions(held, null);
    expect(v.positions[0].price).toBeNull();
    expect(v.positions[0].value).toBeNull();
    expect(v.positions[0].plPct).toBeNull();
    expect(v.total).toBeNull();
  });

  it('reports null, not 0, for a ticker absent from the ranking', () => {
    const v = valuePositions(held, { AAPL: quote(200) });
    expect(v.positions[0].value).toBeNull();
    expect(v.total).toBeNull();
    expect(v.unpriced).toEqual(['NVDA']);
  });

  it('reports null, not 0, when the quote map has no entry for the ticker', () => {
    // A live quote is whole or absent: there is no "priced with a null
    // price" any more, so an unpriced ticker is simply not in the map.
    const v = valuePositions(held, {});
    expect(v.positions[0].value).toBeNull();
    expect(v.total).toBeNull();
  });
});

describe('valuePositions — the portfolio total', () => {
  const two = buildPositions([tx('buy', 'NVDA', 10, 100), tx('buy', 'XYZ', 5, 20)]);

  it('is null when any held leg is unpriced, not the sum of the rest', () => {
    const v = valuePositions(two, { NVDA: quote(150) });
    expect(v.total).toBeNull();
    expect(v.priced).toBe(1);
    expect(v.held).toBe(2);
    expect(v.unpriced).toEqual(['XYZ']);
  });

  it('totals only when every held leg is priced', () => {
    const v = valuePositions(two, { NVDA: quote(150), XYZ: quote(30) });
    expect(v.total).toBe(1650);
    expect(v.priced).toBe(2);
    expect(v.unpriced).toEqual([]);
  });

  // A closed position has nothing left to price, so it must not hold the
  // whole total hostage.
  it('ignores fully-sold positions when deciding the total is knowable', () => {
    const positions = buildPositions([
      tx('buy', 'NVDA', 10, 100),
      tx('buy', 'GONE', 5, 20),
      tx('sell', 'GONE', 5, 30),
    ]);
    const v = valuePositions(positions, { NVDA: quote(150) });
    expect(v.total).toBe(1500);
    expect(v.held).toBe(1);
    expect(v.unpriced).toEqual([]);
  });
});

describe('total return', () => {
  it('counts unrealised, realised and dividends against everything invested', () => {
    // 10 @ 100; sell 4 @ 180 (+320 realised, 400 of cost sold); $50 dividends.
    // Remaining 6 @ 150 = 900. Invested = 600 + 400 = 1000.
    // (900 + 320 + 50 − 600) / 1000 = 67%.
    const pos = buildPositions([
      tx('buy', 'NVDA', 10, 100),
      tx('sell', 'NVDA', 4, 180),
      tx('div', 'NVDA', 0, 50),
    ]);
    const v = valuePositions(pos, { NVDA: quote(150) });
    expect(v.positions[0].plPct).toBeCloseTo(67, 6);
  });

  it('is a flat 0 only when the position is genuinely flat', () => {
    const v = valuePositions(buildPositions([tx('buy', 'NVDA', 10, 100)]), { NVDA: quote(100) });
    expect(v.positions[0].plPct).toBe(0);
  });

  it('reports null rather than dividing by nothing ever invested', () => {
    const v = valuePositions(buildPositions([tx('div', 'NVDA', 0, 12)]), { NVDA: quote(150) });
    expect(v.positions[0].plPct).toBeNull();
  });
});

/**
 * The two corrections CodeRabbit named on #48: both leave the FINAL held
 * total right and break the history above it, which is exactly what a
 * held-share check cannot see.
 */
describe('oversellsAtAnyPoint', () => {
  it('is false for a ledger that never sells what it does not hold', () => {
    expect(oversellsAtAnyPoint([tx('buy', 'QCOM', 55, 162.97), tx('sell', 'QCOM', 55, 170.48)])).toBe(false);
  });

  // Moving a sale before its buy. End state: 0 shares, which balances — but on
  // the day of the sale there was nothing to sell.
  it('catches a sale dated before the buy that covers it', () => {
    const rows = [
      { ...tx('buy', 'QCOM', 55, 162.97), date: '2026-09-02' },
      { ...tx('sell', 'QCOM', 55, 170.48), date: '2026-09-01' },
    ];
    expect(oversellsAtAnyPoint(rows)).toBe(true);
  });

  // Cutting an earlier buy down. The sale that followed it now sells shares
  // that were never bought.
  it('catches an earlier buy reduced below the sale that followed it', () => {
    const rows = [
      { ...tx('buy', 'QCOM', 10, 162.97), date: '2026-09-01' },
      { ...tx('sell', 'QCOM', 55, 170.48), date: '2026-09-02' },
    ];
    expect(oversellsAtAnyPoint(rows)).toBe(true);
  });

  it('is false for an empty ledger', () => {
    expect(oversellsAtAnyPoint([])).toBe(false);
  });
});
