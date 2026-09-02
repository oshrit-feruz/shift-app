import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, parseSymbols, MAX_SYMBOLS } from '../quote.js';
import { makeRes } from '../_lib/failureContract.js';

/**
 * The route every price in the app now goes through. What these cases guard
 * is the line between "there is no price for this symbol" and "we could not
 * find out" — the two must never collapse, because one is a fact about the
 * ticker and the other is a fault of ours, and only the second is worth
 * retrying or reporting.
 */

const quoteBody = (price: number) => ({
  c: price,
  d: 1,
  dp: 1,
  h: price,
  l: price,
  o: price,
  pc: price - 1,
  t: 1_756_600_000,
});

const res200 = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const resErr = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

/** A stubbed provider: each symbol answers with what `answers` says. */
function upstream(answers: Record<string, unknown | number>) {
  return vi.fn(async (url: URL | string) => {
    const symbol = new URL(String(url)).searchParams.get('symbol')!;
    const answer = answers[symbol];
    if (typeof answer === 'number') return resErr(answer);
    return res200(answer ?? { c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 });
  }) as unknown as typeof fetch;
}

const call = async (query: Record<string, string | string[]>, fetchImpl: typeof fetch) => {
  const res = makeRes();
  await createHandler(1_000, fetchImpl)({ method: 'GET', query }, res);
  return res;
};

beforeEach(() => {
  vi.stubEnv('FINNHUB_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseSymbols', () => {
  it('normalises, de-duplicates and preserves order', () => {
    expect(parseSymbols(' nvda , aapl , NVDA ')).toEqual({ symbols: ['NVDA', 'AAPL'] });
  });

  it('refuses a malformed symbol instead of quietly dropping it', () => {
    // Skipping it would answer a shorter question than the one asked, with
    // nothing in the response to say so.
    expect(parseSymbols('NVDA,not a ticker')).toHaveProperty('error');
  });

  it('requires at least one symbol and bounds the list', () => {
    expect(parseSymbols(undefined)).toHaveProperty('error');
    expect(parseSymbols(' , ')).toHaveProperty('error');
    const many = Array.from({ length: MAX_SYMBOLS + 1 }, (_, i) => `T${i}`).join(',');
    expect(parseSymbols(many)).toHaveProperty('error');
  });
});

describe('/api/quote', () => {
  it('prices the symbols the provider carries', async () => {
    const res = await call(
      { symbols: 'NVDA,AAPL' },
      upstream({ NVDA: quoteBody(150), AAPL: quoteBody(210) }),
    );
    expect(res._status).toBe(200);
    const body = res._body as { quotes: Record<string, { price: number }> };
    expect(body.quotes.NVDA.price).toBe(150);
    expect(body.quotes.AAPL.price).toBe(210);
  });

  it('leaves a symbol it does not carry out of the map, and out of `unavailable`', async () => {
    // Finnhub answers an unknown symbol with an all-zero 200. Absent from the
    // map is the honest place for it: nothing failed, there is simply no
    // price, and the app renders "—".
    const res = await call({ symbols: 'NVDA,MDA' }, upstream({ NVDA: quoteBody(150) }));
    const body = res._body as { quotes: Record<string, unknown>; unavailable: string[] };
    expect(Object.keys(body.quotes)).toEqual(['NVDA']);
    expect(body.unavailable).toEqual([]);
  });

  it('names the symbols whose fetch actually failed, and still returns the rest', async () => {
    const res = await call({ symbols: 'NVDA,AAPL' }, upstream({ NVDA: quoteBody(150), AAPL: 500 }));
    expect(res._status).toBe(200);
    const body = res._body as { quotes: Record<string, unknown>; unavailable: string[] };
    expect(Object.keys(body.quotes)).toEqual(['NVDA']);
    expect(body.unavailable).toEqual(['AAPL']);
  });

  it('reports the failure itself when every symbol failed', async () => {
    // A rejected key is not "none of these stocks exist". Answering 200 with
    // an empty map would tell the app the market went quiet.
    const res = await call({ symbols: 'NVDA,AAPL' }, upstream({ NVDA: 401, AAPL: 401 }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_unauthorized');
  });

  it('classifies a plan problem apart from a spent quota', async () => {
    expect(
      ((await call({ symbols: 'NVDA' }, upstream({ NVDA: 403 })))._body as { error: string }).error,
    ).toBe('upstream_forbidden');
    expect(
      ((await call({ symbols: 'NVDA' }, upstream({ NVDA: 429 })))._body as { error: string }).error,
    ).toBe('upstream_rate_limited');
  });

  it('never caches a failure', async () => {
    const res = await call({ symbols: 'NVDA' }, upstream({ NVDA: 500 }));
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('caches a success only briefly — freshness is the whole point of it', async () => {
    const res = await call({ symbols: 'NVDA' }, upstream({ NVDA: quoteBody(150) }));
    expect(res._headers['Cache-Control']).toContain('s-maxage=10');
  });

  it('spends one upstream call per distinct symbol, no matter how it was asked', async () => {
    const fetchImpl = upstream({ NVDA: quoteBody(150) });
    await call({ symbols: 'NVDA,nvda, NVDA ' }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ symbols: ['NVDA', 'BAD TICKER'] }, upstream({}));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('FINNHUB_API_KEY', '');
    const res = await call({ symbols: 'NVDA' }, upstream({}));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, upstream({}))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
