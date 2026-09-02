import { describe, expect, it, vi } from 'vitest';
import { extractStats, fetchStockStats } from './stats';

const stats = {
  marketCap: 174752550000,
  pe: 19.483429,
  forwardPE: 16.835,
  dividendYield: 0.0216,
  fiftyTwoWeekHigh: 259.92,
  fiftyTwoWeekLow: 121.99,
};

const respond = (body: unknown, ok = true) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status: ok ? 200 : 502, json: async () => body }) as unknown as Response,
  );

describe('extractStats', () => {
  it('maps the route payload', () => {
    expect(extractStats({ ticker: 'QCOM', stats })).toEqual(stats);
  });

  it('reads an explicit null as "no extended quote for this symbol"', () => {
    // A real answer — every non-US listing — and distinct from a body we
    // could not read, which is why the two return different things.
    expect(extractStats({ ticker: 'MDA.TO', stats: null })).toBeNull();
  });

  it('reads a body it does not recognise as undefined, not as an absence', () => {
    expect(extractStats(undefined)).toBeUndefined();
    expect(extractStats({ ticker: 'QCOM' })).toBeUndefined();
    expect(extractStats([stats])).toBeUndefined();
    expect(extractStats({ stats: 'nope' })).toBeUndefined();
  });

  it('keeps a missing figure null rather than coercing it to zero', () => {
    expect(extractStats({ stats: { marketCap: 1 } })).toEqual({
      marketCap: 1,
      pe: null,
      forwardPE: null,
      dividendYield: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
    });
  });
});

describe('fetchStockStats', () => {
  it('returns the statistics for a ticker the provider carries', async () => {
    const result = await fetchStockStats('QCOM', respond({ stats }) as unknown as typeof fetch);
    expect(result).toEqual({ status: 'ok', data: stats });
  });

  it('asks the route for the ticker, uppercased', async () => {
    const fetchImpl = respond({ stats });
    await fetchStockStats(' qcom ', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/stats?symbol=QCOM');
  });

  it('reports ok(null) for a symbol with no extended quote', async () => {
    const result = await fetchStockStats('MDA.TO', respond({ stats: null }) as unknown as typeof fetch);
    expect(result).toEqual({ status: 'ok', data: null });
  });

  it('reports a failure as unavailable, never as an absence', async () => {
    // The distinction the grid depends on: dashes because the provider has
    // nothing, versus dashes because we could not ask.
    const result = await fetchStockStats(
      'QCOM',
      respond({ error: 'upstream_forbidden' }, false) as unknown as typeof fetch,
    );
    expect(result.status).toBe('unavailable');
  });

  it('reports an unreadable body as unavailable', async () => {
    const result = await fetchStockStats('QCOM', respond({ nope: true }) as unknown as typeof fetch);
    expect(result.status).toBe('unavailable');
  });

  it('never throws when the transport does', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await fetchStockStats('QCOM', boom)).status).toBe('unavailable');
  });

  it('costs nothing for an empty ticker', async () => {
    const fetchImpl = respond({ stats });
    expect(await fetchStockStats('  ', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'ok',
      data: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
