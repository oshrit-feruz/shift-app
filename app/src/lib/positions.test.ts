import { describe, expect, it } from 'vitest';
import { buildPositions, valuePositions } from './positions';
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

  it('opens a short for the excess of a sell beyond the holding', () => {
    const pos = only([tx('buy', 'NVDA', 4, 100), tx('sell', 'NVDA', 10, 130)]);
    // The 4 held are sold and booked; the other 6 are a short at 130.
    expect(pos.shares).toBe(-6);
    expect(pos.realised).toBe(120);
    expect(pos.avgCost).toBe(130);
    expect(pos.costBasis).toBe(-780);
  });
});

describe('buildPositions — short positions', () => {
  it('opens a short from a sell of a ticker never bought', () => {
    const pos = only([tx('sell', 'NVDA', 5, 130)]);
    expect(pos.shares).toBe(-5);
    expect(pos.avgCost).toBe(130);
    expect(pos.costBasis).toBe(-650);
    expect(pos.realised).toBe(0);
  });

  it('averages a second short sale into the open short', () => {
    const pos = only([tx('sell', 'NVDA', 5, 100), tx('sell', 'NVDA', 5, 120)]);
    expect(pos.shares).toBe(-10);
    expect(pos.avgCost).toBe(110);
  });

  it('covers a short with a buy and books the difference', () => {
    // Sold at 130, bought back at 100: 30 a share on 5 shares.
    const pos = only([tx('sell', 'NVDA', 5, 130), tx('buy', 'NVDA', 5, 100)]);
    expect(pos.shares).toBe(0);
    expect(pos.realised).toBe(150);
    expect(pos.costBasis).toBe(0);
    expect(pos.soldCost).toBe(650);
  });

  it('books a loss when the cover costs more than the short brought in', () => {
    const pos = only([tx('sell', 'NVDA', 5, 100), tx('buy', 'NVDA', 5, 130)]);
    expect(pos.realised).toBe(-150);
  });

  it('covers first, then opens a long with what is left of the buy', () => {
    const pos = only([tx('sell', 'NVDA', 5, 130), tx('buy', 'NVDA', 8, 100)]);
    expect(pos.shares).toBe(3);
    expect(pos.realised).toBe(150);
    // The long starts fresh at the buy price, not at the short's.
    expect(pos.avgCost).toBe(100);
    expect(pos.costBasis).toBe(300);
  });

  it('values a short at its negative worth and its return by size', () => {
    const [pos] = valuePositions(buildPositions([tx('sell', 'NVDA', 10, 100)]), {
      NVDA: quote(90),
    }).positions;
    expect(pos.value).toBe(-900);
    // Sold at 100, now 90: up 10 a share on 10 shares, against 1000 at risk.
    expect(pos.pl).toBe(100);
    expect(pos.plPct).toBeCloseTo(10, 6);
  });

  it('counts a short as an open, priced leg of the portfolio', () => {
    const v = valuePositions(buildPositions([tx('buy', 'AAPL', 10, 100), tx('sell', 'NVDA', 10, 100)]), {
      AAPL: quote(110),
      NVDA: quote(110),
    });
    expect(v.held).toBe(2);
    // 1100 long, −1100 short: net nothing, and the two legs cancel.
    expect(v.total).toBe(0);
    expect(v.pl).toBe(0);
    expect(v.invested).toBe(2000);
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

describe('portfolio-level return', () => {
  it('sums unrealised, realised and dividends into one profit figure', () => {
    // NVDA: 10 @ 100, now 150 → 1500 held against 1000 of cost, +500.
    // GONE: bought 5 @ 20 and sold 5 @ 30 → +50 booked, nothing left to hold.
    // Invested = 1000 + 100. Profit = 500 + 50 = 550.
    const pos = buildPositions([
      tx('buy', 'NVDA', 10, 100),
      tx('buy', 'GONE', 5, 20),
      tx('sell', 'GONE', 5, 30),
    ]);
    const v = valuePositions(pos, { NVDA: quote(150) });
    expect(v.invested).toBe(1100);
    expect(v.pl).toBe(550);
    expect(v.plPct).toBeCloseTo(50, 6);
  });

  it('counts a dividend as profit without a sale behind it', () => {
    const v = valuePositions(buildPositions([tx('buy', 'NVDA', 10, 100), tx('div', 'NVDA', 0, 40)]), {
      NVDA: quote(100),
    });
    expect(v.pl).toBe(40);
    expect(v.plPct).toBeCloseTo(4, 6);
  });

  // The whole point of the null: a profit computed over the legs that happen
  // to be priced is not a smaller profit, it is a wrong one — and flattering
  // whenever the leg we could not read is the one that is down.
  it('refuses a profit while any held position is unpriced', () => {
    const pos = buildPositions([tx('buy', 'NVDA', 10, 100), tx('buy', 'MDA', 5, 20)]);
    const v = valuePositions(pos, { NVDA: quote(150) });
    expect(v.total).toBeNull();
    expect(v.pl).toBeNull();
    expect(v.plPct).toBeNull();
    // Invested is the user's own arithmetic and stays knowable regardless.
    expect(v.invested).toBe(1100);
  });

  it('still reports a profit when only a CLOSED position is unpriced', () => {
    const pos = buildPositions([
      tx('buy', 'NVDA', 10, 100),
      tx('buy', 'MDA', 5, 20),
      tx('sell', 'MDA', 5, 30),
    ]);
    const v = valuePositions(pos, { NVDA: quote(150) });
    expect(v.pl).toBe(550);
  });

  it('reports a loss as a negative, not as an absent number', () => {
    const v = valuePositions(buildPositions([tx('buy', 'NVDA', 10, 100)]), { NVDA: quote(80) });
    expect(v.pl).toBe(-200);
    expect(v.plPct).toBeCloseTo(-20, 6);
  });

  it('has no percentage to report when nothing was ever invested', () => {
    const v = valuePositions(buildPositions([tx('div', 'NVDA', 0, 12)]), { NVDA: quote(150) });
    expect(v.invested).toBe(0);
    expect(v.plPct).toBeNull();
  });

  it('is zero, not null, for a portfolio with no transactions at all', () => {
    const v = valuePositions(buildPositions([]), {});
    expect(v.total).toBe(0);
    expect(v.pl).toBe(0);
    expect(v.plPct).toBeNull();
  });

  // A closed position is worth zero — known, and known without a quote.
  // Treating it as unpriced made its booked result null, so a position sold
  // out months ago read as "—" whenever its ticker happened to be missing
  // from today's quotes, though realised and soldCost already say everything.
  it('books a closed position with no quote at all, rather than reporting null', () => {
    const pos = buildPositions([tx('buy', 'MDA', 5, 20), tx('sell', 'MDA', 5, 30)]);
    const [closed] = valuePositions(pos, {}).positions;
    expect(closed.shares).toBe(0);
    expect(closed.value).toBe(0);
    expect(closed.pl).toBe(50);
    expect(closed.plPct).toBeCloseTo(50, 6);
  });
});
