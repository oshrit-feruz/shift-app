import { describe, expect, it } from 'vitest';
import {
  eodUrl,
  isCalendarDate,
  isoDay,
  intradayUrl,
  latestSession,
  mapEodBars,
  mapIntradayBars,
  mapIntradayRow,
  mapMoverRow,
  mapMoverRows,
  mapUsStats,
  readUsQuoteData,
  resolveSymbol,
  screenerUrl,
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

  it('reads the empty array the provider sends for no matches as an empty map', () => {
    // Verified: a made-up ticker answers {"meta":{"count":0},"data":[]}.
    // Refusing that as an unrecognised shape told the reader the response was
    // broken when the provider had simply said it carries nothing.
    expect(readUsQuoteData({ meta: { count: 0 }, data: [] })).toEqual({});
  });

  it('refuses a body that is not a quote response', () => {
    expect(readUsQuoteData(null)).toBeNull();
    expect(readUsQuoteData([])).toBeNull();
    expect(readUsQuoteData({ meta: {} })).toBeNull();
    // A non-empty array is still a shape we do not understand.
    expect(readUsQuoteData({ data: [{ symbol: 'NVDA.US' }] })).toBeNull();
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
    volume: 8831907,
    averageVolume: 15642960,
    lastTradePrice: 166.431,
  };

  it('maps the figures the screens render', () => {
    expect(mapUsStats(row)).toEqual({
      marketCap: 174752550000,
      pe: 19.483429,
      forwardPE: 16.835,
      dividendYield: 0.0216,
      fiftyTwoWeekHigh: 259.92,
      fiftyTwoWeekLow: 121.99,
      volume: 8831907,
      averageVolume: 15642960,
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
      volume: null,
      averageVolume: null,
    });
  });

  it('refuses a negative session volume, which is the RVol numerator', () => {
    // A negative volume is not a smaller volume, and relativeVolume would
    // divide it by a positive average and print a signed multiple beside a
    // real price.
    expect(mapUsStats({ ...row, volume: -1 })!.volume).toBeNull();
  });

  it('keeps a zero session volume but refuses a zero average', () => {
    // A session that has genuinely traded nothing is a real zero. A zero
    // average is the provider having no history to average — seen on newly
    // listed names — and it is the denominator of the relative-volume ratio.
    const row0 = mapUsStats({ ...row, volume: 0, averageVolume: 0 })!;
    expect(row0.volume).toBe(0);
    expect(row0.averageVolume).toBeNull();
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

describe('screenerUrl', () => {
  it('sends the sort, the limit and the filters as the provider parses them', () => {
    const url = screenerUrl('k', 'refund_1d_p.desc', 100, [['exchange', '=', 'us']]);
    expect(url.pathname).toBe('/api/screener');
    expect(url.searchParams.get('sort')).toBe('refund_1d_p.desc');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('filters')).toBe('[["exchange","=","us"]]');
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('api_token')).toBe('k');
  });
});

describe('mapMoverRow', () => {
  const row = {
    code: 'MRNA',
    name: 'Moderna Inc',
    last_day_data_date: '2026-09-01',
    adjusted_close: 154.27,
    refund_1d_p: 9.93,
    sector: 'Healthcare',
    avgvol_1d: 25690832,
    avgvol_200d: 11319266.03,
  };

  it('translates the provider field names into what they actually mean', () => {
    // avgvol_1d is not an average: it is the last session's volume, and
    // avgvol_200d is the average it gets measured against. Carrying them
    // under the provider's names would invite the mistake RVol exists to
    // avoid.
    expect(mapMoverRow(row)).toEqual({
      ticker: 'MRNA',
      name: 'Moderna Inc',
      sector: 'Healthcare',
      close: 154.27,
      changePct: 9.93,
      volume: 25690832,
      averageVolume: 11319266.03,
    });
  });

  it('keeps a real fall as a negative change', () => {
    expect(mapMoverRow({ ...row, refund_1d_p: -4.2 })!.changePct).toBe(-4.2);
  });

  it('keeps a flat session as a real zero', () => {
    expect(mapMoverRow({ ...row, refund_1d_p: 0 })!.changePct).toBe(0);
  });

  it('carries no date, so nothing downstream can print one', () => {
    expect(mapMoverRow(row)).not.toHaveProperty('last_day_data_date');
  });

  it('reads a missing name or sector as null rather than as an empty label', () => {
    // Verified against the live screener: an ETF is returned with "" for both.
    const etf = mapMoverRow({ ...row, code: 'XOP', name: '', sector: '' })!;
    expect(etf.name).toBeNull();
    expect(etf.sector).toBeNull();
  });

  it('drops a row that cannot carry a ticker, a close and a change', () => {
    expect(mapMoverRow({ ...row, code: '' })).toBeNull();
    expect(mapMoverRow({ ...row, adjusted_close: null })).toBeNull();
    expect(mapMoverRow({ ...row, adjusted_close: 0 })).toBeNull();
    expect(mapMoverRow({ ...row, refund_1d_p: null })).toBeNull();
    expect(mapMoverRow({ ...row, refund_1d_p: '9.93' })).toBeNull();
    expect(mapMoverRow(null)).toBeNull();
    expect(mapMoverRow([row])).toBeNull();
  });

  it('keeps a row whose volume is missing — two columns already say "—"', () => {
    const thin = mapMoverRow({ ...row, avgvol_1d: null, avgvol_200d: null })!;
    expect(thin.ticker).toBe('MRNA');
    expect(thin.volume).toBeNull();
    expect(thin.averageVolume).toBeNull();
  });

  it("refuses a negative volume, which is the ratio's numerator", () => {
    // The same rule mapUsStats keeps, for the same reason: relativeVolume
    // would divide it by a positive average and print a signed multiple on
    // the movers table. A zero session stays a real zero.
    expect(mapMoverRow({ ...row, avgvol_1d: -1 })!.volume).toBeNull();
    expect(mapMoverRow({ ...row, avgvol_1d: 0 })!.volume).toBe(0);
  });

  it('refuses a zero average, which is the denominator of the RVol ratio', () => {
    // Seen on newly listed names: the provider sends 0 where it has no
    // history to average. Dividing by it would render "∞×" on the board.
    expect(mapMoverRow({ ...row, avgvol_200d: 0 })!.averageVolume).toBeNull();
  });
});

describe('mapMoverRows', () => {
  const row = { code: 'MRNA', adjusted_close: 154.27, refund_1d_p: 9.93 };

  it('drops what it cannot read without invalidating the board', () => {
    // The opposite of mapEodBars, and deliberately: a chart is read as a whole
    // and a missing session changes its shape, while a board is a list.
    const rows = mapMoverRows({ data: [row, { code: 'ZZ' }, null] })!;
    expect(rows.map((r) => r.ticker)).toEqual(['MRNA']);
  });

  it('reads an empty board as a real answer — nothing cleared the filters', () => {
    expect(mapMoverRows({ data: [] })).toEqual([]);
  });

  it('refuses a body that is not a screener response', () => {
    expect(mapMoverRows(null)).toBeNull();
    expect(mapMoverRows([row])).toBeNull();
    expect(mapMoverRows({ error: 'nope' })).toBeNull();
    expect(mapMoverRows({ data: 'nope' })).toBeNull();
  });
});

describe('intradayUrl', () => {
  it('resolves the symbol and asks for the interval over a UNIX-second window', () => {
    // Unlike /api/eod, this endpoint takes timestamps rather than dates.
    const url = intradayUrl(' nvda ', '5m', 1788269400.7, 1788292800.2, 'k');
    expect(url.pathname).toBe('/api/intraday/NVDA.US');
    expect(url.searchParams.get('interval')).toBe('5m');
    expect(url.searchParams.get('from')).toBe('1788269400');
    expect(url.searchParams.get('to')).toBe('1788292800');
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('api_token')).toBe('k');
  });
});

describe('mapIntradayRow', () => {
  const row = {
    timestamp: 1788269400,
    gmtoffset: 0,
    datetime: '2026-09-01 13:30:00',
    open: 165.666,
    high: 166.649993,
    low: 163.089996,
    close: 163.270004,
    volume: 670716,
  };

  it('turns the provider datetime into an unambiguous UTC instant', () => {
    // "2026-09-01 13:30:00" with gmtoffset 0 is a UTC moment, and the app has
    // readers in another zone: written without the Z, a browser would parse it
    // as local time and shift the whole session by hours.
    expect(mapIntradayRow(row)).toEqual({
      d: '2026-09-01T13:30:00Z',
      o: 165.666,
      h: 166.649993,
      l: 163.089996,
      c: 163.270004,
      v: 670716,
    });
  });

  it("names the session's closing print rather than mapping or refusing it", () => {
    // Verified on five sessions across two symbols: the feed ends each one
    // with a zero-width bar at 20:00 UTC carrying no volume. It is the closing
    // price, not five minutes of trading, and it carries nothing its
    // neighbour does not.
    const print = {
      ...row,
      datetime: '2026-09-01 20:00:00',
      open: 166.61,
      high: 166.61,
      low: 166.61,
      close: 166.61,
      volume: null,
    };
    expect(mapIntradayRow(print)).toBe('closing-print');
  });

  it('refuses a missing volume on a bar that is not that print', () => {
    // Dropping these would quietly close a gap in the line.
    expect(mapIntradayRow({ ...row, volume: null })).toBeNull();
  });

  it('reserves the closing print for an explicit null, not for any non-number', () => {
    // A flat bar whose volume is absent or a string is a row we do not
    // understand. Calling it a closing print would drop it from the series
    // rather than refuse the response, which is the difference between a
    // series with a hole in it and an honest failure.
    const flat = { ...row, open: 166.61, high: 166.61, low: 166.61, close: 166.61 };
    expect(mapIntradayRow({ ...flat, volume: null })).toBe('closing-print');
    expect(mapIntradayRow({ ...flat, volume: undefined })).toBeNull();
    expect(mapIntradayRow({ ...flat, volume: '0' })).toBeNull();
    expect(mapIntradayRow({ ...flat, volume: NaN })).toBeNull();
  });

  it('keeps a genuinely quiet five minutes as a real zero', () => {
    expect(mapIntradayRow({ ...row, volume: 0 })).toMatchObject({ v: 0 });
  });

  it("applies the daily mapper's price rules", () => {
    expect(mapIntradayRow({ ...row, open: 999 })).toBeNull(); // open above the high
    expect(mapIntradayRow({ ...row, low: 0 })).toBeNull();
    expect(mapIntradayRow({ ...row, high: 1 })).toBeNull(); // high below the low
  });

  it('refuses a stamp that is not a real moment', () => {
    expect(mapIntradayRow({ ...row, datetime: '2026-02-31 13:30:00' })).toBeNull();
    expect(mapIntradayRow({ ...row, datetime: '2026-09-01 25:30:00' })).toBeNull();
    expect(mapIntradayRow({ ...row, datetime: '2026-09-01' })).toBeNull();
    expect(mapIntradayRow({ ...row, datetime: 1788269400 })).toBeNull();
    expect(mapIntradayRow(null)).toBeNull();
  });
});

describe('mapIntradayBars', () => {
  const at = (datetime: string, volume: number | null = 10) => ({
    datetime,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume,
  });

  it('drops the closing print and keeps the session, oldest first', () => {
    const bars = mapIntradayBars([
      at('2026-09-01 13:35:00'),
      at('2026-09-01 13:30:00'),
      at('2026-09-01 20:00:00', null),
    ])!;
    expect(bars.map((b) => b.d)).toEqual(['2026-09-01T13:30:00Z', '2026-09-01T13:35:00Z']);
  });

  it('reads an empty body as a real answer about the symbol', () => {
    expect(mapIntradayBars([])).toEqual([]);
  });

  it('refuses the whole series for one unreadable bar', () => {
    expect(mapIntradayBars([at('2026-09-01 13:30:00'), at('2026-09-01 13:35:00', -1)])).toBeNull();
  });

  it('refuses a body that is not a series', () => {
    expect(mapIntradayBars(null)).toBeNull();
    expect(mapIntradayBars({ error: 'nope' })).toBeNull();
  });
});

describe('latestSession', () => {
  const at = (d: string) => ({ d, o: 1, h: 1, l: 1, c: 1, v: 1 });

  it('keeps the last UTC day present, which needs no market calendar', () => {
    const kept = latestSession([
      at('2026-08-31T19:55:00Z'),
      at('2026-09-01T13:30:00Z'),
      at('2026-09-01T13:35:00Z'),
    ]);
    expect(kept.map((b) => b.d)).toEqual(['2026-09-01T13:30:00Z', '2026-09-01T13:35:00Z']);
  });

  it('has nothing to keep from nothing', () => {
    expect(latestSession([])).toEqual([]);
  });
});
