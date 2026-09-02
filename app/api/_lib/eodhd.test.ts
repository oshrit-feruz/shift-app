import { describe, expect, it } from 'vitest';
import {
  eodUrl,
  isCalendarDate,
  isoDay,
  mapEodBars,
  mapUsStats,
  readUsQuoteData,
  resolveSymbol,
  usQuoteUrl,
} from './eodhd.js';

describe('resolveSymbol', () => {
  it('sends a bare ticker to its US listing', () => {
    expect(resolveSymbol('NVDA')).toBe('NVDA.US');
    expect(resolveSymbol(' nvda ')).toBe('NVDA.US');
  });

  it('leaves a known exchange suffix exactly as written', () => {
    expect(resolveSymbol('VOD.LSE')).toBe('VOD.LSE');
    expect(resolveSymbol('mda.to')).toBe('MDA.TO');
    expect(resolveSymbol('EURUSD.FOREX')).toBe('EURUSD.FOREX');
    expect(resolveSymbol('BTC-USD.CC')).toBe('BTC-USD.CC');
  });

  it('reads a class share written with a dot as part of the ticker', () => {
    // Verified against the live API: "BRK.B" answers with an empty series
    // because EODHD reads B as an exchange, while "BRK-B.US" answers with
    // real sessions. Getting this wrong would have told a Berkshire holder
    // "no price history for this symbol" — a claim about the stock that was
    // really a fact about our own translation.
    expect(resolveSymbol('BRK.B')).toBe('BRK-B.US');
    expect(resolveSymbol('BF.B')).toBe('BF-B.US');
  });

  it('only adds the exchange to a ticker already written the provider way', () => {
    expect(resolveSymbol('RY-PT')).toBe('RY-PT.US');
  });

  it('does not turn a trailing dot into a symbol nobody meant', () => {
    expect(resolveSymbol('NVDA.')).toBe('NVDA.US');
  });
});

describe('isoDay', () => {
  it('formats in UTC, zero-padded', () => {
    expect(isoDay(new Date(Date.UTC(2026, 8, 2, 23, 59)))).toBe('2026-09-02');
    // Late UTC evening is still the same UTC day, whatever the host's zone.
    expect(isoDay(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-05');
  });
});

describe('isCalendarDate', () => {
  it('accepts a real day and refuses one that only looks like a date', () => {
    expect(isCalendarDate('2026-09-01')).toBe(true);
    // Date.UTC rolls this forward into March, so a shape test alone would
    // date a session to a day that never existed.
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('01-09-2026')).toBe(false);
    expect(isCalendarDate(20260901)).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });
});

describe('eodUrl', () => {
  it('resolves a bare ticker to the US listing, as the news route does', () => {
    expect(eodUrl(' nvda ', '2026-01-01', '2026-02-01', 'k').pathname).toBe('/api/eod/NVDA.US');
  });

  it('keeps an exchange suffix the caller supplied', () => {
    // The whole reason a Toronto listing can have a chart: Finnhub had no
    // tape for it at all.
    expect(eodUrl('mda.to', '2026-01-01', '2026-02-01', 'k').pathname).toBe('/api/eod/MDA.TO');
  });

  it('asks for daily bars over the given window, in JSON', () => {
    const url = eodUrl('NVDA', '2026-01-01', '2026-02-01', 'k');
    expect(url.searchParams.get('period')).toBe('d');
    expect(url.searchParams.get('from')).toBe('2026-01-01');
    expect(url.searchParams.get('to')).toBe('2026-02-01');
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('api_token')).toBe('k');
  });
});

