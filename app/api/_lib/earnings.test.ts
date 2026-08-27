import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapEarning, parseIsoDate, toNumber, validateRange, MAX_RANGE_DAYS } from './earnings.js';
import { createHandler } from '../earnings.js';

/** Shaped like EODHD's calendar rows. */
const ROW = {
  code: 'NVDA.US',
  report_date: '2026-02-25',
  date: '2026-01-25',
  before_after_market: 'AfterMarket',
  currency: 'USD',
  actual: 1.24,
  estimate: 1.18,
  difference: 0.06,
  percent: 5.08,
};

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

describe('mapEarning', () => {
  it('maps a full row', () => {
    expect(mapEarning(ROW)).toEqual({
      ticker: 'NVDA',
      reportDate: '2026-02-25',
      periodEnd: '2026-01-25',
      timing: 'AMC',
      actual: 1.24,
      estimate: 1.18,
      surprisePct: 5.08,
    });
  });

  it('keeps a not-yet-reported quarter, with a null actual', () => {
    // Scheduled but unreported is the normal state for a future date; it is
    // not a broken row and must not be dropped.
    const m = mapEarning({ ...ROW, actual: null, percent: null, report_date: '2026-11-18' });
    expect(m?.reportDate).toBe('2026-11-18');
    expect(m?.actual).toBeNull();
    expect(m?.estimate).toBe(1.18);
  });

  it('maps both spellings of the timing field, and nulls an unknown one', () => {
    expect(mapEarning({ ...ROW, before_after_market: 'BeforeMarket' })?.timing).toBe('BMO');
    expect(mapEarning({ ...ROW, before_after_market: 'AMC' })?.timing).toBe('AMC');
    // Guessing a side would put a real number next to an invented fact.
    for (const v of ['during', '', null, 7]) {
      expect(mapEarning({ ...ROW, before_after_market: v })?.timing, String(v)).toBeNull();
    }
  });

  it('drops a row with no usable ticker or no real report date', () => {
    for (const bad of [
      { ...ROW, code: '' },
      { ...ROW, code: 'A B.US' },
      { ...ROW, code: null },
      { ...ROW, report_date: '2026-02-31' },
      { ...ROW, report_date: null },
      null,
      [ROW],
      'nope',
    ]) {
      expect(mapEarning(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('strips the exchange suffix', () => {
    expect(mapEarning({ ...ROW, code: 'brk-b.us' })?.ticker).toBe('BRK-B');
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

function makeRes() {
  const r: {
    _status: number; _body: unknown; _headers: Record<string, string>;
    status(c: number): typeof r; json(b: unknown): void; setHeader(k: string, v: string): void;
  } = {
    _status: 0, _body: null, _headers: {},
    status(c) { r._status = c; return r; },
    json(b) { r._body = b; },
    setHeader(k, v) { r._headers[k] = v; },
  };
  return r;
}
const handler = createHandler(5000);
const GOOD = { from: '2026-08-24', to: '2026-08-30' };

describe('earnings handler', () => {
  beforeEach(() => { process.env.EODHD_API_KEY = 'test-key'; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns mapped rows, sorted by report date, and never leaks the key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ earnings: [{ ...ROW, report_date: '2026-08-28' }, { ...ROW, code: 'AAPL.US', report_date: '2026-08-25' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(200);
    const body = res._body as { earnings: Array<{ ticker: string }> };
    expect(body.earnings.map((e) => e.ticker)).toEqual(['AAPL', 'NVDA']);
    expect(JSON.stringify(res._body)).not.toContain('test-key');
  });

  it('accepts a bare array as well as the wrapped shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([ROW]), { status: 200 })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(200);
    expect((res._body as { earnings: unknown[] }).earnings).toHaveLength(1);
  });

  it('treats a window with no reports as a legitimate empty result, not an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ earnings: [] }), { status: 200 })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(200);
    expect((res._body as { earnings: unknown[] }).earnings).toEqual([]);
  });

  // The calendar sits in specific EODHD plans, so a key without it is
  // refused indefinitely rather than transiently. Saying only "the provider
  // returned an error" had someone retrying a subscription problem.
  it.each([
    [401, 'upstream_unauthorized'],
    [403, 'upstream_forbidden'],
    [429, 'upstream_rate_limited'],
    [500, 'upstream_error'],
  ])('reports upstream %i as %s, uncached', async (status, error) => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status })) as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error, upstreamStatus: status });
    expect(res._headers['Cache-Control']).toBeUndefined();
  });

  it('reports a provider that never answered as a timeout, with the budget', async () => {
    const shortHandler = createHandler(20);
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: URL, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const res = makeRes();
    await shortHandler({ method: 'GET', query: GOOD }, res);
    expect(res._body).toMatchObject({ error: 'upstream_timeout', timeoutMs: 20 });
  });

  it('scopes to one ticker when asked, and to the whole market when not', async () => {
    let seen = '';
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      seen = String(url);
      return Promise.resolve(new Response(JSON.stringify({ earnings: [] }), { status: 200 }));
    }) as unknown as typeof fetch;

    await handler({ method: 'GET', query: { ...GOOD, ticker: 'nvda' } }, makeRes());
    expect(seen).toContain('symbols=NVDA.US');

    await handler({ method: 'GET', query: GOOD }, makeRes());
    expect(seen).not.toContain('symbols=');
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
    // EODHD's calendar has no pagination and returns every row in the range;
    // their docs put a year near 120,000, so a market week runs to thousands.
    // A bound is right for a mobile client — a silent one is not, because the
    // caller would treat a partial week as the whole week.
    const many = Array.from({ length: 450 }, (_, i) => ({
      ...ROW, code: `T${i}.US`, report_date: '2026-08-25',
    }));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ earnings: many }), { status: 200 }),
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
      new Response(JSON.stringify({ earnings: [ROW] }), { status: 200 }),
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
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ earnings: [] }), { status: 200 })) as unknown as typeof fetch;
    const okRes = makeRes();
    await handler({ method: 'GET', query: GOOD }, okRes);
    expect(okRes._headers['Cache-Control']).toBe('public, max-age=0, s-maxage=900');

    for (const f of [
      () => vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
      () => vi.fn().mockRejectedValue(new Error('boom')),
      () => vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
      () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 })),
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
    delete process.env.EODHD_API_KEY;
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = makeRes();
    await handler({ method: 'GET', query: GOOD }, res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
    expect(spy).not.toHaveBeenCalled();
  });
});
