import { describe, expect, it, vi } from 'vitest';
import { extractStats, fetchStatsFor, fetchStockStats, relativeVolume } from './stats';
import type { StockStats } from './types';

const qcom: StockStats = {
  marketCap: 174752550000,
  pe: 19.483429,
  forwardPE: 16.835,
  dividendYield: 0.0216,
  fiftyTwoWeekHigh: 259.92,
  fiftyTwoWeekLow: 121.99,
  volume: 8831907,
  averageVolume: 15642960,
};

const respond = (body: unknown, ok = true) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status: ok ? 200 : 502, json: async () => body }) as unknown as Response,
  );

describe('extractStats', () => {
  it('maps the route payload, keyed by upper-case ticker', () => {
    expect(extractStats({ stats: { qcom } })).toEqual({ QCOM: qcom });
  });

  it('reads an empty map as a real answer, not as a broken response', () => {
    // None of the symbols asked for are carried by the provider — the normal
    // answer for a list of non-US listings.
    expect(extractStats({ stats: {} })).toEqual({});
  });

  it('reads a body it does not recognise as null', () => {
    expect(extractStats(undefined)).toBeNull();
    expect(extractStats({ ticker: 'QCOM' })).toBeNull();
    expect(extractStats([qcom])).toBeNull();
    expect(extractStats({ stats: 'nope' })).toBeNull();
    expect(extractStats({ stats: { QCOM: 'nope' } })).toBeNull();
  });

  it('keeps a missing figure null rather than coercing it to zero', () => {
    expect(extractStats({ stats: { QCOM: { marketCap: 1 } } })).toEqual({
      QCOM: {
        marketCap: 1,
        pe: null,
        forwardPE: null,
        dividendYield: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        volume: null,
        averageVolume: null,
      },
    });
  });

  it('refuses the two halves of the RVol ratio when they cannot form one', () => {
    // The last point before these become a picture: a negative numerator would
    // print a signed multiple beside a real price, and a zero denominator
    // divides to infinity. A zero volume is a real answer and stays.
    const rvol = (v: unknown, a: unknown) =>
      extractStats({ stats: { QCOM: { volume: v, averageVolume: a } } })!.QCOM;
    expect(rvol(-1, 100)).toMatchObject({ volume: null, averageVolume: 100 });
    expect(rvol(0, 100)).toMatchObject({ volume: 0, averageVolume: 100 });
    expect(rvol(100, 0)).toMatchObject({ volume: 100, averageVolume: null });
    expect(rvol(100, -5)).toMatchObject({ averageVolume: null });
  });
});

describe('fetchStatsFor', () => {
  it('returns the map for the tickers the provider carries', async () => {
    const result = await fetchStatsFor(
      ['QCOM'],
      respond({ stats: { QCOM: qcom } }) as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: 'ok', data: { QCOM: qcom } });
  });

  it('asks for one sorted, de-duplicated list so two screens share one entry', async () => {
    const fetchImpl = respond({ stats: {} });
    await fetchStatsFor([' nvda ', 'QCOM', 'nvda'], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/stats?symbols=NVDA%2CQCOM');
  });

  it('costs nothing for an empty list', async () => {
    const fetchImpl = respond({ stats: {} });
    expect(await fetchStatsFor([], fetchImpl as unknown as typeof fetch)).toEqual({ status: 'ok', data: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a failure as unavailable, never as an absence', async () => {
    // The distinction the screens depend on: dashes because the provider has
    // nothing, versus dashes because we could not ask.
    const result = await fetchStatsFor(
      ['QCOM'],
      respond({ error: 'upstream_forbidden' }, false) as unknown as typeof fetch,
    );
    expect(result.status).toBe('unavailable');
  });

  it('never throws when the transport does', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await fetchStatsFor(['QCOM'], boom)).status).toBe('unavailable');
  });
});

describe('fetchStockStats', () => {
  it('returns the one ticker asked for', async () => {
    const result = await fetchStockStats(
      ' qcom ',
      respond({ stats: { QCOM: qcom } }) as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: 'ok', data: qcom });
  });

  it('returns ok(null) for a ticker the provider does not carry', async () => {
    const result = await fetchStockStats('MDA.TO', respond({ stats: {} }) as unknown as typeof fetch);
    expect(result).toEqual({ status: 'ok', data: null });
  });

  it('passes a failure through rather than reading it as an absence', async () => {
    const result = await fetchStockStats('QCOM', respond({}, false) as unknown as typeof fetch);
    expect(result.status).toBe('unavailable');
  });

  it('costs nothing for an empty ticker', async () => {
    const fetchImpl = respond({ stats: {} });
    expect(await fetchStockStats('  ', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'ok',
      data: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('relativeVolume', () => {
  it('divides the session so far by a normal day', () => {
    expect(relativeVolume(qcom)).toBeCloseTo(8831907 / 15642960, 6);
  });

  it('is null when either half is missing', () => {
    expect(relativeVolume(null)).toBeNull();
    expect(relativeVolume(undefined)).toBeNull();
    expect(relativeVolume({ ...qcom, volume: null })).toBeNull();
    expect(relativeVolume({ ...qcom, averageVolume: null })).toBeNull();
  });

  it('is null rather than infinite when there is no average to be relative to', () => {
    // A newly listed name has no history to average, and the provider sends a
    // zero for it. Dividing by that would render "∞×" beside a real price.
    expect(relativeVolume({ ...qcom, averageVolume: 0 })).toBeNull();
  });

  it('keeps a genuinely quiet session as a real zero', () => {
    expect(relativeVolume({ ...qcom, volume: 0 })).toBe(0);
  });
});
