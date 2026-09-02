import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, isUsSymbol } from './stats.js';
import { makeRes } from './_lib/failureContract.js';

/**
 * The route behind the key-stats grid. The cases that matter: a symbol this
 * US-only endpoint does not carry is an answer about the symbol rather than a
 * failure, and nothing here may carry a price — the grid sits under a live
 * one from a different provider, and this feed is delayed.
 */

const row = {
  symbol: 'QCOM.US',
  marketCap: 174752550000,
  pe: 19.483429,
  forwardPE: 16.835,
  dividendYield: 0.0216,
  fiftyTwoWeekHigh: 259.92,
  fiftyTwoWeekLow: 121.99,
  lastTradePrice: 166.431,
};
const okBody = { meta: { count: 1 }, data: { 'QCOM.US': row }, links: { next: null } };

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
  vi.stubEnv('EODHD_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isUsSymbol', () => {
  it('is true for what this endpoint can answer for, and false for the rest', () => {
    expect(isUsSymbol('QCOM')).toBe(true);
    expect(isUsSymbol('BRK.B')).toBe(true);
    expect(isUsSymbol('MDA.TO')).toBe(false);
    expect(isUsSymbol('VOD.LSE')).toBe(false);
  });
});

describe('/api/stats', () => {
  it('serves the mapped statistics', async () => {
    const res = await call({ symbol: 'qcom' }, respond(okBody));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ticker: 'QCOM',
      source: 'eodhd:us-quote-delayed',
      stats: { marketCap: 174752550000, pe: 19.483429, dividendYield: 0.0216 },
    });
  });

  it('carries no price, so nothing here can contradict the live one above it', async () => {
    const res = await call({ symbol: 'QCOM' }, respond(okBody));
    const stats = (res._body as { stats: Record<string, unknown> }).stats;
    expect(Object.keys(stats).sort()).toEqual([
      'dividendYield',
      'fiftyTwoWeekHigh',
      'fiftyTwoWeekLow',
      'forwardPE',
      'marketCap',
      'pe',
    ]);
  });

  it('answers a non-US symbol without spending a call to be told nothing', async () => {
    // The endpoint is US-only, so the answer is already known. Short-circuited
    // rather than asked, and reported as the same honest "we have nothing for
    // this symbol" a round trip would have produced.
    const fetchImpl = respond(okBody);
    const res = await call({ symbol: 'MDA.TO' }, fetchImpl);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ticker: 'MDA.TO', stats: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads an absent symbol as "nothing for this symbol", not as a failure', async () => {
    // Verified against the live API: asking for four symbols where two are
    // uncovered returns a map of two, with the others simply missing.
    const res = await call({ symbol: 'ZZZZQQ' }, respond({ meta: { count: 0 }, data: {} }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ stats: null });
  });

  it('reports an unreadable body rather than an empty grid', async () => {
    const res = await call({ symbol: 'QCOM' }, respond({ error: 'nope' }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('reports a plan problem as a plan problem', async () => {
    const res = await call({ symbol: 'QCOM' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('validates the symbol before spending an upstream call', async () => {
    const fetchImpl = respond(okBody);
    const res = await call({ symbol: 'not a ticker' }, fetchImpl);
    expect(res._status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ symbol: ['QCOM', 'AAPL'] }, respond(okBody));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('caches a success for fifteen minutes and a failure not at all', async () => {
    expect((await call({ symbol: 'QCOM' }, respond(okBody)))._headers['Cache-Control']).toContain(
      's-maxage=900',
    );
    expect((await call({ symbol: 'QCOM' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    const res = await call({ symbol: 'QCOM' }, respond(okBody));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(okBody))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
