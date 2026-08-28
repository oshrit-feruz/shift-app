import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIsoDate, toNumber, validateRange, MAX_RANGE_DAYS } from './earnings.js';
import { createHandler, horizonFor } from '../earnings.js';
import { itMeetsTheFailureContract, makeRes } from './failureContract.js';

/** Shaped like Alpha Vantage's EARNINGS_CALENDAR CSV — the market-wide feed. */
const CSV_HEADER = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay';
const csvRow = (symbol: string, reportDate: string) =>
  `${symbol},"${symbol} INCORPORATED",${reportDate},2026-07-31,2.35,USD,post-market`;
const calendarCsv = (...rows: string[]) => [CSV_HEADER, ...rows].join('\n');

/** Shaped like EARNINGS' quarterlyEarnings — one company's reported quarters. */
const history = (...rows: Array<{ reportedDate: string; fiscalDateEnding?: string }>) => ({
  symbol: 'NVDA',
  quarterlyEarnings: rows.map((r) => ({
    fiscalDateEnding: r.fiscalDateEnding ?? '2026-07-31',
    reportedDate: r.reportedDate,
    reportedEPS: '1.24',
    estimatedEPS: '1.18',
    surprise: '0.06',
    surprisePercentage: '5.08',
    reportTime: 'post-market',
  })),
});

describe('parseIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(parseIsoDate('2026-02-25')).toBe('2026-02-25');
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29');
  });
  it('rejects impossible dates rather than rolling them forward', () => {
    // Date.UTC would turn 2026-02-31 into 2 March and it would read as real.
    for (const v of ['2026-02-31', '2026-13-45', '2026-00-10', '2026-02-29', '25/02/2026', 'soon', '', null, 42]) {
      expect(parseIsoDate(v), String(v)).toBeNull();
    }
  });
});

describe('toNumber', () => {
  it('accepts numbers and numeric strings, rejects everything else as null — never 0', () => {
    expect(toNumber(1.24)).toBe(1.24);
    expect(toNumber('-0.5')).toBe(-0.5);
    expect(toNumber(0)).toBe(0);
    for (const v of [null, undefined, '', ' ', 'n/a', {}, [], NaN, Infinity, true]) {
      expect(toNumber(v), String(v)).toBeNull();
    }
  });
});

describe('validateRange', () => {
  it('accepts a normal window', () => {
    expect(validateRange('2026-08-24', '2026-08-30')).toBeNull();
  });
  it('rejects a missing date, an inverted range and an over-wide one', () => {
    expect(validateRange(null, '2026-08-30')).toBe('bad_date');
    expect(validateRange('2026-08-30', '2026-08-24')).toBe('bad_range');
    // EODHD's own docs warn that very wide ranges 500 — refuse here instead
    // of spending a request to find out.
    expect(validateRange('2016-01-01', '2026-01-01')).toBe('bad_range');
  });
  it('accepts exactly the documented maximum', () => {
    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(from.getTime() + MAX_RANGE_DAYS * 86_400_000);
    expect(validateRange('2026-01-01', to.toISOString().slice(0, 10))).toBeNull();
  });
});

const handler = createHandler(5000);
const GOOD = { from: '2026-08-24', to: '2026-08-30' };

