import { describe, expect, it } from 'vitest';
import {
  extractOpenPositions,
  fetchSatellitePositions,
  mapPosition,
  extractBuySignals,
  fetchSatelliteSignals,
  mapSignal,
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

describe('mapSignal — defensive field mapping', () => {
  it('accepts ticker or symbol', () => {
    expect(mapSignal({ ticker: 'NVDA' })?.ticker).toBe('NVDA');
    expect(mapSignal({ symbol: 'AMD' })?.ticker).toBe('AMD');
  });
  it('prefers ticker when both are present', () => {
    expect(mapSignal({ ticker: 'NVDA', symbol: 'AMD' })?.ticker).toBe('NVDA');
  });
  it('uppercases the ticker', () => {
    expect(mapSignal({ symbol: 'teva' })?.ticker).toBe('TEVA');
  });
  it('accepts price, current_price or last', () => {
    expect(mapSignal({ ticker: 'X', price: 20 })?.price).toBe(20);
    expect(mapSignal({ ticker: 'X', current_price: 21 })?.price).toBe(21);
    expect(mapSignal({ ticker: 'X', last: 22 })?.price).toBe(22);
  });
  it('honours candidate precedence for price', () => {
    expect(mapSignal({ ticker: 'X', price: 20, current_price: 21, last: 22 })?.price).toBe(20);
  });
  it('falls through to the next candidate when one is unparseable', () => {
    expect(mapSignal({ ticker: 'X', price: null, current_price: 21 })?.price).toBe(21);
  });
  it('maps the engine drawdown and score fields', () => {
    const s = mapSignal({ ticker: 'ORCL', drawdown_pct: 55.4, composite_score: 0.715, high_52w: 324.63 });
    expect(s?.drawdownPct).toBe(55.4);
    expect(s?.compositeScore).toBe(0.715);
    expect(s?.high52w).toBe(324.63);
  });
  it('keeps a recognised verdict verbatim', () => {
    for (const v of ['BUY', 'WATCH', 'SKIP'] as const) {
      expect(mapSignal({ ticker: 'X', signal: v })?.signal).toBe(v);
    }
  });
  it('reports an unrecognised verdict as null rather than coercing it to BUY', () => {
    for (const v of ['buy', 'STRONG_BUY', '', 42, null]) {
      expect(mapSignal({ ticker: 'X', signal: v })?.signal).toBeNull();
    }
  });
  it('missing numerics become null (rendered as "—"), never invented', () => {
    expect(mapSignal({ ticker: 'X' })).toEqual({
      ticker: 'X',
      price: null,
      high52w: null,
      drawdownPct: null,
      compositeScore: null,
      signal: null,
    });
  });
  it('a real zero is preserved, not confused with missing', () => {
    expect(mapSignal({ ticker: 'MRK', drawdown_pct: 0 })?.drawdownPct).toBe(0);
  });
  it('drops rows with no usable ticker', () => {
    for (const row of [{}, { price: 10 }, { ticker: '' }, { ticker: '   ' }, null, 'NVDA', 42, []]) {
      expect(mapSignal(row)).toBeNull();
    }
  });
});

describe('extractBuySignals', () => {
  it('maps the engine buy_signals array', () => {
    const out = extractBuySignals({
      buy_signals: [
        { ticker: 'ORCL', price: 144.76, drawdown_pct: 55.4, composite_score: 0.715, high_52w: 324.63, signal: 'BUY' },
        { symbol: 'app', price: '310.54', signal: 'BUY' },
      ],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'APP']);
    expect(out?.[0].drawdownPct).toBe(55.4);
    expect(out?.[1].price).toBe(310.54);
  });

  it('an empty buy_signals array is a real answer — empty list, not an error', () => {
    expect(extractBuySignals({ buy_signals: [] })).toEqual([]);
  });

  it('ignores unrelated sibling fields on the screener body', () => {
    expect(extractBuySignals({ as_of: '2026-08-26', computed_on: '2026-08-26', buy_signals: [] })).toEqual([]);
  });

  it('prefers buy_signals over full_ranking when both are present', () => {
    const out = extractBuySignals({
      buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }],
      full_ranking: [{ ticker: 'NFLX', signal: 'BUY' }, { ticker: 'SNDK', signal: 'SKIP' }],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL']);
  });

  it('derives BUYs from full_ranking only when buy_signals is absent', () => {
    const out = extractBuySignals({
      full_ranking: [
        { ticker: 'ORCL', signal: 'BUY' },
        { ticker: 'SNDK', signal: 'SKIP' },
        { ticker: 'GLW', signal: 'WATCH' },
        { ticker: 'NFLX', signal: 'BUY' },
      ],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'NFLX']);
  });

  it('a full_ranking with no BUYs yields an empty list, not every row', () => {
    const out = extractBuySignals({ full_ranking: [{ ticker: 'SNDK', signal: 'SKIP' }] });
    expect(out).toEqual([]);
  });

  it('silently drops unusable rows but keeps the good ones', () => {
    const out = extractBuySignals({ buy_signals: [{ ticker: 'ORCL' }, {}, null, { symbol: 'APP' }] });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'APP']);
  });

  it('returns null for an unrecognised shape — we cannot claim "no candidates"', () => {
    for (const body of [{}, { buy_signals: null }, { buy_signals: 'none' }, { open_positions: [] }, [], null, 'x']) {
      expect(extractBuySignals(body)).toBeNull();
    }
  });
});

/** Minimal Response stand-in for the fetch-level tests. */
const res = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

describe('fetchSatelliteSignals — honest states, no demo fallback', () => {
  it('ok with candidates when the engine picks some', async () => {
    const r = await fetchSatelliteSignals(async () =>
      res({ buy_signals: [{ ticker: 'ORCL', price: 144.76, signal: 'BUY' }] }),
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.map((s) => s.ticker)).toEqual(['ORCL']);
  });

  it('ok with an EMPTY list on a quiet day (a real answer, not an error)', async () => {
    const r = await fetchSatelliteSignals(async () => res({ buy_signals: [] }));
    expect(r).toEqual({ status: 'ok', data: [] });
  });

  it('unavailable on a network/CORS failure — never demo data', async () => {
    const r = await fetchSatelliteSignals(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on a non-2xx response', async () => {
    const r = await fetchSatelliteSignals(async () => res({ buy_signals: [] }, false, 503));
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unparseable body', async () => {
    const r = await fetchSatelliteSignals(
      async () =>
        ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response,
    );
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unrecognised shape rather than a fake empty list', async () => {
    const r = await fetchSatelliteSignals(async () => res({ positions: [] }));
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
      const r = await fetchSatelliteSignals(f as unknown as typeof fetch);
      expect(r.status).toBe('unavailable');
      const serialised = JSON.stringify(r);
      for (const t of demoTickers) expect(serialised).not.toContain(t);
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
