/**
 * Tests for the PUBLISHER, scripts/mirror-prices.mjs.
 *
 * It lives beside the reader's tests on purpose: the two are halves of one
 * contract, and the failure this suite exists to catch is them disagreeing —
 * the publisher writing something the app then refuses, which is exactly the
 * outcome the screener mirror's verification step was built to prevent. The
 * script's pure helpers are importable without touching the network; `main()`
 * only runs when the file is invoked directly.
 */
import { describe, expect, it } from 'vitest';
import {
  buildFile,
  isQuotaError,
  mapSeries,
  readApiError,
  serialise,
} from '../../../scripts/mirror-prices.mjs';
import { extractBars, seriesAgeDays } from './priceHistory';

const row = (o: string, h: string, l: string, c: string, v: string) => ({
  '1. open': o,
  '2. high': h,
  '3. low': l,
  '4. close': c,
  '5. volume': v,
});

const payload = (series: Record<string, unknown>) => ({ 'Time Series (Daily)': series });

describe('readApiError', () => {
  // This provider reports its own failures with HTTP 200 and a JSON body, so a
  // publisher that checked only the status would write an empty series over a
  // good file every time the quota ran out.
  it('finds the notice this provider hides a failure in', () => {
    expect(readApiError({ Note: 'Thank you for using Alpha Vantage!' })).toContain('Note');
    expect(readApiError({ Information: 'rate limit is 25 requests per day' })).toContain('Information');
    expect(readApiError({ 'Error Message': 'Invalid API call' })).toContain('Error Message');
  });

  it('passes a real payload through', () => {
    expect(readApiError(payload({}))).toBeNull();
  });
});

describe('isQuotaError', () => {
  // A spent quota must stop the run; an unknown symbol must only skip one
  // ticker. Reading the first as the second would burn the remaining calls on
  // responses that cannot succeed.
  it('separates "stop" from "skip this symbol"', () => {
    expect(
      isQuotaError('Note: Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests'),
    ).toBe(true);
    expect(isQuotaError('Error Message: Invalid API call')).toBe(false);
  });
});

describe('mapSeries', () => {
  it('returns bars oldest first', () => {
    const bars = mapSeries(
      payload({
        '2026-08-27': row('1', '2', '0.5', '1.5', '10'),
        '2026-08-25': row('1', '2', '0.5', '1.4', '11'),
      }),
    );
    expect(bars!.map((b) => b.d)).toEqual(['2026-08-25', '2026-08-27']);
  });

  it('drops a row it cannot read rather than publishing a half-bar', () => {
    const bars = mapSeries(
      payload({
        '2026-08-27': row('1', '2', '0.5', '1.5', '10'),
        '2026-08-26': row('1', '2', '0.5', 'n/a', '10'),
        '2026-08-25': row('1', '0.1', '9', '1.5', '10'), // high below low
      }),
    );
    expect(bars).toHaveLength(1);
  });

  it('is an unreadable body, not an empty history, when nothing maps', () => {
    expect(mapSeries(payload({}))).toBeNull();
    expect(mapSeries({})).toBeNull();
    expect(mapSeries({ 'Time Series (Daily)': [] })).toBeNull();
  });
});

describe('buildFile', () => {
  // `as_of` is what the app measures staleness against. Stamping it with the
  // day the job ran would let a series that stopped updating last week keep
  // passing the freshness gate forever.
  it('stamps as_of with the newest session, not the run date', () => {
    const bars = [
      { d: '2026-08-25', o: 1, h: 2, l: 1, c: 1.5, v: 1 },
      { d: '2026-08-27', o: 1, h: 2, l: 1, c: 1.5, v: 1 },
    ];
    expect(buildFile('NVDA', bars).as_of).toBe('2026-08-27');
  });
});

describe('what the publisher writes is what the reader accepts', () => {
  const bars = mapSeries(
    payload({
      '2026-08-27': row('232.80', '240.8065', '231.45', '238.79', '5505922'),
      '2026-08-26': row('230.10', '233.40', '229.00', '232.55', '4102338'),
    }),
  );
  const written = serialise(buildFile('IBM', bars!));

  it('round-trips through the reader with the same numbers', () => {
    const parsed = JSON.parse(written);
    const read = extractBars(parsed);
    expect(read).toEqual([
      { date: '2026-08-26', open: 230.1, high: 233.4, low: 229, close: 232.55, volume: 4102338 },
      { date: '2026-08-27', open: 232.8, high: 240.8065, low: 231.45, close: 238.79, volume: 5505922 },
    ]);
    // And the stamp the reader ages it by is one the reader can parse.
    expect(seriesAgeDays(parsed.as_of, new Date('2026-08-28T00:00:00Z'))).toBe(1);
  });

  // The file is rewritten and committed daily, so its diff is what a reviewer
  // reads. One bar per line keeps that diff to the session added and the one
  // that aged out.
  it('writes one bar per line', () => {
    const barLines = written.split('\n').filter((l) => l.trim().startsWith('{"d"'));
    expect(barLines).toHaveLength(2);
  });
});