describe('mapEodBars', () => {
  const row = {
    date: '2026-09-01',
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    adjusted_close: 5.5,
    volume: 100,
  };
  const ok = [{ ...row, date: '2026-08-31', open: 9, high: 11, low: 8, close: 10, volume: 90 }, row];

  it('maps rows into dated bars, oldest first', () => {
    const bars = mapEodBars(ok)!;
    expect(bars.map((b) => b.d)).toEqual(['2026-08-31', '2026-09-01']);
    expect(bars[1]).toEqual({ d: '2026-09-01', o: 10, h: 12, l: 9, c: 11, v: 100 });
  });

  it('sorts a series the provider sent newest-first', () => {
    const bars = mapEodBars([...ok].reverse())!;
    expect(bars.map((b) => b.d)).toEqual(['2026-08-31', '2026-09-01']);
  });

  it('serves the raw close, never the adjusted one', () => {
    // The provider adjusts only the close. Scaling open, high and low by the
    // adjusted/raw ratio would put three prices on screen that nobody traded
    // at, and the adjustment folds in dividends besides.
    expect(mapEodBars([row])![0].c).toBe(11);
  });

  it('reads an empty array as a real answer about the symbol', () => {
    // Distinct from null: "this provider has no history for that ticker" is a
    // fact about the symbol, not a response we failed to understand.
    expect(mapEodBars([])).toEqual([]);
  });

  it('refuses the whole series for one unreadable row', () => {
    // A chart is read as a whole. A series with a silently dropped session is
    // a picture of price action that never happened.
    expect(mapEodBars([ok[0], { ...row, close: null }])).toBeNull();
    expect(mapEodBars([ok[0], { ...row, close: '11' }])).toBeNull();
    expect(mapEodBars([ok[0], { ...row, date: '2026-02-31' }])).toBeNull();
    expect(mapEodBars([ok[0], { ...row, high: 1 }])).toBeNull(); // high below low
  });

  it('refuses a bar whose open or close sits outside its own range', () => {
    // An open above the session's high draws a wick pointing the wrong way,
    // which a reader cannot see through.
    expect(mapEodBars([{ ...row, open: 100 }])).toBeNull();
    expect(mapEodBars([{ ...row, close: 1 }])).toBeNull();
  });

  it('refuses non-positive prices and negative volume', () => {
    // A traded price is positive by definition and a negative volume is not a
    // smaller volume. Refused rather than clamped: the honest answer to a
    // nonsense bar is not a guess about which field was wrong.
    expect(mapEodBars([{ ...row, low: 0 }])).toBeNull();
    expect(mapEodBars([{ ...row, close: -11 }])).toBeNull();
    expect(mapEodBars([{ ...row, volume: -1 }])).toBeNull();
  });

  it('refuses a row with no volume rather than calling it a zero-volume day', () => {
    // Volume is not decoration — the volume pane and both volume stats read
    // it — and a zero would render as a session in which nothing was traded.
    expect(mapEodBars([{ ...row, volume: null }])).toBeNull();
  });

  it('refuses a body that is not a series', () => {
    expect(mapEodBars(null)).toBeNull();
    expect(mapEodBars({ error: 'nope' })).toBeNull();
    expect(mapEodBars('[]')).toBeNull();
    expect(mapEodBars([null])).toBeNull();
  });
});

describe('usQuoteUrl', () => {
  it('asks for the resolved symbols in one request', () => {
    const url = usQuoteUrl(['nvda', 'BRK.B'], 'k');
    expect(url.pathname).toBe('/api/us-quote-delayed');
    expect(url.searchParams.get('s')).toBe('NVDA.US,BRK-B.US');
    expect(url.searchParams.get('api_token')).toBe('k');
  });
});

describe('readUsQuoteData', () => {
  it('returns the per-symbol map', () => {
    expect(readUsQuoteData({ meta: { count: 1 }, data: { 'NVDA.US': { pe: 1 } } })).toEqual({
      'NVDA.US': { pe: 1 },
    });
  });

  it('refuses a body that is not a quote response', () => {
    expect(readUsQuoteData(null)).toBeNull();
    expect(readUsQuoteData([])).toBeNull();
    expect(readUsQuoteData({ meta: {} })).toBeNull();
    expect(readUsQuoteData({ data: [] })).toBeNull();
  });
});

describe('mapUsStats', () => {
  const row = {
    marketCap: 174752550000,
    pe: 19.483429,
    forwardPE: 16.835,
    dividendYield: 0.0216,
    fiftyTwoWeekHigh: 259.92,
    fiftyTwoWeekLow: 121.99,
    lastTradePrice: 166.431,
  };

  it('maps the figures the grid renders', () => {
    expect(mapUsStats(row)).toEqual({
      marketCap: 174752550000,
      pe: 19.483429,
      forwardPE: 16.835,
      dividendYield: 0.0216,
      fiftyTwoWeekHigh: 259.92,
      fiftyTwoWeekLow: 121.99,
    });
  });

  it('carries no price, however tempting the one in the row', () => {
    // The header's price is live and this feed is delayed. A price from here
    // sitting beside that one would be two different moments under one label.
    expect(mapUsStats(row)).not.toHaveProperty('lastTradePrice');
  });

  it('keeps the provider nulls as nulls', () => {
    // Real answers, all three: an ETF has no P/E (verified on VTI), and a
    // company that pays nothing has no yield (verified on TSLA).
    const etf = { ...row, pe: null, forwardPE: null, dividendYield: null };
    expect(mapUsStats(etf)).toMatchObject({ pe: null, forwardPE: null, dividendYield: null });
  });

  it('reads a missing field as null rather than as a zero', () => {
    expect(mapUsStats({})).toEqual({
      marketCap: null,
      pe: null,
      forwardPE: null,
      dividendYield: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
    });
  });

  it('refuses a non-positive market cap, P/E or 52-week bound', () => {
    // Quantities that cannot be zero for a listed company: a zero is the
    // provider saying nothing, and "P/E 0.0" would be a claim.
    const zeroed = mapUsStats({ ...row, marketCap: 0, pe: 0, fiftyTwoWeekLow: -1 })!;
    expect(zeroed.marketCap).toBeNull();
    expect(zeroed.pe).toBeNull();
    expect(zeroed.fiftyTwoWeekLow).toBeNull();
  });

  it('keeps a zero dividend yield, which is a real answer', () => {
    expect(mapUsStats({ ...row, dividendYield: 0 })!.dividendYield).toBe(0);
  });

  it('refuses a row that is not an object', () => {
    expect(mapUsStats(null)).toBeNull();
    expect(mapUsStats([row])).toBeNull();
  });
});
