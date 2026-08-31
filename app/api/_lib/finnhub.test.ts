import { describe, expect, it } from 'vitest';
import { candleUrl, mapCandles, mapQuote, quoteUrl } from './finnhub.js';

describe('quoteUrl / candleUrl', () => {
  it('normalises the symbol so one casing is not a second upstream call', () => {
    expect(quoteUrl(' nvda ', 'k').searchParams.get('symbol')).toBe('NVDA');
    expect(candleUrl(' nvda ', 0, 1, 'k').searchParams.get('symbol')).toBe('NVDA');
  });

  it('asks for daily bars over a whole-second window', () => {
    const url = candleUrl('NVDA', 1_700_000_000.9, 1_700_086_400.2, 'k');
    expect(url.searchParams.get('resolution')).toBe('D');
    expect(url.searchParams.get('from')).toBe('1700000000');
    expect(url.searchParams.get('to')).toBe('1700086400');
  });
});

describe('mapQuote', () => {
  const body = { c: 150, d: 5, dp: 3.4483, h: 151, l: 144, o: 145, pc: 145, t: 1_756_600_000 };

  it('maps a live quote', () => {
    expect(mapQuote(body)).toEqual({
      price: 150,
      change: 5,
      changePct: (5 / 145) * 100,
      prevClose: 145,
      dayHigh: 151,
      dayLow: 144,
      open: 145,
      asOf: new Date(1_756_600_000 * 1000).toISOString(),
    });
  });

  // THE ZERO-QUOTE TRAP. Finnhub answers an unknown symbol with HTTP 200 and
  // every field zeroed, so a caller that trusts the status code renders a
  // real-looking $0.00 for a typo. That is the one failure this app must not
  // have: an invented number a reader takes for a price.
  it('refuses the all-zero body an unknown symbol comes back as', () => {
    expect(mapQuote({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 })).toBeNull();
  });

  it('refuses a quote with no timestamp, however plausible its numbers', () => {
    expect(mapQuote({ ...body, t: 0 })).toBeNull();
  });

  it('recomputes the percentage rather than trusting the provider’s', () => {
    // A real move reported as 0.00% is worse than a dash: a reader acts on it.
    expect(mapQuote({ ...body, dp: 0 })?.changePct).toBeCloseTo(3.4483, 4);
  });

  it('calls the change 0% when there is no previous close to measure from', () => {
    // An IPO's first session. Zero is the only claim true of it; a division
    // by zero would be Infinity, which renders as a number.
    const q = mapQuote({ ...body, pc: 0 });
    expect(q?.changePct).toBe(0);
    expect(Number.isFinite(q!.change)).toBe(true);
  });

  it('falls back to the last price for a session high, low or open of zero', () => {
    // Pre-open, before the first trade of the day prints.
    const q = mapQuote({ ...body, h: 0, l: 0, o: 0 });
    expect([q?.dayHigh, q?.dayLow, q?.open]).toEqual([150, 150, 150]);
  });

  it('refuses a body that is not a quote', () => {
    expect(mapQuote(null)).toBeNull();
    expect(mapQuote([body])).toBeNull();
    expect(mapQuote({ c: '150', pc: 145, t: 1 })).toBeNull();
  });
});

describe('mapCandles', () => {
  const ok = {
    s: 'ok',
    t: [1_756_600_000, 1_756_513_600],
    o: [10, 9],
    h: [12, 11],
    l: [9, 8],
    c: [11, 10],
    v: [100, 90],
  };

  it('maps parallel arrays into dated bars, oldest first', () => {
    const bars = mapCandles(ok)!;
    expect(bars.map((b) => b.d)).toEqual([...bars.map((b) => b.d)].sort());
    expect(bars[1]).toEqual({
      d: new Date(1_756_600_000 * 1000).toISOString().slice(0, 10),
      o: 10,
      h: 12,
      l: 9,
      c: 11,
      v: 100,
    });
  });

  it('reads no_data as an empty series — a real answer about the symbol', () => {
    // Distinct from null: "this provider has no history for MDA" is a fact
    // about the ticker, not a response we failed to understand.
    expect(mapCandles({ s: 'no_data' })).toEqual([]);
  });

  it('refuses arrays of differing lengths rather than pairing them anyway', () => {
    // Parallel arrays are only meaningful together; zipping a short one would
    // invent bars out of two different sessions.
    expect(mapCandles({ ...ok, v: [100] })).toBeNull();
  });

  it('refuses the whole series for one unreadable row', () => {
    // A chart is read as a whole. A series with a silently dropped session is
    // a picture of price action that never happened.
    expect(mapCandles({ ...ok, c: [11, null] })).toBeNull();
    expect(mapCandles({ ...ok, h: [12, 1] })).toBeNull(); // high below low
    expect(mapCandles({ ...ok, t: [1_756_600_000, 0] })).toBeNull();
  });

  it('refuses a body that is not a candle response', () => {
    expect(mapCandles(null)).toBeNull();
    expect(mapCandles({ s: 'error' })).toBeNull();
    expect(mapCandles({ s: 'ok', t: [] })).toBeNull();
  });
});
