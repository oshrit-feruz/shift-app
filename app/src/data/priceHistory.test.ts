import { describe, expect, it, vi } from 'vitest';
import {
  COVERED_TICKERS,
  MAX_SERIES_AGE_DAYS,
  extractBars,
  fetchDailySeries,
  seriesAgeDays,
  seriesUrl,
} from './priceHistory';
import { demoService } from './demoAdapter';

const BAR = { d: '2026-08-27', o: 1, h: 2, l: 0.5, c: 1.5, v: 100 };
const NOW = new Date('2026-08-28T12:00:00Z');

/** A published file body, fresh as of NOW unless told otherwise. */
const file = (bars: unknown[] = [BAR], asOf = '2026-08-27') => ({
  ticker: 'NVDA',
  as_of: asOf,
  source: 'alphavantage:TIME_SERIES_DAILY',
  bars,
});

const respond = (body: unknown, status = 200) =>
  vi.fn(
    async () =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response,
  );

describe('seriesUrl', () => {
  it('normalises the ticker so one casing does not miss a published file', () => {
    expect(seriesUrl(' nvda ')).toBe('/data/series/NVDA.json');
  });
});

describe('extractBars', () => {
  it('maps a published file into bars', () => {
    expect(extractBars(file())).toEqual([
      { date: '2026-08-27', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
    ]);
  });

  it('sorts oldest first, whatever order the file carried', () => {
    const out = extractBars(
      file([
        { ...BAR, d: '2026-08-27' },
        { ...BAR, d: '2026-08-25' },
      ]),
    );
    expect(out?.map((b) => b.date)).toEqual(['2026-08-25', '2026-08-27']);
  });

  // A chart is read as a whole: silently dropping the rows that failed would
  // draw a continuous picture of price action with sessions missing from it.
  it('rejects the whole file when any row is unreadable, rather than dropping it', () => {
    expect(extractBars(file([BAR, { ...BAR, c: 'oops' }]))).toBeNull();
    expect(extractBars(file([BAR, { ...BAR, d: 'not-a-date' }]))).toBeNull();
    // high below low is a row whose fields do not mean what they are labelled.
    expect(extractBars(file([{ ...BAR, h: 0.1, l: 9 }]))).toBeNull();
  });

  it('treats a file with no sessions as broken, not as a stock that never traded', () => {
    expect(extractBars(file([]))).toBeNull();
  });

  it('refuses a body that is not a published file', () => {
    expect(extractBars(null)).toBeNull();
    expect(extractBars([BAR])).toBeNull();
    expect(extractBars({ bars: 'nope' })).toBeNull();
  });
});

describe('seriesAgeDays', () => {
  it('counts whole UTC days', () => {
    expect(seriesAgeDays('2026-08-27', NOW)).toBe(1);
    expect(seriesAgeDays('2026-08-28', NOW)).toBe(0);
  });

  // Date.UTC rolls an impossible date forward, which would yield a negative
  // age and sail straight past the staleness gate.
  it('rejects a date that is not a real day', () => {
    expect(seriesAgeDays('2026-02-31', NOW)).toBeNull();
    expect(seriesAgeDays('2026-13-01', NOW)).toBeNull();
  });

  it('rejects a missing or malformed stamp', () => {
    expect(seriesAgeDays(undefined, NOW)).toBeNull();
    expect(seriesAgeDays('27/08/2026', NOW)).toBeNull();
  });
});

describe('fetchDailySeries', () => {
  it('returns the bars for a healthy, fresh file', async () => {
    const res = await fetchDailySeries('NVDA', respond(file()), NOW);
    expect(res.status).toBe('ok');
    expect(res.status === 'ok' && res.data?.[0].close).toBe(1.5);
  });

  // The mirror publishes a file per covered ticker and nothing for the rest.
  // "We have no history for this symbol" is a fact, not a fault: no retry
  // prompt, and the chart says so in a sentence.
  it('reports a missing file as ok(null), not as unavailable', async () => {
    const res = await fetchDailySeries('MDA', respond({}, 404), NOW);
    expect(res).toEqual({ status: 'ok', data: null });
  });

  it('is unavailable on a server error, a bad shape, or a throwing fetch', async () => {
    expect((await fetchDailySeries('NVDA', respond({}, 500), NOW)).status).toBe('unavailable');
    expect((await fetchDailySeries('NVDA', respond({ nope: 1 }), NOW)).status).toBe('unavailable');
    const boom = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await fetchDailySeries('NVDA', boom, NOW)).status).toBe('unavailable');
  });

  it('refuses a series that has stopped being updated, and says how stale it is', async () => {
    const stale = new Date(NOW.getTime() + (MAX_SERIES_AGE_DAYS + 2) * 86_400_000);
    const res = await fetchDailySeries('NVDA', respond(file()), stale);
    expect(res.status).toBe('unavailable');
    expect(res.status === 'unavailable' && res.reason?.he).toContain('10');
  });

  // The gate has to be loose enough for a long weekend: `as_of` is the last
  // trading session, not the day the job ran, so a correct file is routinely
  // several days old with nothing wrong.
  it('still serves a series across a holiday weekend', async () => {
    const tuesdayAfter = new Date('2026-09-01T12:00:00Z');
    const res = await fetchDailySeries('NVDA', respond(file([BAR], '2026-08-28')), tuesdayAfter);
    expect(res.status).toBe('ok');
  });

  it('refuses a series dated beyond clock skew into the future', async () => {
    const res = await fetchDailySeries('NVDA', respond(file([BAR], '2026-09-10')), NOW);
    expect(res.status).toBe('unavailable');
  });

  it('checks the shape before the age, so a broken file is not reported as stale', async () => {
    const ancient = new Date('2030-01-01T00:00:00Z');
    const res = await fetchDailySeries('NVDA', respond(file([{ ...BAR, c: null }])), ancient);
    expect(res.status === 'unavailable' && res.reason).toBeUndefined();
  });
});

describe('the covered-ticker list', () => {
  // The publisher (scripts/mirror-prices.mjs) and the app read the same file,
  // so the one way they can still disagree is the list falling behind the
  // symbol table — a ticker added to the app would silently never get a chart.
  it('covers exactly the symbols the app can open a stock page for', async () => {
    const syms = await demoService.symbols();
    expect(syms.status).toBe('ok');
    const tickers = syms.status === 'ok' ? syms.data.map((x) => x.ticker) : [];
    expect([...COVERED_TICKERS].sort()).toEqual([...tickers].sort());
  });
});
