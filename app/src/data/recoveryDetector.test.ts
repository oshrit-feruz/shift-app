import { describe, expect, it } from 'vitest';
import {
  extractOpenPositions,
  fetchSatellitePositions,
  mapPosition,
  toNumber,
} from './recoveryDetector';

describe('toNumber', () => {
  it('accepts numbers', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(0)).toBe(0);
  });
  it('accepts numeric strings, including formatted ones', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(' 12.5 ')).toBe(12.5);
    expect(toNumber('$1,234.50')).toBe(1234.5);
  });
  it('rejects everything non-numeric as null — never 0', () => {
    for (const v of [null, undefined, '', '  ', 'n/a', {}, [], true, NaN, Infinity]) {
      expect(toNumber(v)).toBeNull();
    }
  });
});

describe('mapPosition — defensive field mapping', () => {
  it('accepts ticker or symbol', () => {
    expect(mapPosition({ ticker: 'NVDA' })?.ticker).toBe('NVDA');
    expect(mapPosition({ symbol: 'AMD' })?.ticker).toBe('AMD');
  });
  it('prefers ticker when both are present', () => {
    expect(mapPosition({ ticker: 'NVDA', symbol: 'AMD' })?.ticker).toBe('NVDA');
  });
  it('uppercases the ticker', () => {
    expect(mapPosition({ symbol: 'teva' })?.ticker).toBe('TEVA');
  });
  it('accepts entry_price or entry', () => {
    expect(mapPosition({ ticker: 'X', entry_price: 10 })?.entryPrice).toBe(10);
    expect(mapPosition({ ticker: 'X', entry: 11 })?.entryPrice).toBe(11);
  });
  it('accepts current_price, price or last', () => {
    expect(mapPosition({ ticker: 'X', current_price: 20 })?.currentPrice).toBe(20);
    expect(mapPosition({ ticker: 'X', price: 21 })?.currentPrice).toBe(21);
    expect(mapPosition({ ticker: 'X', last: 22 })?.currentPrice).toBe(22);
  });
  it('honours candidate precedence for current price', () => {
    expect(mapPosition({ ticker: 'X', current_price: 20, price: 21, last: 22 })?.currentPrice).toBe(20);
    expect(mapPosition({ ticker: 'X', price: 21, last: 22 })?.currentPrice).toBe(21);
  });
  it('falls through to the next candidate when one is unparseable', () => {
    expect(mapPosition({ ticker: 'X', current_price: null, price: 21 })?.currentPrice).toBe(21);
  });
  it('missing numerics become null (rendered as "—"), never invented', () => {
    const p = mapPosition({ ticker: 'X' });
    expect(p).toEqual({ ticker: 'X', entryPrice: null, currentPrice: null });
  });
  it('drops rows with no usable ticker', () => {
    for (const row of [{}, { entry_price: 10 }, { ticker: '' }, { ticker: '   ' }, null, 'NVDA', 42, []]) {
      expect(mapPosition(row)).toBeNull();
    }
  });
});

describe('extractOpenPositions', () => {
  it('maps a populated open_positions array', () => {
    const out = extractOpenPositions({
      open_positions: [
        { ticker: 'NVDA', entry_price: 100, current_price: 120 },
        { symbol: 'amd', entry: '50', last: '55.5' },
      ],
    });
    expect(out).toEqual([
      { ticker: 'NVDA', entryPrice: 100, currentPrice: 120 },
      { ticker: 'AMD', entryPrice: 50, currentPrice: 55.5 },
    ]);
  });

  it('an empty array is a real answer — empty list, not an error', () => {
    expect(extractOpenPositions({ open_positions: [] })).toEqual([]);
  });

  it('ignores unrelated sibling fields on the dashboard body', () => {
    const out = extractOpenPositions({ status: 'ok', scanned: 500, open_positions: [] });
    expect(out).toEqual([]);
  });

  it('silently drops unusable rows but keeps the good ones', () => {
    const out = extractOpenPositions({ open_positions: [{ ticker: 'NVDA' }, {}, null, { symbol: 'AMD' }] });
    expect(out?.map((p) => p.ticker)).toEqual(['NVDA', 'AMD']);
  });

  it('returns null for an unrecognised shape — we cannot claim "zero positions"', () => {
    for (const body of [{}, { open_positions: null }, { open_positions: 'none' }, { positions: [] }, [], null, 'x']) {
      expect(extractOpenPositions(body)).toBeNull();
    }
  });
});

/** Minimal Response stand-in for the fetch-level tests. */
const res = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

describe('fetchSatellitePositions — honest states, no demo fallback', () => {
  it('ok with positions when the engine holds some', async () => {
    const r = await fetchSatellitePositions(async () =>
      res({ open_positions: [{ ticker: 'NVDA', entry_price: 100, current_price: 120 }] }),
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toEqual([{ ticker: 'NVDA', entryPrice: 100, currentPrice: 120 }]);
  });

  it('ok with an EMPTY list when the engine holds none (the expected case)', async () => {
    const r = await fetchSatellitePositions(async () => res({ open_positions: [] }));
    expect(r).toEqual({ status: 'ok', data: [] });
  });

  it('unavailable on a network/CORS failure — never demo data', async () => {
    const r = await fetchSatellitePositions(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on a non-2xx response', async () => {
    const r = await fetchSatellitePositions(async () => res({ open_positions: [] }, false, 503));
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unparseable body', async () => {
    const r = await fetchSatellitePositions(
      async () =>
        ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response,
    );
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unrecognised shape rather than a fake empty list', async () => {
    const r = await fetchSatellitePositions(async () => res({ positions: [] }));
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('never returns the old demo tickers on any failure path', async () => {
    const demoTickers = ['MRNA', 'ALB', 'TEVA', 'MDA'];
    const failures = [
      async () => { throw new Error('network'); },
      async () => res(null, false, 500),
      async () => res({ nope: true }),
    ];
    for (const f of failures) {
      const r = await fetchSatellitePositions(f as unknown as typeof fetch);
      expect(r.status).toBe('unavailable');
      const serialised = JSON.stringify(r);
      for (const t of demoTickers) expect(serialised).not.toContain(t);
    }
  });
});
