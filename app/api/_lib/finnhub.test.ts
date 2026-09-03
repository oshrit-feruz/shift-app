import { describe, expect, it } from 'vitest';
import { mapQuote, quoteUrl } from './finnhub.js';

describe('quoteUrl', () => {
  it('normalises the symbol so one casing is not a second upstream call', () => {
    expect(quoteUrl(' nvda ', 'k').searchParams.get('symbol')).toBe('NVDA');
  });

  it('carries the key as the query parameter the provider documents', () => {
    expect(quoteUrl('NVDA', 'k').searchParams.get('token')).toBe('k');
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

  it('refuses a quote with no usable previous close', () => {
    // A day change has to be measured from somewhere. With `pc` at zero the
    // currency change is the whole price and the percentage is 0.00%, so the
    // row would publish "+$150.00" and "0.00%" together — a contradiction,
    // not a smaller truth. A Quote is whole or absent.
    expect(mapQuote({ ...body, pc: 0 })).toBeNull();
    expect(mapQuote({ ...body, pc: -1 })).toBeNull();
  });

  it('refuses a timestamp outside the range a Date can hold', () => {
    // `isNum` accepts any finite number, and toISOString() throws a
    // RangeError on an Invalid Date — from inside a mapper documented never
    // to throw. That reached the caller as a platform 500 instead of this
    // app's own JSON.
    expect(mapQuote({ ...body, t: 8_640_000_000_001 })).toBeNull();
  });

  it('falls back to the last price for a session high, low or open of zero', () => {
    // Pre-open, before the first trade of the day prints.
    const q = mapQuote({ ...body, h: 0, l: 0, o: 0 });
    expect([q?.dayHigh, q?.dayLow, q?.open]).toEqual([150, 150, 150]);
  });

  it('refuses a session whose numbers describe an impossible day', () => {
    // The fallbacks can build these from a row whose fields are each
    // individually well-formed, so the check has to come after them. An
    // inverted range prints on the stock page as "Day range 12.00–9.00".
    expect(mapQuote({ ...body, h: 9, l: 12 })).toBeNull();
    expect(mapQuote({ ...body, h: 151, l: 144, o: 200 })).toBeNull();
    expect(mapQuote({ ...body, h: 151, l: 144, o: 1 })).toBeNull();
  });

  it('keeps a last price outside the session range — extended hours is real', () => {
    // `c` can legitimately sit outside a high and low that cover only the
    // regular session, so range-checking it would throw away good quotes.
    expect(mapQuote({ ...body, c: 200, h: 151, l: 144, o: 145 })?.price).toBe(200);
  });

  it('refuses a body that is not a quote', () => {
    expect(mapQuote(null)).toBeNull();
    expect(mapQuote([body])).toBeNull();
    expect(mapQuote({ c: '150', pc: 145, t: 1 })).toBeNull();
  });
});
