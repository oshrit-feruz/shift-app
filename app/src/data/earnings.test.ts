import { describe, it, expect } from 'vitest';
import {
  EARNINGS_URL, HISTORY_QUARTERS, fetchTickerEarnings, fetchWeekEarnings, isoDay, mapRow, weekWindow,
} from './earnings';

const ROW = {
  ticker: 'NVDA', reportDate: '2026-02-25', periodEnd: '2026-01-25',
  timing: 'AMC', actual: 1.24, estimate: 1.18, surprisePct: 5.08,
};
const res = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('weekWindow', () => {
  it('anchors to Monday–Sunday of the containing week, in UTC', () => {
    // 2026-08-27 is a Thursday; its week runs Mon 24 → Sun 30.
    expect(weekWindow(new Date('2026-08-27T09:00:00Z'))).toEqual({ from: '2026-08-24', to: '2026-08-30' });
  });

  it('keeps Monday as Monday on every day of the same week', () => {
    // The grid must not slide forward each day — a calendar week is a week.
    const days = ['24', '25', '26', '27', '28', '29', '30'];
    for (const d of days) {
      expect(weekWindow(new Date(`2026-08-${d}T12:00:00Z`)), d).toEqual({ from: '2026-08-24', to: '2026-08-30' });
    }
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    expect(weekWindow(new Date('2026-08-30T23:00:00Z')).from).toBe('2026-08-24');
    expect(weekWindow(new Date('2026-08-31T00:30:00Z')).from).toBe('2026-08-31');
  });

  it('spans a month and a year boundary correctly', () => {
    expect(weekWindow(new Date('2026-01-01T12:00:00Z'))).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });
});

describe('isoDay', () => {
  it('formats in UTC and zero-pads', () => {
    expect(isoDay(new Date('2026-01-05T23:59:00Z'))).toBe('2026-01-05');
  });
});

