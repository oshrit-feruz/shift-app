import { describe, expect, it, vi } from 'vitest';
import { extractIntradayBars, fetchIntradaySeries } from './intraday';

const row = (d: string, c: number) => ({ d, o: c, h: c, l: c, c, v: 100 });
const body = {
  symbol: 'QCOM',
  interval: '5m',
  session: '2026-09-01',
  source: 'eodhd:intraday',
  bars: [row('2026-09-01T13:30:00Z', 163.27), row('2026-09-01T13:35:00Z', 162.96)],
};

const respond = (payload: unknown, ok = true) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok, status: ok ? 200 : 502, json: async () => payload }) as unknown as Response,
  );

describe('extractIntradayBars', () => {
  it('maps the session, oldest first', () => {
    const bars = extractIntradayBars({ ...body, bars: [...body.bars].reverse() })!;
    expect(bars.map((b) => b.date)).toEqual(['2026-09-01T13:30:00Z', '2026-09-01T13:35:00Z']);
    expect(bars[0]).toEqual({
      date: '2026-09-01T13:30:00Z',
      open: 163.27,
      high: 163.27,
      low: 163.27,
      close: 163.27,
      volume: 100,
    });
  });

  it('reads an empty session as a real answer about the symbol', () => {
    expect(extractIntradayBars({ ...body, bars: [] })).toEqual([]);
  });

  it('refuses a stamp that is a date rather than a moment', () => {
    // The daily route's shape arriving here would silently draw one session's
    // closes as if they were a day.
    expect(extractIntradayBars({ ...body, bars: [{ ...row('2026-09-01', 1) }] })).toBeNull();
  });

  it('refuses a stamp that is shaped like a moment but is not one', () => {
    // Date rolls "2026-02-31" forward into March, so the shape test alone
    // would draw a bar under a timestamp nobody meant.
    expect(extractIntradayBars({ ...body, bars: [row('2026-02-31T13:30:00Z', 1)] })).toBeNull();
    expect(extractIntradayBars({ ...body, bars: [row('2026-09-01T25:30:00Z', 1)] })).toBeNull();
  });

  it('refuses a bar that describes five minutes that could not have happened', () => {
    const bar = { d: '2026-09-01T13:30:00Z', o: 10, h: 12, l: 9, c: 11, v: 100 };
    expect(extractIntradayBars({ ...body, bars: [{ ...bar, o: 100 }] })).toBeNull(); // open above the high
    expect(extractIntradayBars({ ...body, bars: [{ ...bar, c: 1 }] })).toBeNull(); // close below the low
    expect(extractIntradayBars({ ...body, bars: [{ ...bar, l: 0 }] })).toBeNull();
    expect(extractIntradayBars({ ...body, bars: [{ ...bar, v: -1 }] })).toBeNull();
    // A genuinely quiet five minutes is a real zero and stays one.
    expect(extractIntradayBars({ ...body, bars: [{ ...bar, v: 0 }] })).toHaveLength(1);
  });

  it('refuses the whole session for one unreadable bar', () => {
    expect(extractIntradayBars({ ...body, bars: [body.bars[0], { d: '2026-09-01T13:35:00Z' }] })).toBeNull();
    expect(extractIntradayBars({ ...body, bars: [{ ...body.bars[0], h: 1, l: 2 }] })).toBeNull();
  });

  it('reads a body it does not recognise as null', () => {
    expect(extractIntradayBars(undefined)).toBeNull();
    expect(extractIntradayBars([])).toBeNull();
    expect(extractIntradayBars({ symbol: 'QCOM' })).toBeNull();
  });
});

describe('fetchIntradaySeries', () => {
  it('asks the route for the ticker', async () => {
    const fetchImpl = respond(body);
    await fetchIntradaySeries(' qcom ', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/intraday?symbol=QCOM');
  });

  it('returns the session', async () => {
    const result = await fetchIntradaySeries('QCOM', respond(body) as unknown as typeof fetch);
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.data).toHaveLength(2);
  });

  it('returns ok(null) for a symbol the provider carries no intraday series for', async () => {
    // A real answer about the symbol, distinct from a failure — the chart says
    // "no series" rather than "unavailable".
    const result = await fetchIntradaySeries(
      'MDA.TO',
      respond({ ...body, bars: [] }) as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: 'ok', data: null });
  });

  it('reports a failure as unavailable, never as an absent series', async () => {
    const result = await fetchIntradaySeries(
      'QCOM',
      respond({ error: 'upstream_forbidden' }, false) as unknown as typeof fetch,
    );
    expect(result.status).toBe('unavailable');
  });

  it('never throws when the transport does', async () => {
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect((await fetchIntradaySeries('QCOM', boom)).status).toBe('unavailable');
  });

  it('costs nothing for an empty ticker', async () => {
    const fetchImpl = respond(body);
    expect(await fetchIntradaySeries('  ', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'ok',
      data: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
