import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.unstubAllGlobals();
  });

  it('leaves an uncovered ticker with quote: null — not with its demo price', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76 }]));
    const r = await demoService.symbols();
    const aapl = r.status === 'ok' ? r.data.find((s) => s.ticker === 'AAPL')! : null;
    expect(aapl!.quote).toBeNull();
    expect(aapl!.demo.price).toBe(DEMO_PRICE.AAPL);
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });
});

describe('symbol() — one ticker, same contract', () => {
  it('returns the mirror price for a covered ticker', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'NVDA', price: 144.76 }]));
    const r = await demoService.symbol('NVDA');
    expect(r.status === 'ok' && r.data.quote?.price).toBe(144.76);
    vi.unstubAllGlobals();
  });

  it('is unavailable for a symbol the app does not carry, however good the mirror', async () => {
    vi.stubGlobal('fetch', mirror([{ ticker: 'ZZZZ', price: 1 }]));
    const r = await demoService.symbol('ZZZZ');
    expect(r.status).toBe('unavailable');
    vi.unstubAllGlobals();
  });
});
