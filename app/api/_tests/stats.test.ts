import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, isUsSymbol, MAX_SYMBOLS, parseSymbols } from '../stats.js';
import { makeRes } from '../_lib/failureContract.js';

/**
 * The route behind the key-stats grid and the movers table. The cases that
 * matter: a symbol this US-only endpoint does not carry is an answer about
 * the symbol rather than a failure, and nothing here may carry a price — the
 * grid sits under a live one from a different provider, and this feed is
 * delayed.
 */

const row = {
  symbol: 'QCOM.US',
  marketCap: 174752550000,
  pe: 19.483429,
  forwardPE: 16.835,
  dividendYield: 0.0216,
  fiftyTwoWeekHigh: 259.92,
  fiftyTwoWeekLow: 121.99,
  volume: 8831907,
  averageVolume: 15642960,
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

/** The URL the handler actually asked for. */
const requestedUrl = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0];

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

describe('parseSymbols', () => {
  it('normalises, de-duplicates and bounds the list', () => {
    expect(parseSymbols('qcom, nvda ,QCOM')).toEqual({ symbols: ['QCOM', 'NVDA'] });
    expect(parseSymbols('')).toHaveProperty('error');
    expect(parseSymbols(undefined)).toHaveProperty('error');
    expect(parseSymbols('not a ticker')).toHaveProperty('error');
    expect(parseSymbols(Array.from({ length: MAX_SYMBOLS + 1 }, (_, i) => `T${i}`).join(','))).toHaveProperty(
      'error',
    );
  });
});

describe('/api/stats', () => {
  it('serves the mapped statistics, keyed by bare ticker', async () => {
    const res = await call({ symbols: 'qcom' }, respond(okBody));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      source: 'eodhd:us-quote-delayed',
      stats: { QCOM: { marketCap: 174752550000, pe: 19.483429, volume: 8831907 } },
    });
  });

  it('carries no price, so nothing here can contradict the live one above it', async () => {
    const res = await call({ symbols: 'QCOM' }, respond(okBody));
    const stats = (res._body as { stats: Record<string, Record<string, unknown>> }).stats;
    expect(Object.keys(stats.QCOM).sort()).toEqual([
      'averageVolume',
      'dividendYield',
      'fiftyTwoWeekHigh',
      'fiftyTwoWeekLow',
      'forwardPE',
      'marketCap',
      'pe',
      'volume',
    ]);
  });

  it('asks upstream for every US symbol in one request', async () => {
    const fetchImpl = respond({ meta: { count: 0 }, data: {} });
    await call({ symbols: 'QCOM,NVDA' }, fetchImpl);
    expect(requestedUrl(fetchImpl).searchParams.get('s')).toBe('QCOM.US,NVDA.US');
  });

  it('drops a non-US symbol from the upstream call and from the answer', async () => {
    // The endpoint is US-only, so the answer for MDA.TO is already known.
    const fetchImpl = respond(okBody);
    const res = await call({ symbols: 'QCOM,MDA.TO' }, fetchImpl);
    expect(requestedUrl(fetchImpl).searchParams.get('s')).toBe('QCOM.US');
    expect(Object.keys((res._body as { stats: object }).stats)).toEqual(['QCOM']);
  });

  it('spends no call at all when every symbol is non-US', async () => {
    const fetchImpl = respond(okBody);
    const res = await call({ symbols: 'MDA.TO,VOD.LSE' }, fetchImpl);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ stats: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads an absent symbol as "nothing for this symbol", not as a failure', async () => {
    // Two shapes, both verified against the live API and both meaning the same
    // thing. Asked for several symbols where some are uncovered, it returns a
    // map with the others simply missing; asked for one it does not carry at
    // all, it returns `"data": []`.
    const res = await call({ symbols: 'ZZZZQQ' }, respond({ meta: { count: 0 }, data: [] }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ stats: {} });
  });

  it('reports an unreadable body rather than an empty grid', async () => {
    const res = await call({ symbols: 'QCOM' }, respond({ error: 'nope' }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('reports a row that is not an object rather than dropping it as absent', async () => {
    const res = await call({ symbols: 'QCOM' }, respond({ data: { 'QCOM.US': 'nope' } }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('reports a plan problem as a plan problem', async () => {
    const res = await call({ symbols: 'QCOM' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('validates the symbols before spending an upstream call', async () => {
    const fetchImpl = respond(okBody);
    const res = await call({ symbols: 'not a ticker' }, fetchImpl);
    expect(res._status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const res = await call({ symbols: ['QCOM', 'AAPL'] }, respond(okBody));
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('repeated_param');
  });

  it('caches a success for fifteen minutes and a failure not at all', async () => {
    expect((await call({ symbols: 'QCOM' }, respond(okBody)))._headers['Cache-Control']).toContain(
      's-maxage=900',
    );
    expect((await call({ symbols: 'QCOM' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    const res = await call({ symbols: 'QCOM' }, respond(okBody));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(okBody))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
