import { describe, expect, it } from 'vitest';
import { mapHistoryRow, parseCalendarCsv, readApiError, readTiming, splitCsvLine, withinRange } from './alphavantage.js';

describe('readApiError', () => {
  // These arrive with HTTP 200. Missed, they read as an empty result — so the
  // app would answer "no reports" from a body that contained no data at all.
  it.each([
    ['the daily quota', { Information: 'We have detected your API key... 25 requests per day' }, 'rate_limited'],
    ['the per-minute throttle', { Note: 'Our standard API rate limit is 5 calls per minute' }, 'rate_limited'],
    ['a premium-only endpoint', { Information: 'Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe to any of the premium plans...' }, 'plan_required'],
    ['a rejected call', { 'Error Message': 'Invalid API call.' }, 'rejected'],
  ])('classifies %s', (_label, body, kind) => {
    expect(readApiError(body)?.kind).toBe(kind);
  });

  // The trap: the quota notice also invites you to "subscribe to any of the
  // premium plans", so matching the word "premium" reported every spent
  // quota as a subscription problem. One waits until tomorrow; the other
  // never resolves itself.
  it('does not read the quota notice as a plan requirement, though it says "premium"', () => {
    const quota = {
      Information:
        'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans to instantly remove all daily rate limits.',
    };
    expect(readApiError(quota)?.kind).toBe('rate_limited');
  });

  it.each([
    ['a real payload', { symbol: 'IBM', quarterlyEarnings: [] }],
    ['an array', [1, 2]],
    ['null', null],
    ['a string', 'text'],
  ])('returns null for %s', (_label, body) => {
    expect(readApiError(body)).toBeNull();
  });
});

describe('readTiming', () => {
  it.each([
    ['pre-market', 'BMO'],
    ['post-market', 'AMC'],
    ['BMO', 'BMO'],
    ['amc', 'AMC'],
  ])('maps %s', (input, expected) => {
    expect(readTiming(input)).toBe(expected);
  });

  // Guessing a side would put a real number next to an invented fact about
  // when it lands.
  it.each([['during-market'], [''], [null], [42]])('leaves %s null rather than guessing', (v) => {
    expect(readTiming(v)).toBeNull();
  });
});

describe('splitCsvLine', () => {
  it('keeps a comma inside a quoted field', () => {
    expect(splitCsvLine('BRK-B,"BERKSHIRE HATHAWAY, INC",2026-08-26')).toEqual([
      'BRK-B', 'BERKSHIRE HATHAWAY, INC', '2026-08-26',
    ]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(splitCsvLine('A,"say ""hi""",B')).toEqual(['A', 'say "hi"', 'B']);
  });

  it('keeps empty fields in position', () => {
    expect(splitCsvLine('A,,C')).toEqual(['A', '', 'C']);
  });
});

const HEADER = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay';

describe('parseCalendarCsv', () => {
  it('maps a row, leaving the figures a scheduled report cannot have as null', () => {
    const rows = parseCalendarCsv(`${HEADER}\nADSK,AUTODESK,2026-08-27,2026-07-31,2.35,USD,post-market`);
    expect(rows).toEqual([
      { ticker: 'ADSK', reportDate: '2026-08-27', periodEnd: '2026-07-31', timing: 'AMC', actual: null, estimate: 2.35, surprisePct: null },
    ]);
  });

  // Reading by header name rather than position: a provider that inserts a
  // column would otherwise shift every field, and a calendar full of
  // plausible wrong dates is worse than no calendar at all.
  it('follows the header when the column order changes', () => {
    const rows = parseCalendarCsv('reportDate,symbol\n2026-08-27,ADSK');
    expect(rows?.[0]).toMatchObject({ ticker: 'ADSK', reportDate: '2026-08-27' });
  });

  it('returns null when the columns it needs are absent', () => {
    expect(parseCalendarCsv('name,estimate\nAUTODESK,2.35')).toBeNull();
    expect(parseCalendarCsv('')).toBeNull();
  });

  it('keeps the good rows when only some are unusable', () => {
    const rows = parseCalendarCsv(
      `${HEADER}\nADSK,AUTODESK,2026-02-31,2026-07-31,2.35,USD,post-market\nNVDA,NVIDIA,2026-08-27,2026-07-31,1.18,USD,post-market`,
    );
    expect(rows?.map((r) => r.ticker)).toEqual(['NVDA']);
  });

  // Found by calling the real provider: when it rejects a key on the CSV
  // route it answers 200 with the real header and one junk line. Parsed
  // leniently that is zero rows, and the app would have said "no companies
  // report this week" on the strength of a rejection.
  it('refuses to read an all-unusable body as an empty week', () => {
    expect(parseCalendarCsv(`${HEADER}\nI,n,f,o,r,m,a`)).toBeNull();
    expect(parseCalendarCsv(`${HEADER}\nADSK,AUTODESK,2026-02-31,2026-07-31,2.35,USD,post-market`)).toBeNull();
  });

  // A header with nothing under it is a real answer: some weeks are quiet.
  it('reads a header with no data lines as a genuinely empty week', () => {
    expect(parseCalendarCsv(HEADER)).toEqual([]);
  });

  it('survives CRLF line endings and a trailing newline', () => {
    const rows = parseCalendarCsv(`${HEADER}\r\nADSK,AUTODESK,2026-08-27,2026-07-31,2.35,USD,post-market\r\n`);
    expect(rows).toHaveLength(1);
  });
});

describe('mapHistoryRow', () => {
  const ROW = {
    fiscalDateEnding: '2026-06-30', reportedDate: '2026-07-22', reportedEPS: '2.93',
    estimatedEPS: '2.90', surprise: '0.03', surprisePercentage: '1.0345', reportTime: 'post-market',
  };

  it('maps the reported figures', () => {
    expect(mapHistoryRow('IBM', ROW)).toEqual({
      ticker: 'IBM', reportDate: '2026-07-22', periodEnd: '2026-06-30',
      timing: 'AMC', actual: 2.93, estimate: 2.90, surprisePct: 1.0345,
    });
  });

  // Upstream writes "None" for a quarter with no consensus; coercing that to
  // 0 would render a fabricated estimate next to a real result.
  it('leaves an absent estimate null rather than zero', () => {
    expect(mapHistoryRow('IBM', { ...ROW, estimatedEPS: 'None' })?.estimate).toBeNull();
  });

  it.each([
    ['no report date', { ...ROW, reportedDate: undefined }],
    ['an impossible report date', { ...ROW, reportedDate: '2026-02-31' }],
    ['not an object', 'nope'],
  ])('drops a row with %s', (_label, row) => {
    expect(mapHistoryRow('IBM', row)).toBeNull();
  });
});

describe('withinRange', () => {
  const row = (reportDate: string) => ({
    ticker: 'X', reportDate, periodEnd: null, timing: null, actual: null, estimate: null, surprisePct: null,
  });

  it('includes both ends of the window', () => {
    const rows = [row('2026-08-23'), row('2026-08-24'), row('2026-08-27'), row('2026-08-30'), row('2026-08-31')];
    expect(withinRange(rows, '2026-08-24', '2026-08-30').map((r) => r.reportDate)).toEqual([
      '2026-08-24', '2026-08-27', '2026-08-30',
    ]);
  });
});
