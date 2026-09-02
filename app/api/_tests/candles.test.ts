import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, parseDays, MAX_DAYS } from '../candles.js';
import { makeRes } from '../_lib/failureContract.js';

/**
 * The route the charts read, now on EODHD's daily history rather than
 * Finnhub's (whose candles are a paid tier this app's key does not have, so
 * every chart answered 403). The cases that matter most: an empty series is
 * an answer about the symbol and not a failure, and a plan refusal must not
 * reach the reader as "try again later" — one of those will never come true.
 */

const bars = [
  { date: '2026-08-31', open: 9, high: 11, low: 8, close: 10, adjusted_close: 10, volume: 90 },
  { date: '2026-09-01', open: 10, high: 12, low: 9, close: 11, adjusted_close: 11, volume: 100 },
];

const respond = (body: unknown, status = 200) =>
  vi.fn(
    async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response,
  ) as unknown as typeof fetch;

const call = async (query: Record<string, string | string[]>, fetchImpl: typeof fetch) => {
  const res = makeRes();
  await createHandler(1_000, fetchImpl)({ method: 'GET', query }, res);
  return res;
};

/** The URL the handler actually asked for, so the window can be asserted. */
const requestedUrl = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0];

beforeEach(() => {
  vi.stubEnv('EODHD_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseDays', () => {
  it('defaults, and bounds what one request may ask for', () => {
    expect(parseDays(undefined)).toBe(400);
    expect(parseDays('30')).toBe(30);
    expect(parseDays('0')).toBeNull();
    expect(parseDays(String(MAX_DAYS + 1))).toBeNull();
    expect(parseDays('thirty')).toBeNull();
  });
});

describe('/api/candles', () => {
  it('serves the mapped series with the newest session as as_of', async () => {
    const res = await call({ symbol: 'nvda' }, respond(bars));
    expect(res._status).toBe(200);
    const body = res._body as { ticker: string; as_of: string; source: string; bars: unknown[] };
    expect(body.ticker).toBe('NVDA');
    expect(body.bars).toHaveLength(2);
    expect(body.as_of).toBe('2026-09-01');
    expect(body.source).toBe('eodhd:eod');
  });

  it('asks the provider for the requested window, as dates', async () => {
    const fetchImpl = respond(bars);
    await call({ symbol: 'NVDA', days: '30' }, fetchImpl);
    const url = requestedUrl(fetchImpl);
    const from = url.searchParams.get('from')!;
    const to = url.searchParams.get('to')!;
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)).toBe(
      30,
    );
  });

  it('sends a bare ticker to its US listing and keeps a suffix as given', async () => {
    const us = respond(bars);
    await call({ symbol: 'NVDA' }, us);
    expect(requestedUrl(us).pathname).toBe('/api/eod/NVDA.US');

    const toronto = respond(bars);
    await call({ symbol: 'MDA.TO' }, toronto);
    expect(requestedUrl(toronto).pathname).toBe('/api/eod/MDA.TO');
  });

  it('answers an empty series with a null as_of rather than an error', async () => {
    // A real answer about the symbol: the app renders "no history for this
    // ticker" rather than telling anyone to retry.
    const res = await call({ symbol: 'NOSUCH' }, respond([]));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ bars: [], as_of: null });
  });

  it('reads a 404 as "no history for this symbol", not as a failure', async () => {
    // EODHD answers 404 for a ticker it does not carry. That is the provider
    // naming the symbol, and it must reach the reader as the same honest
    // "no price history" an empty series does — never as "unavailable",
    // which claims we could not find out.
    const res = await call({ symbol: 'ZZZZQQ' }, respond({ error: 'not found' }, 404));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ bars: [], as_of: null });
  });

  it('reports a plan problem as a plan problem, not as an outage', async () => {
    const res = await call({ symbol: 'NVDA' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('classifies a 402 with the plan refusals, as the shared classifier does', async () => {
    // Worth knowing: EODHD documents 402 as "API limit used up", which fixes
    // itself at midnight GMT, where `upstream_forbidden` tells the reader the
    // subscription may not cover the data. The two are different promises.
    // Left as-is deliberately — classifyUpstreamStatus is shared with the
    // news, earnings and SnapTrade routes, and 100k calls a day makes this
    // path all but unreachable — but it is the one message here that would be
    // imprecise if it ever fired.
    const res = await call({ symbol: 'NVDA' }, respond({}, 402));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('reports an unreadable shape rather than an empty chart', async () => {
    const res = await call({ symbol: 'NVDA' }, respond({ error: 'nope' }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('refuses a series with one unreadable session, whole', async () => {
    const res = await call({ symbol: 'NVDA' }, respond([bars[0], { ...bars[1], volume: null }]));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('validates the symbol before spending an upstream call', async () => {
    const fetchImpl = respond(bars);
    const res = await call({ symbol: 'not a ticker' }, fetchImpl);
    expect(res._status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ symbol: ['NVDA', 'AAPL'] }, respond(bars));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('caches a success for an hour and a failure not at all', async () => {
    expect((await call({ symbol: 'NVDA' }, respond(bars)))._headers['Cache-Control']).toContain(
      's-maxage=3600',
    );
    expect((await call({ symbol: 'NVDA' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    const res = await call({ symbol: 'NVDA' }, respond(bars));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(bars))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
