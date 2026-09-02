import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, parseDays, MAX_DAYS } from './candles.js';
import { makeRes } from './_lib/failureContract.js';

/**
 * The route the charts read. The case that matters most here is the 403: the
 * provider serves live quotes on a free key but keeps daily candles for its
 * paid tiers, and "your plan does not include this" must not reach the reader
 * as "try again later" — one of those will never come true.
 */

const candleBody = {
  s: 'ok',
  t: [1_756_600_000],
  o: [10],
  h: [12],
  l: [9],
  c: [11],
  v: [100],
};

const respond = (body: unknown, status = 200) =>
  vi.fn(
    async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response,
  ) as unknown as typeof fetch;

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
    const res = await call({ symbol: 'nvda' }, respond(candleBody));
    expect(res._status).toBe(200);
    const body = res._body as { ticker: string; as_of: string; bars: unknown[] };
    expect(body.ticker).toBe('NVDA');
    expect(body.bars).toHaveLength(1);
    expect(body.as_of).toBe(new Date(1_756_600_000 * 1000).toISOString().slice(0, 10));
  });

  it('answers no_data as an empty series with a null as_of', async () => {
    // A real answer about the symbol, not an error: the app renders "no
    // history for this ticker" rather than telling anyone to retry.
    const res = await call({ symbol: 'MDA' }, respond({ s: 'no_data' }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ bars: [], as_of: null });
  });

  it('reports a plan problem as a plan problem, not as an outage', async () => {
    const res = await call({ symbol: 'NVDA' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('reports an unreadable shape rather than an empty chart', async () => {
    const res = await call({ symbol: 'NVDA' }, respond({ s: 'ok', t: [1], o: [1] }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('validates the symbol before spending an upstream call', async () => {
    const fetchImpl = respond(candleBody);
    const res = await call({ symbol: 'not a ticker' }, fetchImpl);
    expect(res._status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ symbol: ['NVDA', 'AAPL'] }, respond(candleBody));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('caches a success for an hour and a failure not at all', async () => {
    expect((await call({ symbol: 'NVDA' }, respond(candleBody)))._headers['Cache-Control']).toContain(
      's-maxage=3600',
    );
    expect((await call({ symbol: 'NVDA' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('FINNHUB_API_KEY', '');
    const res = await call({ symbol: 'NVDA' }, respond(candleBody));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(candleBody))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