describe('mapRow', () => {
  it('maps a full row', () => {
    expect(mapRow(ROW)).toEqual(ROW);
  });

  it('keeps an unreported quarter with a null actual', () => {
    const m = mapRow({ ...ROW, actual: null, surprisePct: null });
    expect(m?.estimate).toBe(1.18);
    expect(m?.actual).toBeNull();
  });

  it('nulls a non-finite or non-numeric figure rather than showing 0', () => {
    for (const v of ['1.24', null, undefined, NaN, Infinity, {}, '']) {
      expect(mapRow({ ...ROW, actual: v })?.actual, String(v)).toBeNull();
    }
  });

  it('nulls an unrecognised timing rather than guessing a side', () => {
    for (const v of ['during', '', null, 'bmo']) {
      expect(mapRow({ ...ROW, timing: v })?.timing, String(v)).toBeNull();
    }
  });

  it('drops a row with no ticker or a malformed report date', () => {
    for (const bad of [
      { ...ROW, ticker: '' }, { ...ROW, ticker: null },
      { ...ROW, reportDate: '25/02/2026' }, { ...ROW, reportDate: '' },
      null, [ROW], 'x',
    ]) expect(mapRow(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('calendar-date validation (regression)', () => {
  it('rejects an impossible reportDate rather than letting it render as an invented day', () => {
    // Shape alone passed before: the calendar renders the weekday through
    // Date.UTC(y, m-1, d), which silently rolled 2026-02-31 to 3 March.
    for (const bad of ['2026-02-31', '2026-13-45', '2026-00-10', '2026-02-29', '2026-08-32']) {
      expect(mapRow({ ...ROW, reportDate: bad }), bad).toBeNull();
    }
    expect(mapRow({ ...ROW, reportDate: '2028-02-29' })?.reportDate).toBe('2028-02-29');
  });

  it('nulls an impossible periodEnd instead of carrying it', () => {
    expect(mapRow({ ...ROW, periodEnd: '2026-02-31' })?.periodEnd).toBeNull();
    expect(mapRow({ ...ROW, periodEnd: '2026-06-30' })?.periodEnd).toBe('2026-06-30');
  });
});

describe('truncation is reported, never silent', () => {
  const NOW = new Date('2026-08-27T09:00:00Z');

  it('carries the endpoint\'s truncated flag and total through to the caller', async () => {
    const r = await fetchWeekEarnings(
      async () => res({ earnings: [ROW], truncated: true, totalAvailable: 2317 }), NOW,
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.truncated).toBe(true);
    expect(r.status === 'ok' && r.data.totalAvailable).toBe(2317);
  });

  it('defaults to not-truncated when the endpoint says nothing', async () => {
    const r = await fetchWeekEarnings(async () => res({ earnings: [ROW] }), NOW);
    expect(r.status === 'ok' && r.data.truncated).toBe(false);
    expect(r.status === 'ok' && r.data.totalAvailable).toBe(1);
  });
});

describe('fetchWeekEarnings', () => {
  const NOW = new Date('2026-08-27T09:00:00Z');

  it('requests this calendar week and returns the rows', async () => {
    let seen = '';
    const r = await fetchWeekEarnings(async (url) => {
      seen = String(url);
      return res({ earnings: [ROW] });
    }, NOW);
    expect(seen).toBe(`${EARNINGS_URL}?from=2026-08-24&to=2026-08-30`);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.rows).toHaveLength(1);
  });

  it('treats a week with no reports as a legitimate ok, NOT an error', async () => {
    const r = await fetchWeekEarnings(async () => res({ earnings: [] }), NOW);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.rows).toEqual([]);
  });

  it('is unavailable — never an empty week — when the function errors', async () => {
    // The inverse of the case above, and the one that matters: an outage must
    // not read as "no company reports this week".
    for (const status of [400, 500, 502]) {
      const r = await fetchWeekEarnings(async () => res({ error: 'x' }, status), NOW);
      expect(r.status, `HTTP ${status}`).toBe('unavailable');
    }
  });

  it('is unavailable on an unrecognised shape, a network failure and bad JSON', async () => {
    for (const body of [{}, { earnings: null }, [ROW], null, 7]) {
      expect((await fetchWeekEarnings(async () => res(body), NOW)).status, JSON.stringify(body)).toBe('unavailable');
    }
    expect((await fetchWeekEarnings(async () => { throw new Error('offline'); }, NOW)).status).toBe('unavailable');
    expect((await fetchWeekEarnings(async () => new Response('<html>', { status: 200 }), NOW)).status).toBe('unavailable');
  });

  it('drops unusable rows but keeps the good ones', async () => {
    const r = await fetchWeekEarnings(
      async () => res({ earnings: [ROW, { ticker: 'X' }, null, { ...ROW, ticker: 'AAPL' }] }), NOW,
    );
    expect(r.status === 'ok' && r.data.rows.map((e) => e.ticker)).toEqual(['NVDA', 'AAPL']);
  });
});

describe('fetchTickerEarnings', () => {
  const NOW = new Date('2026-08-27T09:00:00Z');

  it('asks for three years of history plus the next scheduled report', async () => {
    let seen = '';
    await fetchTickerEarnings('nvda', async (url) => {
      seen = String(url);
      return res({ earnings: [ROW] });
    }, NOW);
    const u = new URL(seen, 'https://x.test');
    expect(u.pathname).toBe(EARNINGS_URL);
    expect(u.searchParams.get('ticker')).toBe('NVDA');
    // ~12 quarters back...
    expect(u.searchParams.get('from')! < '2023-09-01').toBe(true);
    // ...and far enough ahead to catch the upcoming quarter.
    expect(u.searchParams.get('to')! > '2026-08-27').toBe(true);
  });

  it('stays inside the range the endpoint accepts', async () => {
    // The function refuses anything wider than MAX_RANGE_DAYS, and upstream
    // 500s beyond ~5 years — so this window must not drift past it.
    let seen = '';
    await fetchTickerEarnings('NVDA', async (url) => { seen = String(url); return res({ earnings: [] }); }, NOW);
    const u = new URL(seen, 'https://x.test');
    const days = (Date.parse(u.searchParams.get('to')!) - Date.parse(u.searchParams.get('from')!)) / 86_400_000;
    // MAX_RANGE_DAYS in api/_lib/earnings.ts. A client window wider than
    // this gets a 400 and the user sees nothing at all, so the two layers
    // must agree — this is the assertion that keeps them agreeing.
    expect(days).toBeLessThanOrEqual(1200);
    // And still deep enough to be worth calling three years of history.
    expect(days).toBeGreaterThan(HISTORY_QUARTERS * 90);
  });

  it('treats no history as a legitimate empty result', async () => {
    // A newly-listed company genuinely has none.
    const r = await fetchTickerEarnings('NVDA', async () => res({ earnings: [] }), NOW);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.rows).toEqual([]);
  });

  it('rejects an empty ticker without calling the network', async () => {
    let called = 0;
    const r = await fetchTickerEarnings('  ', async () => { called += 1; return res({ earnings: [] }); }, NOW);
    expect(r.status).toBe('unavailable');
    expect(called).toBe(0);
  });
});

describe('earnings failure reasons', () => {
  it('says a refused subscription instead of a generic outage', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'upstream_forbidden', upstreamStatus: 403 }), {
        status: 502,
      })) as unknown as typeof fetch;
    const result = await fetchWeekEarnings(fetchImpl, new Date('2026-08-27T00:00:00Z'));
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason?.he).toContain('מנוי');
  });

  it('falls back to the calendar wording for an unrecognised failure', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const result = await fetchTickerEarnings('AAPL', fetchImpl, new Date('2026-08-27T00:00:00Z'));
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason?.he).toContain('יומן הדוחות');
  });
});
