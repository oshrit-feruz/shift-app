import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoService } from './demoAdapter';
import { clearLoadableCache } from './loadableCache';

/**
 * The seam this file guards is the one the whole "prices are real now" change
 * rests on: a symbol row leaves this adapter carrying the mirror's price, or
 * carrying no price at all. What it must never carry is the prototype's
 * frozen price wearing `quote`'s clothes — that is the single failure mode
 * that would put an invented number on screen looking live.
 */

const NOW = new Date();
const today = NOW.toISOString().slice(0, 10);

// The mirror read is shared through the module-level cache, and these tests
// drive it by stubbing the global fetch — so without a reset the first case's
// snapshot would be served to every case after it, and a test asserting on a
// dead or stale mirror would quietly pass against the healthy one.
beforeEach(clearLoadableCache);
// Unstubbing per-test as the last statement meant a failing assertion above it
// skipped the cleanup, leaking the stubbed fetch into every test after it — one
// real failure would then produce a cascade of unrelated ones.
afterEach(() => {
  vi.unstubAllGlobals();
});

function mirror(rows: unknown[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ computed_on: today, full_ranking: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

/** The prototype prices that must never surface as a quote. */
const DEMO_PRICE = { NVDA: 182.44, AAPL: 226.79 };

describe('symbols() — real prices attached, demo prices quarantined', () => {
  it('attaches the mirror price to a covered ticker', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76, high_52w: 324.63, drawdown_pct: 55.4 }]));
    const r = await demoService.symbols();
    expect(r.status).toBe('ok');
    const nvda = r.status === 'ok' ? r.data.find((s) => s.ticker === 'NVDA')! : null;
    expect(nvda!.quote).toEqual({ price: 144.76, high52w: 324.63, drawdownPct: 55.4 });
    // The prototype figure is still reachable for the demo-only stats, but it
    // is not what the price surfaces read.
    expect(nvda!.demo.price).toBe(DEMO_PRICE.NVDA);
  });

  it('leaves an uncovered ticker with quote: null — not with its demo price', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76 }]));
    const r = await demoService.symbols();
    const aapl = r.status === 'ok' ? r.data.find((s) => s.ticker === 'AAPL')! : null;
    expect(aapl!.quote).toBeNull();
    expect(aapl!.demo.price).toBe(DEMO_PRICE.AAPL);
  });

  it('still lists every symbol when the mirror cannot be read, all quotes null', async () => {
    // A dead mirror costs the prices, not the watchlist: the rows render with
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

  it('never reports a stale snapshot price as a quote', async () => {
    vi.stubGlobal(
      'fetch',
      (async () =>
        new Response(
          JSON.stringify({ computed_on: '2020-01-01', full_ranking: [{ ticker: 'NVDA', price: 144.76 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as unknown as typeof fetch,
    );
    const r = await demoService.symbols();
    const nvda = r.status === 'ok' ? r.data.find((s) => s.ticker === 'NVDA')! : null;
    expect(nvda!.quote).toBeNull();
  });
});

describe('symbol() — one ticker, same contract', () => {
  it('returns the mirror price for a covered ticker', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76 }]));
    const r = await demoService.symbol('NVDA');
    expect(r.status === 'ok' && r.data.quote?.price).toBe(144.76);
  });

  it('is unavailable for a symbol the app does not carry, however good the mirror', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'ZZZZ', price: 1 }]));
    const r = await demoService.symbol('ZZZZ');
    expect(r.status).toBe('unavailable');
  });
});

describe("watchRows() — the user's own list, whatever is on it", () => {
  it('returns rows in the order the user put them in', async () => {
    vi.stubGlobal(
      'fetch',
      mirror([
        { ticker: 'NVDA', price: 144.76 },
        { ticker: 'AAPL', price: 210.5 },
      ]),
    );
    const r = await demoService.watchRows(['AAPL', 'NVDA']);
    expect(r.status === 'ok' && r.data.map((x) => x.ticker)).toEqual(['AAPL', 'NVDA']);
  });

  it('keeps a ticker the sample table does not cover, priced from the mirror', async () => {
    // The whole point of a real watchlist: ORCL is in the engine's ranking
    // but has no sample row, and must not be silently dropped from a list the
    // user just added it to.
    vi.stubGlobal('fetch', mirror([{ ticker: 'ORCL', price: 151.94, high_52w: 324.63 }]));
    const r = await demoService.watchRows(['ORCL']);
    const orcl = r.status === 'ok' ? r.data[0] : null;
    expect(orcl!.ticker).toBe('ORCL');
    expect(orcl!.quote?.price).toBe(151.94);
    // ...and nothing about it is invented.
    expect(orcl!.name).toBeNull();
    expect(orcl!.sector).toBeNull();
    expect(orcl!.demoChangePct).toBeNull();
  });

  it('never lends a demo day change to a ticker with no sample row', async () => {
    vi.stubGlobal(
      'fetch',
      mirror([
        { ticker: 'NVDA', price: 1 },
        { ticker: 'ORCL', price: 2 },
      ]),
    );
    const r = await demoService.watchRows(['NVDA', 'ORCL']);
    const rows = r.status === 'ok' ? r.data : [];
    expect(rows.find((x) => x.ticker === 'NVDA')!.demoChangePct).toBe(2.31);
    expect(rows.find((x) => x.ticker === 'ORCL')!.demoChangePct).toBeNull();
  });

  it('normalises what the caller passes', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76 }]));
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

  it('still lists every row when the mirror is dead, prices null', async () => {
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
    vi.stubGlobal(
      'fetch',
      mirror([
        { ticker: 'ORCL', price: 151.94 },
        { ticker: 'NVDA', price: 144.76 },
      ]),
    );
    const r = await demoService.searchUniverse();
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers).toContain('ORCL');
    expect(tickers).toContain('NVDA');
    // No duplicate for a ticker that is in both.
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
    // Named rows first — those are the ones a company-name search can hit.
    expect(tickers.indexOf('NVDA')).toBeLessThan(tickers.indexOf('ORCL'));
  });

  it('falls back to the sample table when the mirror is dead', async () => {
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
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 1 }]));
    const r = await demoService.searchUniverse(['DELISTED']);
    const rows = r.status === 'ok' ? r.data : [];
    const row = rows.find((x) => x.ticker === 'DELISTED');
    expect(row).toBeDefined();
    expect(row!.quote).toBeNull();
    expect(row!.name).toBeNull();
  });

  it('does not list a followed ticker twice', async () => {
    vi.stubGlobal(
      'fetch',
      mirror([
        { ticker: 'NVDA', price: 1 },
        { ticker: 'ORCL', price: 2 },
      ]),
    );
    const r = await demoService.searchUniverse(['NVDA', 'ORCL']);
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
    expect(tickers.filter((x) => x === 'ORCL')).toHaveLength(1);
  });

  it('dedupes a mirror key that only differs by whitespace', async () => {
    // mapSignal uppercases what the snapshot carries but does not trim it, so
    // a padded key used to survive the raw comparison against the sample table
    // and then normalise to a symbol already in the list — two rows for one
    // company, sharing a React key.
    vi.stubGlobal('fetch', mirror([{ ticker: ' NVDA ', price: 1 }]));
    const r = await demoService.searchUniverse();
    const tickers = r.status === 'ok' ? r.data.map((x) => x.ticker) : [];
    expect(tickers.filter((x) => x === 'NVDA')).toHaveLength(1);
  });
});
