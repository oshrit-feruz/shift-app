import { describe, expect, it, vi } from 'vitest';
import { fetchPortfolioSeries, ledgerTickers } from './portfolioHistory';
import type { ManualTransaction } from '../state/appState';

const NOW = new Date('2026-01-08T12:00:00Z');

const tx = (over: Partial<ManualTransaction> & { ticker: string }): ManualTransaction => ({
  id: `t-${over.ticker}-${over.date ?? '2026-01-05'}`,
  side: 'buy',
  shares: 10,
  price: 100,
  date: '2026-01-05',
  ...over,
});

/** A /api/candles response body for one ticker. */
const file = (ticker: string, closes: Record<string, number>) => ({
  ticker,
  as_of: '2026-01-07',
  source: 'eodhd:eod',
  bars: Object.entries(closes).map(([d, c]) => ({ d, o: c, h: c, l: c, c, v: 100 })),
});

/** A fetch that answers per symbol; a symbol with no entry 404s. */
const routed = (bodies: Record<string, unknown>, status: Record<string, number> = {}) =>
  vi.fn(async (url: string) => {
    const symbol = new URL(url, 'https://x').searchParams.get('symbol') ?? '';
    const code = status[symbol] ?? (bodies[symbol] ? 200 : 404);
    return {
      ok: code >= 200 && code < 300,
      status: code,
      json: async () => bodies[symbol],
    } as unknown as Response;
  }) as unknown as typeof fetch;

describe('ledgerTickers', () => {
  it('is the distinct set, upper-cased', () => {
    expect(ledgerTickers([tx({ ticker: 'nvda' }), tx({ ticker: 'NVDA' }), tx({ ticker: ' amd ' })])).toEqual([
      'NVDA',
      'AMD',
    ]);
  });

  it('is empty for an empty ledger', () => {
    expect(ledgerTickers([])).toEqual([]);
  });
});

describe('fetchPortfolioSeries', () => {
  it('prices the ledger from the provider’s own closes', async () => {
    const out = await fetchPortfolioSeries(
      [tx({ ticker: 'NVDA', shares: 10, price: 100, date: '2026-01-05' })],
      routed({ NVDA: file('NVDA', { '2026-01-05': 100, '2026-01-06': 120 }) }),
      NOW,
    );
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.data.points.map((p) => p.value)).toEqual([1000, 1200]);
  });

  it('asks for each ticker once, however many rows mention it', async () => {
    const fetchImpl = routed({ NVDA: file('NVDA', { '2026-01-05': 100 }) });
    await fetchPortfolioSeries(
      [tx({ ticker: 'NVDA', id: 'a' }), tx({ ticker: 'nvda', id: 'b' }), tx({ ticker: 'NVDA', id: 'c' })],
      fetchImpl,
      NOW,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is ok with no points for an empty ledger, and asks for nothing', async () => {
    const fetchImpl = routed({});
    const out = await fetchPortfolioSeries([], fetchImpl, NOW);
    expect(out).toEqual({
      status: 'ok',
      data: { points: [], unpriced: [], ledgerStartsBefore: null, aheadOfLastClose: false },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports unavailable only when EVERY read failed', async () => {
    const out = await fetchPortfolioSeries(
      [tx({ ticker: 'NVDA' }), tx({ ticker: 'AMD' })],
      routed({}, { NVDA: 500, AMD: 500 }),
      NOW,
    );
    // Not a chart of a portfolio nobody could price — the app does not know.
    expect(out.status).toBe('unavailable');
  });

  it('still draws when only SOME reads failed, and names the casualty', async () => {
    const out = await fetchPortfolioSeries(
      [
        tx({ ticker: 'NVDA', shares: 10, price: 100, date: '2026-01-05' }),
        tx({ ticker: 'AMD', shares: 5, price: 50, date: '2026-01-05' }),
      ],
      routed({ NVDA: file('NVDA', { '2026-01-05': 100 }) }, { AMD: 500 }),
      NOW,
    );
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    // Null, not 1000: the day held a leg that could not be read.
    expect(out.data.points.map((p) => p.value)).toEqual([null]);
    expect(out.data.unpriced).toEqual(['AMD']);
  });

  it('treats a symbol the provider has no history for as unpriced, not as absent', async () => {
    const out = await fetchPortfolioSeries(
      [
        tx({ ticker: 'NVDA', shares: 10, price: 100, date: '2026-01-05' }),
        tx({ ticker: 'MDA', shares: 10, price: 10, date: '2026-01-05' }),
      ],
      // 404 is the route's "no history for this symbol" — a real answer.
      routed({ NVDA: file('NVDA', { '2026-01-05': 100 }) }),
      NOW,
    );
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.data.points.map((p) => p.value)).toEqual([null]);
    expect(out.data.unpriced).toEqual(['MDA']);
  });

  it('matches the ledger to bars case-insensitively', async () => {
    const out = await fetchPortfolioSeries(
      [tx({ ticker: 'nvda', shares: 10, price: 100, date: '2026-01-05' })],
      routed({ NVDA: file('NVDA', { '2026-01-05': 100 }) }),
      NOW,
    );
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    // The lower-cased row must not read as a ticker with no bars.
    expect(out.data.points.map((p) => p.value)).toEqual([1000]);
    expect(out.data.unpriced).toEqual([]);
  });
});
