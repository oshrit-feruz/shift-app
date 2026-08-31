import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoService } from './demoAdapter';
import { clearLoadableCache } from './loadableCache';
import { clearQuoteCache } from './quotes';

/**
 * The seam this file guards is the one the whole "prices are real now" change
 * rests on: a symbol row leaves this adapter carrying a live quote, or
 * carrying no price at all. What it must never carry is the prototype's
 * frozen price wearing `quote`'s clothes — that is the single failure mode
 * that would put an invented number on screen looking live.
 *
 * Two sources are stubbed together here, because the adapter reads both: the
 * quote route (/api/quote) for prices, and the screener snapshot for which
 * tickers the engine ranks.
 */

const NOW = new Date();
const today = NOW.toISOString().slice(0, 10);

// Both reads are shared through module-level caches, and these tests drive
// them by stubbing the global fetch — so without a reset the first case's
// answers would be served to every case after it, and a test asserting on a
// dead or stale source would quietly pass against the healthy one.
beforeEach(() => {
  clearLoadableCache();
  clearQuoteCache();
});
// Unstubbing per-test as the last statement meant a failing assertion above it
// skipped the cleanup, leaking the stubbed fetch into every test after it — one
// real failure would then produce a cascade of unrelated ones.
afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A complete live quote for `price`. Only `price` matters to these cases. */
const quote = (price: number) => ({
  price,
  change: 1,
  changePct: 1,
  prevClose: price - 1,
  dayHigh: price,
  dayLow: price,
  open: price,
  asOf: NOW.toISOString(),
});

/**
 * A stubbed world: the quote route prices `prices`, and the engine ranks
 * `ranked`. Anything asked for and not listed comes back genuinely unpriced,
 * which is the case the adapter must render as "—".
 */
function world(prices: Record<string, number> = {}, ranked: string[] = []): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const href = String(url);
    if (href.startsWith('/api/quote')) {
      const asked = new URL(href, 'https://x').searchParams.get('symbols')?.split(',') ?? [];
      const quotes: Record<string, unknown> = {};
      for (const t of asked) if (t in prices) quotes[t] = quote(prices[t]);
      return json({ quotes, unavailable: [] });
    }
    return json({ computed_on: today, full_ranking: ranked.map((ticker) => ({ ticker })) });
  }) as unknown as typeof fetch;
}

/** The prototype prices that must never surface as a quote. */
const DEMO_PRICE = { NVDA: 182.44, AAPL: 226.79 };

