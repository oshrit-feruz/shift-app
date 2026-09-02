import { describe, expect, it } from 'vitest';
import { MAX_CARRY_DAYS, buildValueSeries, openGain } from './portfolioSeries';
import type { ManualTransaction } from '../state/appState';
import type { Bar } from '../data/types';

const tx = (over: Partial<ManualTransaction> & { date: string }): ManualTransaction => ({
  id: `t-${over.date}-${over.ticker ?? 'NVDA'}-${over.side ?? 'buy'}`,
  side: 'buy',
  ticker: 'NVDA',
  shares: 10,
  price: 100,
  ...over,
});

/** Daily bars from a date -> close map; only `date` and `close` are read. */
const bars = (closes: Record<string, number>): Bar[] =>
  Object.entries(closes).map(([date, close]) => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));

const map = (entries: Record<string, Bar[]>) => new Map(Object.entries(entries));

describe('buildValueSeries', () => {
  it('values each day at that day’s close, from the ledger as it stood', () => {
    const series = buildValueSeries(
      [tx({ date: '2026-01-02', shares: 10, price: 100 })],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 110, '2026-01-06': 90 }) }),
    );
    expect(series.points.map((p) => [p.date, p.value])).toEqual([
      ['2026-01-02', 1000],
      ['2026-01-05', 1100],
      ['2026-01-06', 900],
    ]);
  });

  it('does not start the curve before the first trade', () => {
    const series = buildValueSeries(
      [tx({ date: '2026-01-05' })],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 110 }) }),
    );
    expect(series.points.map((p) => p.date)).toEqual(['2026-01-05']);
  });

  it('adds a leg the day it is bought, not before', () => {
    const series = buildValueSeries(
      [
        tx({ date: '2026-01-02', ticker: 'NVDA', shares: 10, price: 100 }),
        tx({ date: '2026-01-05', ticker: 'AMD', shares: 5, price: 50 }),
      ],
      map({
        NVDA: bars({ '2026-01-02': 100, '2026-01-05': 100 }),
        AMD: bars({ '2026-01-02': 50, '2026-01-05': 60 }),
      }),
    );
    expect(series.points.map((p) => p.value)).toEqual([1000, 1000 + 300]);
  });

  it('drops a leg the day it is sold', () => {
    const series = buildValueSeries(
      [
        tx({ date: '2026-01-02', shares: 10, price: 100 }),
        tx({ date: '2026-01-05', side: 'sell', shares: 10, price: 120 }),
      ],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 120, '2026-01-06': 130 }) }),
    );
    // Sold out on the 5th: that day and after, the portfolio holds nothing.
    expect(series.points.map((p) => p.value)).toEqual([1000, 0, 0]);
  });

  it('is zero, not null, while the portfolio holds nothing', () => {
    const series = buildValueSeries(
      [
        tx({ date: '2026-01-02', shares: 10, price: 100 }),
        tx({ date: '2026-01-02', side: 'sell', shares: 10, price: 100 }),
      ],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 110 }) }),
    );
    expect(series.points.every((p) => p.value === 0)).toBe(true);
    expect(series.unpriced).toEqual([]);
  });

  describe('a day it cannot price completely', () => {
    const twoLegs = [
      tx({ date: '2026-01-02', ticker: 'NVDA', shares: 10, price: 100 }),
      tx({ date: '2026-01-02', ticker: 'MDA', shares: 10, price: 10 }),
    ];

    it('is null rather than the sum of the legs it could price', () => {
      const series = buildValueSeries(twoLegs, map({ NVDA: bars({ '2026-01-02': 100 }), MDA: [] }));
      // NOT 1000: a total that drops the leg it could not read is wrong, not
      // smaller. This is the assertion the whole module exists for.
      expect(series.points[0].value).toBeNull();
    });

    it('names the ticker that made it unknown', () => {
      const series = buildValueSeries(twoLegs, map({ NVDA: bars({ '2026-01-02': 100 }), MDA: [] }));
      expect(series.unpriced).toEqual(['MDA']);
    });

    it('names every unpriceable leg, not just the first', () => {
      const series = buildValueSeries(
        [...twoLegs, tx({ date: '2026-01-02', ticker: 'TEVA', shares: 1, price: 5 })],
        map({ NVDA: bars({ '2026-01-02': 100 }), MDA: [], TEVA: [] }),
      );
      expect(series.unpriced).toEqual(['MDA', 'TEVA']);
    });

    it('still reports the cost, which no provider can make unknown', () => {
      const series = buildValueSeries(twoLegs, map({ NVDA: bars({ '2026-01-02': 100 }), MDA: [] }));
      expect(series.points[0].cost).toBe(10 * 100 + 10 * 10);
    });

    it('treats a ticker absent from the map as unpriced, not as absent from the portfolio', () => {
      const series = buildValueSeries(twoLegs, map({ NVDA: bars({ '2026-01-02': 100 }) }));
      expect(series.points[0].value).toBeNull();
      expect(series.unpriced).toEqual(['MDA']);
    });
  });

  describe('carrying a close forward', () => {
    it('values a day the ticker did not trade at its last close', () => {
      const series = buildValueSeries(
        [
          tx({ date: '2026-01-02', ticker: 'NVDA', shares: 10, price: 100 }),
          tx({ date: '2026-01-02', ticker: 'MDA', shares: 10, price: 10 }),
        ],
        map({
          NVDA: bars({ '2026-01-02': 100, '2026-01-05': 100 }),
          // Toronto shut on the 5th; the position is still worth Friday's close.
          MDA: bars({ '2026-01-02': 10 }),
        }),
      );
      expect(series.points.map((p) => p.value)).toEqual([1100, 1100]);
      expect(series.unpriced).toEqual([]);
    });

    it('refuses to carry a close past the bound', () => {
      const stale = '2026-01-02';
      const far = '2026-01-20'; // 18 days on, well past MAX_CARRY_DAYS
      expect(MAX_CARRY_DAYS).toBeLessThan(18);
      const series = buildValueSeries(
        [
          tx({ date: stale, ticker: 'NVDA', shares: 10, price: 100 }),
          tx({ date: stale, ticker: 'MDA', shares: 10, price: 10 }),
        ],
        map({ NVDA: bars({ [stale]: 100, [far]: 100 }), MDA: bars({ [stale]: 10 }) }),
      );
      expect(series.points.map((p) => p.value)).toEqual([1100, null]);
      expect(series.unpriced).toEqual(['MDA']);
    });

    it('carries exactly up to the bound and no further', () => {
      const start = '2026-01-02';
      const atBound = '2026-01-09'; // exactly MAX_CARRY_DAYS = 7 days later
      const pastBound = '2026-01-10';
      expect(MAX_CARRY_DAYS).toBe(7);
      const series = buildValueSeries(
        [
          tx({ date: start, ticker: 'NVDA', shares: 1, price: 1 }),
          tx({ date: start, ticker: 'MDA', shares: 1, price: 1 }),
        ],
        map({
          NVDA: bars({ [start]: 1, [atBound]: 1, [pastBound]: 1 }),
          MDA: bars({ [start]: 5 }),
        }),
      );
      expect(series.points.map((p) => p.value)).toEqual([6, 6, null]);
    });
  });

  it('says when the ledger starts before the price window reaches', () => {
    const series = buildValueSeries([tx({ date: '2024-03-01' })], map({ NVDA: bars({ '2026-01-02': 100 }) }));
    expect(series.ledgerStartsBefore).toBe('2024-03-01');
  });

  it('says nothing about clipping when the window covers the whole ledger', () => {
    const series = buildValueSeries(
      [tx({ date: '2026-01-02' })],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 100 }) }),
    );
    expect(series.ledgerStartsBefore).toBeNull();
  });

  it('draws nothing at all from an empty ledger', () => {
    expect(buildValueSeries([], map({ NVDA: bars({ '2026-01-02': 100 }) }))).toEqual({
      points: [],
      unpriced: [],
      ledgerStartsBefore: null,
      aheadOfLastClose: false,
    });
  });

  describe('nothing to draw', () => {
    it('says the providers publish nothing when they publish nothing', () => {
      const series = buildValueSeries([tx({ date: '2026-01-02' })], map({ NVDA: [] }));
      expect(series.points).toEqual([]);
      expect(series.aheadOfLastClose).toBe(false);
    });

    it('says the ledger is ahead when every session predates the first trade', () => {
      // The ordinary state of a portfolio logged during a trading day: the
      // daily feed publishes after the close, so today has no bar yet. Calling
      // this "no history for these holdings" is false, and false about the
      // provider rather than about the portfolio.
      const series = buildValueSeries(
        [tx({ date: '2026-01-06' })],
        map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 110 }) }),
      );
      expect(series.points).toEqual([]);
      expect(series.aheadOfLastClose).toBe(true);
    });

    it('does not claim the ledger predates the window when it in fact postdates it', () => {
      const series = buildValueSeries(
        [tx({ date: '2026-01-06' })],
        map({ NVDA: bars({ '2026-01-02': 100 }) }),
      );
      expect(series.ledgerStartsBefore).toBeNull();
    });

    it('is not ahead of the close once one session covers the ledger', () => {
      const series = buildValueSeries(
        [tx({ date: '2026-01-05' })],
        map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 110 }) }),
      );
      expect(series.points).toHaveLength(1);
      expect(series.aheadOfLastClose).toBe(false);
    });
  });

  it('leaves the cost line intact across a gap in the value line', () => {
    const series = buildValueSeries(
      [
        tx({ date: '2026-01-02', ticker: 'NVDA', shares: 10, price: 100 }),
        tx({ date: '2026-01-02', ticker: 'MDA', shares: 10, price: 10 }),
      ],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-20': 100 }), MDA: bars({ '2026-01-02': 10 }) }),
    );
    expect(series.points.map((p) => p.value)).toEqual([1100, null]);
    expect(series.points.map((p) => p.cost)).toEqual([1100, 1100]);
  });

  it('ignores a dividend row when counting what is held', () => {
    const series = buildValueSeries(
      [
        tx({ date: '2026-01-02', shares: 10, price: 100 }),
        tx({ date: '2026-01-05', side: 'div', shares: 0, price: 25 }),
      ],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 100 }) }),
    );
    expect(series.points.map((p) => p.value)).toEqual([1000, 1000]);
  });

  it('folds a back-dated trade in at its own date, not at the end', () => {
    // Entered second, dated first: the fold sorts by date, so the earlier day
    // must already hold the shares.
    const series = buildValueSeries(
      [tx({ date: '2026-01-05', shares: 10, price: 100 }), tx({ date: '2026-01-02', shares: 5, price: 100 })],
      map({ NVDA: bars({ '2026-01-02': 100, '2026-01-05': 100 }) }),
    );
    expect(series.points.map((p) => p.value)).toEqual([500, 1500]);
  });
});

describe('openGain', () => {
  const point = (date: string, value: number | null, cost: number) => ({ date, value, cost });

  it('is the last priced day’s value against what those holdings cost', () => {
    expect(openGain([point('a', 100, 100), point('b', 150, 100)])).toEqual({ abs: 50, pct: 50 });
  });

  it('skips back past unpriced days at the end', () => {
    expect(openGain([point('a', 150, 100), point('b', null, 100)])).toEqual({ abs: 50, pct: 50 });
  });

  it('does NOT count money paid in as a gain', () => {
    // Bought 100 more on day b at exactly its price: value doubles, and the
    // portfolio has earned nothing. Reading the value line end to end would
    // report +100 here, which is the whole reason this function is not that.
    expect(openGain([point('a', 100, 100), point('b', 200, 200)])).toEqual({ abs: 0, pct: 0 });
  });

  it('is null when no day could be priced', () => {
    expect(openGain([point('a', null, 100)])).toBeNull();
    expect(openGain([])).toBeNull();
  });

  it('reports no percentage when the holdings cost nothing', () => {
    expect(openGain([point('a', 500, 0)])).toEqual({ abs: 500, pct: null });
  });
});
