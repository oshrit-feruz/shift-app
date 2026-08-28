/**
 * LIVE data source — daily price history, read from a mirror.
 *
 * This is what turned the charts real. Everything the stock page's chart and
 * the movers' sparklines draw comes from here: actual sessions with actual
 * open/high/low/close/volume, published once a day by
 * .github/workflows/mirror-prices.yml (via scripts/mirror-prices.mjs) and
 * served as a static file from the app's own origin.
 *
 * WHY A MIRROR RATHER THAN A LIVE CALL:
 * The same reason the screener is mirrored, plus a harder one. Alpha Vantage's
 * free key allows tens of requests a day and must stay server-side, so the
 * browser cannot call it at all — one visitor walking a few stock pages would
 * spend the day's allowance for everyone. Daily bars change once a day by
 * definition, so there is nothing to be fresh about in between.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER:
 * Anything shorter than a day. A daily series can honestly draw a week, a
 * month, a quarter or a year; it cannot draw an intraday chart, and the stock
 * page's timeframe row therefore offers no 1D — see TIMEFRAMES there. Adding
 * one means an intraday source, not a smaller slice of this one.
 *
 * DATA HONESTY CONTRACT, matching data/recoveryDetector.ts:
 * - A ticker with no published file is ok(null): "we have no history for this
 *   symbol" is a real, common answer (MDA trades in Toronto and the provider
 *   has no US tape for it), not a failure, and the chart says so plainly.
 * - Any other failure — network, timeout, non-2xx, unparseable body, a shape
 *   we do not recognise, a series too stale to trust — is 'unavailable'.
 *   There is no demo fallback: a seeded random walk drawn where real price
 *   action should be is the exact lie this file exists to remove.
 * - Nothing is interpolated. A gap in the sessions is drawn as the gap it is.
 */

import { cachedLoadable } from './loadableCache';
import { ok, unavailable, type Bar, type Loadable } from './types';
import covered from './coveredTickers.json';

/** The tickers the mirror publishes, shared with the publisher script. */
export const COVERED_TICKERS: readonly string[] = covered.tickers;

/** Where one ticker's published history lives, relative to the app's origin. */
export const seriesUrl = (ticker: string): string =>
  `/data/series/${encodeURIComponent(ticker.trim().toUpperCase())}.json`;

/** A same-origin static file that takes this long is broken by any measure. */
const TIMEOUT_MS = 15_000;

/**
 * How stale the newest session may be before the history stops being drawn.
 *
 * Deliberately more forgiving than the screener's four days. `as_of` is the
 * last *trading* session, so a Friday close read on the Tuesday after a Monday
 * holiday is already four days old with nothing wrong; stack a second holiday
 * and a correct file would fail a four-day gate. The asymmetry is also about
 * what the number is for: a stale "last price" is presented as today's and
 * misleads directly, while a year of real sessions missing its last few is
 * still an honest year of history. Beyond a week, though, the mirror is broken
 * rather than merely quiet, and a broken mirror must look broken.
 */
export const MAX_SERIES_AGE_DAYS = 7;

/** As in the screener mirror: a day of slack for a viewer's clock, no more. */
const MAX_FUTURE_SKEW_DAYS = 1;

/**
 * How long a read is shared before the file is fetched again.
 *
 * The movers screen renders one sparkline per row and the stock page reads
 * the same ticker again on arrival, so without this a single visit is a
 * download per row and every re-mount repeats them. The published file only
 * changes once a day, so a few minutes of sharing costs nothing in freshness.
 */
const SERIES_CACHE_MS = 5 * 60_000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Map one published row into a Bar, or null when it is not one.
 *
 * The publisher already enforces this shape, so a row failing here means the
 * file was written by something else or corrupted in transit. Either way the
 * honest response is to refuse it, not to draw whatever survived: a chart is
 * read as a whole, and a series with silently dropped sessions is a picture of
 * price action that never happened.
 */
