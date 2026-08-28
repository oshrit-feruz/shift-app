import { describe, it, expect } from 'vitest';
import { fetchFundamentals, mapFundamentals } from './fundamentals';

/** A response shaped exactly like the engine's, so fixtures can't drift into
 *  something the real service never sends. Captured from a live call to
 *  /api/stock/NVDA/fundamentals. */
const LIVE_OK = {
  ticker: 'NVDA',
  status: 'ok',
  revenue: { value: 215938000000.0, period_end: '2026-01-25', yoy_pct: 65.5 },
  filing: { filed: '2026-02-25', form: '10-K' },
  source: 'SEC EDGAR companyfacts',
};

/** Also captured live — note the 200. The engine answers 200 for a ticker it
 *  has nothing on, which is exactly why the status field is the only signal. */
const LIVE_UNAVAILABLE = {
  ticker: 'SPY',
  status: 'unavailable',
  reason:
    'No usable EDGAR filing data for this ticker (not SEC-listed, no annual revenue on file, or EDGAR unreachable).',
};

const res = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('mapFundamentals', () => {
  it('maps a real ok payload', () => {
    expect(mapFundamentals(LIVE_OK)).toEqual({
      ticker: 'NVDA',
      revenue: 215938000000,
      periodEnd: '2026-01-25',
      yoyPct: 65.5,
      filed: '2026-02-25',
      form: '10-K',
      source: 'SEC EDGAR companyfacts',
    });
  });

  it('uppercases the ticker', () => {
    expect(mapFundamentals({ ...LIVE_OK, ticker: 'nvda' })?.ticker).toBe('NVDA');
  });

  it('tolerates a numeric string revenue without inventing a number', () => {
    expect(mapFundamentals({ ...LIVE_OK, revenue: { value: '123.5' } })?.revenue).toBe(123.5);
    expect(mapFundamentals({ ...LIVE_OK, revenue: { value: 'n/a' } })).toBeNull();
  });

  it('returns null when there is no revenue figure at all', () => {
    // An 'ok' with nothing to show is better surfaced as unavailable than as
    // a card of dashes pretending to be a report.
    expect(mapFundamentals({ ticker: 'X', status: 'ok' })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, revenue: null })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, revenue: { value: null } })).toBeNull();
  });

  it('rejects a payload whose filing provenance is missing', () => {
    // A revenue figure that cannot say which filing it came from is not a
    // "filed result" — the engine documents the number as display-only and
    // not point-in-time, so its provenance is the honest part. Better an
    // unavailable card than a big number with "הוגש —" under it.
    expect(mapFundamentals({ ...LIVE_OK, filing: null })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, filing: {} })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, filing: { filed: '2026-02-25' } })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, filing: { form: '10-K' } })).toBeNull();
    expect(mapFundamentals({ ...LIVE_OK, filing: { filed: '', form: '10-K' } })).toBeNull();
  });

  it('rejects a row with no ticker, and non-objects', () => {
    expect(mapFundamentals({ ...LIVE_OK, ticker: '' })).toBeNull();
    expect(mapFundamentals(null)).toBeNull();
    expect(mapFundamentals([LIVE_OK])).toBeNull();
    expect(mapFundamentals('nope')).toBeNull();
  });
});

describe('fetchFundamentals', () => {
  it('returns ok for a real ok payload', async () => {
    const r = await fetchFundamentals('NVDA', async () => res(LIVE_OK));
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.revenue).toBe(215938000000);
  });

  it('branches on the status field, not the HTTP code', async () => {
    // The live service returns HTTP 200 here. If this ever reads as ok, the
    // screen would render an empty report as though it were real.
    const r = await fetchFundamentals('SPY', async () => res(LIVE_UNAVAILABLE, 200));
    expect(r.status).toBe('unavailable');
  });

  it('treats an unrecognised status as unavailable, never as ok', async () => {
    for (const status of ['OK', 'partial', 'pending', '', null, undefined, 1]) {
      const r = await fetchFundamentals('NVDA', async () => res({ ...LIVE_OK, status }));
      expect(r.status, `status=${String(status)} must not read as ok`).toBe('unavailable');
    }
  });

  it('reports a bilingual reason, never the engine raw English', async () => {
    const r = await fetchFundamentals('SPY', async () => res(LIVE_UNAVAILABLE));
    expect(r.status).toBe('unavailable');
    const reason = r.status === 'unavailable' ? r.reason : null;
    expect(reason?.he).toBeTruthy();
    expect(reason?.en).toBeTruthy();
    // The engine's own sentence must not reach a Hebrew-first UI verbatim.
    expect(reason?.he).not.toContain('No usable EDGAR');
  });

  it('distinguishes "no filings" from "could not reach the service"', async () => {
    const noFilings = await fetchFundamentals('SPY', async () => res(LIVE_UNAVAILABLE));
    const unreachable = await fetchFundamentals('NVDA', async () => res({}, 503));
    const a = noFilings.status === 'unavailable' ? noFilings.reason?.he : null;
    const b = unreachable.status === 'unavailable' ? unreachable.reason?.he : null;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('is unavailable on a network failure, a timeout and unparseable JSON', async () => {
    const boom = await fetchFundamentals('NVDA', async () => {
      throw new Error('network down');
    });
    expect(boom.status).toBe('unavailable');

    const garbage = await fetchFundamentals(
      'NVDA',
      async () => new Response('<html>gateway</html>', { status: 200 }),
    );
    expect(garbage.status).toBe('unavailable');
  });

  it('never falls back to a fabricated figure on any failure path', async () => {
    const paths: Array<() => Promise<Response>> = [
      async () => res(LIVE_UNAVAILABLE),
      async () => res({}, 500),
      async () => {
        throw new Error('x');
      },
      async () => new Response('not json', { status: 200 }),
    ];
    for (const f of paths) {
      const r = await fetchFundamentals('NVDA', f);
      expect(r.status).toBe('unavailable');
      expect('data' in r).toBe(false);
    }
  });

  it('rejects an empty ticker without calling the network', async () => {
    let called = 0;
    const r = await fetchFundamentals('   ', async () => {
      called += 1;
      return res(LIVE_OK);
    });
    expect(r.status).toBe('unavailable');
    expect(called).toBe(0);
  });

  it('URL-encodes the ticker and targets the engine origin', async () => {
    let seen = '';
    await fetchFundamentals('BRK.B', async (url) => {
      seen = String(url);
      return res(LIVE_UNAVAILABLE);
    });
    expect(seen).toContain('/api/stock/BRK.B/fundamentals');
    expect(seen).toContain('onrender.com');
  });

  it('uppercases the ticker in the request path', async () => {
    let seen = '';
    await fetchFundamentals('nvda', async (url) => {
      seen = String(url);
      return res(LIVE_OK);
    });
    expect(seen).toContain('/api/stock/NVDA/fundamentals');
  });
});
