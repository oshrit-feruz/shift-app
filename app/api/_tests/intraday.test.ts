import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, LOOKBACK_DAYS } from '../intraday.js';
import { makeRes } from '../_lib/failureContract.js';

/**
 * The route behind the chart's 1D tab. What matters: it returns exactly one
 * session out of a multi-day window, the feed's closing print never becomes a
 * bar, and a symbol with no intraday series is an answer rather than an error.
 */

const bar = (datetime: string, close: number, volume: number | null = 1000) => ({
  timestamp: 0,
  gmtoffset: 0,
  datetime,
  open: close,
  high: close,
  low: close,
  close,
  volume,
});

/** Two sessions plus the closing print the feed appends to each. */
const twoSessions = [
  bar('2026-08-31 13:30:00', 100),
  bar('2026-08-31 13:35:00', 101),
  bar('2026-08-31 20:00:00', 101.5, null),
  bar('2026-09-01 13:30:00', 102),
  bar('2026-09-01 13:35:00', 103),
  bar('2026-09-01 20:00:00', 103.5, null),
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

const requestedUrl = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls[0][0];

const barsOf = (res: { _body: unknown }) => (res._body as { bars: Array<{ d: string; c: number }> }).bars;

beforeEach(() => {
  vi.stubEnv('EODHD_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/intraday', () => {
  it('serves only the most recent session out of the window it asked for', async () => {
    // The route has no market calendar: it asks for several days and keeps the
    // last session present, which is today mid-session and Friday on a Sunday.
    const res = await call({ symbol: 'QCOM' }, respond(twoSessions));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ symbol: 'QCOM', interval: '5m', session: '2026-09-01' });
    expect(barsOf(res).map((b) => b.d)).toEqual(['2026-09-01T13:30:00Z', '2026-09-01T13:35:00Z']);
  });

  it('never draws the closing print as a five-minute bar', async () => {
    // Verified on the live feed: every session ends with a zero-width bar at
    // 20:00 UTC carrying no volume. Drawn, it is a flat minute nobody traded.
    expect(barsOf(await call({ symbol: 'QCOM' }, respond(twoSessions)))).toHaveLength(2);
  });

  it('asks for five-minute bars over a window wide enough to clear a holiday', async () => {
    const fetchImpl = respond(twoSessions);
    await call({ symbol: 'nvda' }, fetchImpl);
    const url = requestedUrl(fetchImpl);
    expect(url.pathname).toBe('/api/intraday/NVDA.US');
    expect(url.searchParams.get('interval')).toBe('5m');
    const from = Number(url.searchParams.get('from'));
    const to = Number(url.searchParams.get('to'));
    expect(to - from).toBeCloseTo(LOOKBACK_DAYS * 86_400, -2);
  });

  it('reads "no intraday series for this symbol" as an answer, not a failure', async () => {
    // Both shapes mean it: an empty array, and the 404 the provider answers
    // for a ticker it does not carry. Neither may read as "we could not find
    // out" — the whole route is built on that difference.
    const empty = await call({ symbol: 'MDA.TO' }, respond([]));
    expect(empty._status).toBe(200);
    expect(empty._body).toMatchObject({ session: null, bars: [] });

    const missing = await call({ symbol: 'ZZZZQQ' }, respond({ error: 'not found' }, 404));
    expect(missing._status).toBe(200);
    expect(missing._body).toMatchObject({ session: null, bars: [] });
  });

  it('reports an unreadable body rather than an empty session', async () => {
    const res = await call({ symbol: 'QCOM' }, respond({ error: 'nope' }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('refuses the session for a bar it cannot read', async () => {
    // A chart is read as a whole whatever its resolution: a line with a
    // silently dropped five minutes is price action that never happened.
    const res = await call(
      { symbol: 'QCOM' },
      respond([bar('2026-09-01 13:30:00', 102), bar('2026-09-01 13:35:00', 103, -5)]),
    );
    expect(res._status).toBe(502);
  });

  it('reports a plan problem as a plan problem', async () => {
    const res = await call({ symbol: 'QCOM' }, respond({}, 403));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('validates the ticker before spending an upstream call', async () => {
    const fetchImpl = respond(twoSessions);
    const res = await call({ symbol: 'not a ticker' }, fetchImpl);
    expect(res._status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches a success briefly, because this is the one series meant to move', async () => {
    expect((await call({ symbol: 'QCOM' }, respond(twoSessions)))._headers['Cache-Control']).toContain(
      's-maxage=120',
    );
    expect((await call({ symbol: 'QCOM' }, respond({}, 403)))._headers['Cache-Control']).toBeUndefined();
  });

  it('says so plainly when the server has no key', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    const res = await call({ symbol: 'QCOM' }, respond(twoSessions));
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('not_configured');
  });

  it('answers 405 to anything but GET', async () => {
    const res = makeRes();
    await createHandler(1_000, respond(twoSessions))({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(405);
  });
});