function mapBar(raw: unknown): Bar | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const { d, o, h, l, c, v } = row;
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!isNum(o) || !isNum(h) || !isNum(l) || !isNum(c) || !isNum(v)) return null;
  if (h < l) return null;
  return { date: d, open: o, high: h, low: l, close: c, volume: v };
}

/**
 * Pull the bars out of a published file, or null when the body is not one.
 *
 * Returns null rather than an empty array for an empty `bars` list: a
 * published file with no sessions in it is a broken publish, not a ticker
 * that has never traded, and the two must not render the same.
 */
export function extractBars(body: unknown): Bar[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).bars;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const bars: Bar[] = [];
  for (const row of raw) {
    const bar = mapBar(row);
    // One unreadable row invalidates the file — see mapBar.
    if (!bar) return null;
    bars.push(bar);
  }
  // The publisher sorts, but the reader is what the chart trusts: a series
  // drawn out of order is a jagged fiction that looks like volatility.
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}

/**
 * Whole days between a YYYY-MM-DD stamp and now, in UTC, or null when the
 * stamp is missing or is not a real calendar date.
 *
 * Same shape and the same round-trip check as snapshotAgeDays in
 * recoveryDetector.ts, and for the same reason: Date.UTC rolls an impossible
 * date forward, which yields a negative age that sails straight past the
 * staleness gate.
 */
export function seriesAgeDays(asOf: unknown, now: Date = new Date()): number | null {
  if (typeof asOf !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamped = Date.UTC(year, month - 1, day);
  const back = new Date(stamped);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - stamped) / 86_400_000);
}

/**
 * One ticker's published history. Never throws.
 *
 * ok(null) means "no history published for this symbol" — a real answer, and
 * distinct from 'unavailable', which means the app could not find out.
 */
export async function fetchDailySeries(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<Bar[] | null>> {
  // Only the default fetch is cached; an injected test fetchImpl goes straight
  // through, so tests keep their isolation without touching cache state. The
  // key carries the ticker because each one has its own file.
  return fetchImpl === fetch
    ? cachedLoadable(`series:${ticker.trim().toUpperCase()}`, SERIES_CACHE_MS, () =>
        readSeries(ticker, fetch, now),
      )
    : readSeries(ticker, fetchImpl, now);
}

/** The uncached read. Never throws. */
async function readSeries(
  ticker: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<Loadable<Bar[] | null>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(seriesUrl(ticker), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    // The mirror publishes a file per covered ticker and nothing for the rest,
    // so a 404 is the ordinary way "not covered" arrives. It is a fact about
    // the symbol, not a fault, and retrying it forever would be pointless.
    if (res.status === 404) return ok(null);
    if (!res.ok) return unavailable();

    const body: unknown = await res.json();
    const bars = extractBars(body);
    if (bars === null) return unavailable();

    // Shape first, then age — so a malformed file is reported as malformed
    // rather than sending someone chasing a staleness problem it does not have.
    const age = seriesAgeDays((body as Record<string, unknown>).as_of, now);
    if (age === null) {
      return unavailable({
        en: 'Price history is missing its date, so it cannot be trusted.',
        he: 'לנתוני ההיסטוריה חסר תאריך, ולכן אי אפשר להסתמך עליהם.',
      });
    }
    if (age > MAX_SERIES_AGE_DAYS) {
      return unavailable({
        en: `Price history ends ${age} days ago, so it is no longer current.`,
        he: `היסטוריית המחירים מסתיימת לפני ${age} ימים, ולכן אינה עדכנית.`,
      });
    }
    if (age < -MAX_FUTURE_SKEW_DAYS) {
      return unavailable({
        en: 'Price history is dated in the future, so it cannot be trusted.',
        he: 'היסטוריית המחירים מתוארכת לעתיד, ולכן אי אפשר להסתמך עליה.',
      });
    }

    return ok(bars);
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}