describe('symbols() — real prices attached, demo prices quarantined', () => {
  it('attaches the live quote to a priced ticker', async () => {
    vi.stubGlobal('fetch', world({ NVDA: 144.76 }));
    const r = await demoService.symbols();
    expect(r.status).toBe('ok');
    const nvda = r.status === 'ok' ? r.data.find((s) => s.ticker === 'NVDA')! : null;
    expect(nvda!.quote?.price).toBeCloseTo(144.76, 6);
    // The prototype figure is still reachable for the demo-only stats, but it
    // is not what the price surfaces read.
    expect(nvda!.demo.price).toBe(DEMO_PRICE.NVDA);
  });

  it('leaves an unpriced ticker with quote: null — not with its demo price', async () => {
    vi.stubGlobal('fetch', world({ NVDA: 144.76 }));
    const r = await demoService.symbols();
    const aapl = r.status === 'ok' ? r.data.find((s) => s.ticker === 'AAPL')! : null;
    expect(aapl!.quote).toBeNull();
    expect(aapl!.demo.price).toBe(DEMO_PRICE.AAPL);
  });

  it('still lists every symbol when the quote route cannot be read, all quotes null', async () => {
    // A dead quote route costs the prices, not the list: the rows render with
    // "—" where the price goes, which tells the reader more than blanking the
    // whole screen would.
    vi.stubGlobal('fetch', (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    const r = await demoService.symbols();
    expect(r.status).toBe('ok');
    const rows = r.status === 'ok' ? r.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((s) => s.quote === null)).toBe(true);
  });
});

describe('symbol() — one ticker, same contract', () => {
  it('returns the live price for a ticker the app carries', async () => {
    vi.stubGlobal('fetch', world({ NVDA: 144.76 }));
    const r = await demoService.symbol('NVDA');
    expect(r.status === 'ok' && r.data.quote?.price).toBe(144.76);
  });

  it('is unavailable for a symbol the app does not carry, however good the quote', async () => {
    vi.stubGlobal('fetch', world({ ZZZZ: 1 }));
    const r = await demoService.symbol('ZZZZ');
    expect(r.status).toBe('unavailable');
  });
});

describe("watchRows() — the user's own list, whatever is on it", () => {
  it('returns rows in the order the user put them in', async () => {
    vi.stubGlobal('fetch', world({ NVDA: 144.76, AAPL: 210.5 }));
    const r = await demoService.watchRows(['AAPL', 'NVDA']);
    expect(r.status === 'ok' && r.data.map((x) => x.ticker)).toEqual(['AAPL', 'NVDA']);
  });

  it('keeps a ticker the sample table does not cover, priced live', async () => {
    // The whole point of a real watchlist: ORCL has no sample row, and must
    // not be silently dropped from a list the user just added it to.
    vi.stubGlobal('fetch', world({ ORCL: 151.94 }, ['ORCL']));
    const r = await demoService.watchRows(['ORCL']);
    const orcl = r.status === 'ok' ? r.data[0] : null;
    expect(orcl!.ticker).toBe('ORCL');
    expect(orcl!.quote?.price).toBe(151.94);
    // ...and nothing about it is invented.
    expect(orcl!.name).toBeNull();
    expect(orcl!.sector).toBeNull();
  });

  it("reads `ranked` from the engine's ranking, not from having a price", async () => {
    // Every US symbol has a live price now, so inferring "ranked" from one
    // would mark the whole watchlist as ranked. Only ORCL is in the ranking.
    vi.stubGlobal('fetch', world({ NVDA: 1, ORCL: 2 }, ['ORCL']));
    const r = await demoService.watchRows(['NVDA', 'ORCL']);
    const rows = r.status === 'ok' ? r.data : [];
    expect(rows.find((x) => x.ticker === 'NVDA')!.ranked).toBe(false);
    expect(rows.find((x) => x.ticker === 'ORCL')!.ranked).toBe(true);
  });

  it('normalises what the caller passes', async () => {
    vi.stubGlobal('fetch', world({ NVDA: 144.76 }));
    const r = await demoService.watchRows([' nvda ']);
    expect(r.status === 'ok' && r.data[0].ticker).toBe('NVDA');
    expect(r.status === 'ok' && r.data[0].quote?.price).toBe(144.76);
  });

  it('returns an empty list with no request at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const r = await demoService.watchRows([]);
    expect(r).toEqual({ status: 'ok', data: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still lists every row when the quote route is dead, prices null', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    const r = await demoService.watchRows(['NVDA', 'ORCL']);
    const rows = r.status === 'ok' ? r.data : [];
    expect(rows.map((x) => x.ticker)).toEqual(['NVDA', 'ORCL']);
    expect(rows.every((x) => x.quote === null)).toBe(true);
  });
});

describe('searchUniverse() — everything a user can follow', () => {
  it("offers the ranking's symbols alongside the sample table", async () => {
    vi.stubGlobal('fetch', world({}, ['ORCL', 'NVDA']));
    const r = await demoService.searchUniverse();
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers).toContain('ORCL');
    expect(tickers).toContain('NVDA');
    // No duplicate for a ticker that is in both.
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
    // Named rows first — those are the ones a company-name search can hit.
    expect(tickers.indexOf('NVDA')).toBeLessThan(tickers.indexOf('ORCL'));
  });

  it('falls back to the sample table when the ranking is dead', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    const r = await demoService.searchUniverse();
    const rows = r.status === 'ok' ? r.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.quote === null)).toBe(true);
  });
});

describe('searchUniverse() — one row per symbol, and never drops a followed one', () => {
  it('lists a followed ticker the ranking no longer covers', async () => {
    // Search is where someone goes to un-follow a stock. A list that quietly
    // omits it cannot be used to do that, and disagrees with watchRows.
    vi.stubGlobal('fetch', world({}, ['NVDA']));
    const r = await demoService.searchUniverse(['DELISTED']);
    const rows = r.status === 'ok' ? r.data : [];
    const row = rows.find((x) => x.ticker === 'DELISTED');
    expect(row).toBeDefined();
    expect(row!.quote).toBeNull();
    expect(row!.name).toBeNull();
  });

  it('does not list a followed ticker twice', async () => {
    vi.stubGlobal('fetch', world({}, ['NVDA', 'ORCL']));
    const r = await demoService.searchUniverse(['NVDA', 'ORCL']);
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
    expect(tickers.filter((x) => x === 'ORCL')).toHaveLength(1);
  });

  it('dedupes a ranking key that only differs by whitespace', async () => {
    // mapSignal uppercases what the snapshot carries but does not trim it, so
    // a padded key used to survive the raw comparison against the sample table
    // and then normalise to a symbol already in the list — two rows for one
    // company, sharing a React key.
    vi.stubGlobal('fetch', world({}, [' NVDA ']));
    const r = await demoService.searchUniverse();
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
  });
});
