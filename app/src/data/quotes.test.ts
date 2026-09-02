import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SYMBOLS_PER_REQUEST,
  QUOTE_TTL_MS,
  clearQuoteCache,
  extractQuotes,
  fetchQuotes,
  mapQuote,
  normaliseTickers,
} from './quotes';
import { clearLoadableCache } from './loadableCache';

/**
 * The contract every price on every screen depends on. Two lines run through
 * all of it:
 *   - a ticker with no price is ABSENT from the map (a fact about the symbol),
 *     while a failed read is 'unavailable' (a fact about us);
 *   - nothing is ever invented to fill either gap.
 */

const WIRE = {
  price: 150,
  change: 5,
  changePct: 3.45,
  prevClose: 145,
  dayHigh: 151,
  dayLow: 144,
  open: 145,
  asOf: '2026-08-31T13:00:00.000Z',
};

const respond = (body: unknown, status = 200) =>
  vi.fn(
    async () =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response,
  );

beforeEach(() => {
  clearQuoteCache();
  clearLoadableCache();
});

describe('normaliseTickers', () => {
  it('trims, upper-cases and de-duplicates while keeping the caller’s order', () => {
    expect(normaliseTickers([' aapl ', 'NVDA', 'aapl', ''])).toEqual(['AAPL', 'NVDA']);
  });
});

describe('mapQuote', () => {
  it('maps a complete wire quote', () => {
    expect(mapQuote(WIRE)).toEqual(WIRE);
  });

  it('refuses a partial quote rather than printing 0.00% for a real move', () => {
    // A price that arrived without its previous close has no real day change,
    // and a reader acts on a 0.00% they believe.
    expect(mapQuote({ ...WIRE, prevClose: undefined })).toBeNull();
    expect(mapQuote({ ...WIRE, asOf: '' })).toBeNull();
    expect(mapQuote(null)).toBeNull();
  });
});

describe('extractQuotes', () => {
  it('reads the map, upper-casing its keys', () => {
    expect(extractQuotes({ quotes: { nvda: WIRE } })).toEqual({ NVDA: WIRE });
  });

  it('reads an empty map as an empty map, not as a broken response', () => {
    // "None of these symbols are priced" is a real answer.
    expect(extractQuotes({ quotes: {} })).toEqual({});
  });

  it('refuses the whole response for one unreadable row', () => {
    // A partially mapped batch would price some rows and dash others with
    // nothing on screen to say which happened.
    expect(extractQuotes({ quotes: { NVDA: WIRE, AAPL: { price: 1 } } })).toBeNull();
    expect(extractQuotes({})).toBeNull();
  });
});

describe('fetchQuotes', () => {
  it('asks the app’s own route, never the provider', async () => {
    const fetchImpl = respond({ quotes: { NVDA: WIRE } });
    await fetchQuotes(['NVDA'], fetchImpl as unknown as typeof fetch);
    const url = String((fetchImpl.mock.calls as unknown as unknown[][])[0][0]);
    expect(url).toContain('/api/quote?symbols=NVDA');
    // The key is the account's whole quota in one string; it must never be
    // reachable from the browser.
    expect(url).not.toContain('finnhub');
  });

  it('returns an empty map with no request at all for an empty list', async () => {
    const fetchImpl = respond({});
    expect(await fetchQuotes([], fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'ok',
      data: {},
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leaves a ticker the provider does not price out of the map — not at zero', async () => {
    const r = await fetchQuotes(
      ['NVDA', 'MDA'],
      respond({ quotes: { NVDA: WIRE } }) as unknown as typeof fetch,
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && 'MDA' in r.data).toBe(false);
  });

  it('is unavailable — never a partial map — when the route fails', async () => {
    // Half a screen of live prices and half a screen of nothing, with no way
    // to tell them apart, is worse than an honest failure.
    const r = await fetchQuotes(['NVDA'], respond({}, 500) as unknown as typeof fetch);
    expect(r.status).toBe('unavailable');
  });

  it('carries the route’s own reason, so a plan problem does not read as an outage', async () => {
    const r = await fetchQuotes(
      ['NVDA'],
      respond({ error: 'upstream_forbidden', message: 'x' }, 502) as unknown as typeof fetch,
    );
    expect(r.status === 'unavailable' && r.reason?.en).toContain('subscription');
  });

  it('is unavailable on an unreadable body, a throwing fetch and a bad shape', async () => {
    expect((await fetchQuotes(['NVDA'], respond({ quotes: null }) as unknown as typeof fetch)).status).toBe(
      'unavailable',
    );
    const thrower = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect((await fetchQuotes(['NVDA'], thrower)).status).toBe('unavailable');
  });

  it('splits a list longer than one request into batches', async () => {
    const tickers = Array.from({ length: MAX_SYMBOLS_PER_REQUEST + 3 }, (_, i) => `T${i}`);
    const fetchImpl = respond({ quotes: {} });
    await fetchQuotes(tickers, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves a fresh ticker from cache and re-reads a stale one', async () => {
    // Only the default fetch is cached, so this drives the real path.
    const calls: string[] = [];
    const stub = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ quotes: { NVDA: WIRE } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', stub as unknown as typeof fetch);
    try {
      const t0 = 1_000_000;
      await fetchQuotes(['NVDA'], fetch, t0);
      await fetchQuotes(['NVDA'], fetch, t0 + QUOTE_TTL_MS - 1);
      expect(calls).toHaveLength(1);
      clearLoadableCache();
      await fetchQuotes(['NVDA'], fetch, t0 + QUOTE_TTL_MS + 1);
      expect(calls).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clearQuoteCache drops the shared batch response too, not just the tickers', async () => {
    // The two halves of one answer: the per-ticker map here, and the batch
    // payload shared through loadableCache. Clearing only the first left the
    // next read free to replay the very quotes it was asked to forget.
    const stub = vi.fn(
      async () =>
        new Response(JSON.stringify({ quotes: { NVDA: WIRE } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', stub as unknown as typeof fetch);
    try {
      const t0 = 3_000_000;
      await fetchQuotes(['NVDA'], fetch, t0);
      expect(stub).toHaveBeenCalledTimes(1);
      // Well inside the TTL, so only a real clear can force the second read.
      clearQuoteCache();
      await fetchQuotes(['NVDA'], fetch, t0 + 1);
      expect(stub).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not cache an absence the route reported as a failure', async () => {
    // Remembering "no price for AAPL" for the TTL when the truth was an
    // outage would leave a dash on screen long after the provider recovered.
    const stub = vi.fn(
      async () =>
        new Response(JSON.stringify({ quotes: {}, unavailable: ['AAPL'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', stub as unknown as typeof fetch);
    try {
      const t0 = 2_000_000;
      await fetchQuotes(['AAPL'], fetch, t0);
      clearLoadableCache();
      await fetchQuotes(['AAPL'], fetch, t0 + 1);
      expect(stub).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