describe('earnings handler', () => {
  beforeEach(() => { process.env.ALPHAVANTAGE_API_KEY = 'test-key'; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns mapped rows, sorted by report date, and never leaks the key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(calendarCsv(csvRow('NVDA', '2026-08-28'), csvRow('AAPL', '2026-08-25')), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(200);
    const body = res._body as { earnings: Array<{ ticker: string }> };
    expect(body.earnings.map((e) => e.ticker)).toEqual(['AAPL', 'NVDA']);
    expect(JSON.stringify(res._body)).not.toContain('test-key');
  });

  // Upstream returns a whole horizon and a whole company history; the caller
  // asked about a window, so anything outside it is not an answer to the
  // question and must not be returned as one.
  it('keeps only the rows inside the requested window', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        calendarCsv(csvRow('IN', '2026-08-25'), csvRow('BEFORE', '2026-08-23'), csvRow('AFTER', '2026-08-31')),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect((res._body as { earnings: Array<{ ticker: string }> }).earnings.map((e) => e.ticker)).toEqual(['IN']);
  });

  // Company names in this feed carry commas; splitting on "," alone would
  // shift every later column and put a name where a date belongs.
  it('reads a quoted company name containing a comma without shifting columns', async () => {
    const row = 'BRK-B,"BERKSHIRE HATHAWAY, INC",2026-08-26,2026-06-30,4.51,USD,pre-market';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(calendarCsv(row), { status: 200 })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect((res._body as { earnings: Array<Record<string, unknown>> }).earnings[0]).toMatchObject({
      ticker: 'BRK-B', reportDate: '2026-08-26', timing: 'BMO', estimate: 4.51,
    });
  });

  it("returns a ticker's reported quarters, with the figures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(history({ reportedDate: '2026-08-27' })), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { ...GOOD, ticker: 'nvda' } }, res);
    expect(res._status).toBe(200);
    expect((res._body as { earnings: Array<Record<string, unknown>> }).earnings[0]).toMatchObject({
      ticker: 'NVDA', reportDate: '2026-08-27', actual: 1.24, estimate: 1.18, surprisePct: 5.08, timing: 'AMC',
    });
  });

  it('treats a window with no reports as a legitimate empty result, not an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(calendarCsv(), { status: 200 })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(200);
    expect((res._body as { earnings: unknown[] }).earnings).toEqual([]);
  });

  // The provider reports a spent quota with HTTP 200 and a JSON note, on the
  // CSV route too. Read as a body, that is an empty week — so the app would
  // answer "nobody reports this week" from a response holding no data at all.
  it.each([
    ['a daily quota notice', { Information: 'You have reached the 25 requests per day limit.' }, 'upstream_rate_limited'],
    ['a throttle note', { Note: 'Thank you for using Alpha Vantage! Our standard API rate limit is...' }, 'upstream_rate_limited'],
    ['a rejected request', { 'Error Message': 'Invalid API call.' }, 'upstream_error'],
  ])('reports %s rather than an empty week', async (_label, body, error) => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  // The same failure contract as /api/news: the calendar sits in specific
  // EODHD plans, so a key without it is refused indefinitely rather than
  // transiently, and saying only "the provider returned an error" had
  // someone retrying a subscription problem.
  itMeetsTheFailureContract(handler, createHandler, GOOD);

  // The mirror of the calendar rule: quarters that all failed to map are a
  // shape we did not understand, not a company that has never reported.
  it('refuses to read an all-unusable history as a company with no reports', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ symbol: 'NVDA', quarterlyEarnings: [{ reportedDate: 'sometime' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: { ...GOOD, ticker: 'NVDA' } }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'bad_response' });
  });

  // A fixed 3-month horizon looked harmless while the app only asked for a
  // week, but this route accepts windows up to MAX_RANGE_DAYS — and a request
  // ending five months out came back 200 with an empty list, saying "nobody
  // reports then" about a period never fetched.
  it('asks for a horizon that reaches the requested end date', async () => {
    let seen = '';
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      seen = String(url);
      return Promise.resolve(new Response(calendarCsv(), { status: 200 }));
    }) as unknown as typeof fetch;

    const today = new Date();
    const iso = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    for (const [days, horizon] of [[7, '3month'], [120, '6month'], [300, '12month']] as const) {
      await handler({ method: 'GET', query: { from: iso(0), to: iso(days) } }, makeRes());
      expect(seen, `${days} days`).toContain(`horizon=${horizon}`);
    }
  });

  it('refuses a window beyond every horizon rather than answering it empty', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const today = new Date();
    const iso = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    const res = makeRes();
    await handler({ method: 'GET', query: { from: iso(0), to: iso(400) } }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'invalid_range' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports a premium-only endpoint as a plan problem, not a spent quota', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Information: 'This is a premium endpoint. You may subscribe to any of the premium plans.' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'upstream_forbidden' });
  });

  it('scopes to one ticker when asked, and to the whole market when not', async () => {
    let seen = '';
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      seen = String(url);
      return Promise.resolve(
        String(url).includes('EARNINGS_CALENDAR')
          ? new Response(calendarCsv(), { status: 200 })
          : new Response(JSON.stringify(history()), { status: 200 }),
      );
    }) as unknown as typeof fetch;

    await handler({ method: 'GET', query: { ...GOOD, ticker: 'nvda' } }, makeRes());
    expect(seen).toContain('function=EARNINGS&');
    expect(seen).toContain('symbol=NVDA');

    await handler({ method: 'GET', query: GOOD }, makeRes());
    expect(seen).toContain('function=EARNINGS_CALENDAR');
    expect(seen).not.toContain('symbol=');
  });

  it.each([
    ['missing dates', {}],
    ['malformed from', { from: 'soon', to: '2026-08-30' }],
    ['impossible from', { from: '2026-02-31', to: '2026-08-30' }],
    ['inverted range', { from: '2026-08-30', to: '2026-08-24' }],
    ['over-wide range', { from: '2016-01-01', to: '2026-01-01' }],
    ['malformed ticker', { ...GOOD, ticker: 'NV DA' }],
  ])('rejects %s with a 400 and no upstream call', async (_label, query) => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query }, res);
    expect(res._status).toBe(400);
    // A bad request must cost nothing upstream — the same quota guard the
    // news endpoint carries.
    expect(spy).not.toHaveBeenCalled();
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('reports truncation instead of silently dropping the tail of a week', async () => {
    // The feed has no pagination and returns its whole horizon at once. A
    // bound is right for a mobile client — a silent one is not, because the
    // caller would treat a partial week as the whole week.
    const many = Array.from({ length: 450 }, (_, i) => csvRow(`T${i}`, '2026-08-25'));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(calendarCsv(...many), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    const body = res._body as { earnings: unknown[]; truncated: boolean; totalAvailable: number };
    expect(body.earnings).toHaveLength(400);
    expect(body.truncated).toBe(true);
    expect(body.totalAvailable).toBe(450);
  });

  it('reports truncated:false when everything fit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(calendarCsv(csvRow('NVDA', '2026-08-25')), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    const body = res._body as { truncated: boolean; totalAvailable: number };
    expect(body.truncated).toBe(false);
    expect(body.totalAvailable).toBe(1);
  });

  it.each([
    ['ticker', { ...GOOD, ticker: ['NVDA', 'BAD TICKER'] }],
    ['from', { ...GOOD, from: ['2026-08-24', 'garbage'] }],
    ['to', { ...GOOD, to: ['2026-08-30', 'garbage'] }],
  ])('rejects a repeated %s parameter without an upstream call', async (_label, query) => {
    // Taking the first value would let a second, malformed one ride along —
    // answering a question nobody asked, at the cost of a credit.
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: query as Record<string, string | string[]> }, res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: 'repeated_param' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-GET without an upstream call', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'POST', query: GOOD }, res);
    expect(res._status).toBe(405);
    expect(spy).not.toHaveBeenCalled();
  });

  it('caches a success and never a failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(calendarCsv(), { status: 200 })) as unknown as typeof fetch;
    const okRes = makeRes();
    await handler({ method: 'GET', query: GOOD }, okRes);
    // Six hours: the free key allows only tens of requests a day, so a short
    // TTL would spend the quota on freshness nobody can perceive.
    expect(okRes._headers['Cache-Control']).toBe('public, max-age=0, s-maxage=21600');

    for (const f of [
      () => vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
      () => vi.fn().mockRejectedValue(new Error('boom')),
      () => vi.fn().mockResolvedValue(new Response('', { status: 200 })),
      () => vi.fn().mockResolvedValue(new Response('nothing,like,a,calendar', { status: 200 })),
    ]) {
      globalThis.fetch = f() as unknown as typeof fetch;
      const errRes = makeRes();
      await handler({ method: 'GET', query: GOOD }, errRes);
      expect(errRes._status).toBeGreaterThanOrEqual(500);
      // A transient provider hiccup must not be frozen and served for 15 min.
      expect(errRes._headers['Cache-Control']).toBeUndefined();
    }
  });

  it('reports misconfiguration without calling upstream', async () => {
    delete process.env.ALPHAVANTAGE_API_KEY;
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('horizonFor', () => {
  const NOW = new Date('2026-08-28T09:00:00Z');

  it.each([
    ['2026-08-28', '3month'],
    ['2026-11-26', '3month'],
    ['2026-11-27', '6month'],
    ['2027-02-24', '6month'],
    ['2027-08-28', '12month'],
  ])('covers %s with %s', (to, horizon) => {
    expect(horizonFor(to, NOW)).toBe(horizon);
  });

  it('has no horizon beyond twelve months', () => {
    expect(horizonFor('2027-10-01', NOW)).toBeNull();
  });

  // The feed only carries reports that have not happened yet, so an empty
  // answer for a past window is a real answer, not a coverage gap.
  it('needs no coverage for a window already past', () => {
    expect(horizonFor('2026-01-01', NOW)).toBe('3month');
  });
});
