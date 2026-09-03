/**
 * LIVE data source — daily price history, from /api/candles (EODHD).
 *
 * Everything the stock page's chart and the movers' sparklines draw comes
 * from here: actual sessions with actual open/high/low/close/volume, fetched
 * on demand for whichever ticker is being looked at.
 *
 * WHY A ROUTE RATHER THAN THE MIRROR IT REPLACED:
 * This used to read static files published nightly by a GitHub Action into
 * the repo — a workaround for a provider whose free key allowed tens of
 * requests a day and had to stay server-side, so the browser could not call
 * it at all. It had two costs that were paid daily. Only the ten tickers
 * someone listed in advance had a chart, and when the provider moved full
 * daily history behind a subscription the job stopped publishing anything at
 * all, which no screen could tell from a quiet market. A route serves any
 * symbol the reader opens and cannot silently stop.
 *
 * TWO PROVIDERS, ON PURPOSE: the bars come from EODHD and the live price
 * above them from Finnhub. The charts were dark for exactly this reason —
 * Finnhub keeps daily candles for its paid tiers and answered 403 — while
 * EODHD's paid plan covers daily OHLCV for US and non-US listings alike. The
 * quotes did not move with them: EODHD's REST quote is the delayed one its
 * plan advertises, so consolidating would trade a live price for a stale one.
 * A consequence worth knowing when reading a chart: its newest session and
 * the price in the header are different moments, and the prices are raw —
 * a split inside the window draws as the cliff the raw price actually made.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER:
 * Anything shorter than a day. A daily series can honestly draw a week, a
 * month, a quarter or a year; it cannot draw an intraday chart, and the stock
 * page's timeframe row therefore offers no 1D — see TIMEFRAMES there. Adding
 * one means an intraday resolution, not a smaller slice of this one.
 *
 * DATA HONESTY CONTRACT, matching data/quotes.ts:
 * - A ticker the provider has no series for is ok(null): "we have no history
 *   for this symbol" is a real, common answer (MDA trades in Toronto and the
 *   provider has no US tape for it), not a failure, and the chart says so.
 * - Any other failure — network, timeout, non-2xx, unparseable body, a shape
 *   we do not recognise, a series too stale to trust — is 'unavailable',
 *   carrying the provider's own reason when the route named one. There is no
 *   demo FALLBACK: a seeded random walk drawn where real price action should
 *   be is the exact lie this file exists to remove.
 * - Nothing is interpolated. A gap in the sessions is drawn as the gap it is.
 *
 * THE ONE EXCEPTION, and why it is not a hole in the above: demo mode. When
 * the reader turns on "sample data" in the More tab, this returns a generated
 * series (data/demoBars.ts) without asking the route at all. That is not a
 * fallback — it never triggers on failure, only on an explicit switch — and
 * the distinction is the whole point. The lie the contract forbids is an
 * invented number the reader takes for a real one; a reader who turned sample
 * data on is not taking it for anything.
 */

import { isCalendarDay, mapBarRow } from './barRow';
import { cachedLoadable } from './loadableCache';
import { DEMO_FLAGS } from './demoFlags';
import { demoBars } from './demoBars';
import { reasonFromResponse } from './providerReason';
import { ok, unavailable, type Bar, type Loadable } from './types';

/**
 * How much history one request asks for, in calendar days.
 *
 * The longest timeframe the stock screen draws is a year (252 sessions), and
 * 400 calendar days covers it with room for the weekends and holidays inside
 * it. Bounded here rather than left to the route's default so the two cannot
 * drift apart silently.
 */
const HISTORY_DAYS = 400;

/** Where one ticker's history comes from, relative to the app's own origin. */
export const seriesUrl = (ticker: string): string =>
  `/api/candles?symbol=${encodeURIComponent(ticker.trim().toUpperCase())}&days=${HISTORY_DAYS}`;

/** A history read that takes this long is broken by any measure. */
const TIMEOUT_MS = 20_000;

/** The generic reason, used when the route did not name a specific one. */
const FALLBACK_REASON = {
  en: 'Price history is unavailable right now.',
  he: 'היסטוריית המחירים אינה זמינה כרגע.',
};

/**
 * How stale the newest session may be before the history stops being drawn.
 *
 * Deliberately more forgiving than the screener's four days. `as_of` is the
 * last *trading* session, so a Friday close read on the Tuesday after a Monday
 * holiday is already four days old with nothing wrong; stack a second holiday
 * and a correct file would fail a four-day gate. The asymmetry is also about
 * what the number is for: a stale "last price" is presented as today's and
 * misleads directly, while a year of real sessions missing its last few is
 * still an honest year of history. Beyond a week, though, the feed is broken
 * rather than merely quiet, and a broken feed must look broken.
 */
export const MAX_SERIES_AGE_DAYS = 7;

/** As in the screener snapshot: a day of slack for a viewer's clock, no more. */
const MAX_FUTURE_SKEW_DAYS = 1;

/**
 * How long a read is shared before the route is asked again.
 *
 * The movers screen renders one sparkline per row and the stock page reads
 * the same ticker again on arrival, so without this a single visit is a
 * request per row and every re-mount repeats them — and each one spends the
 * provider's per-minute allowance. A daily bar only changes once a day, so a
 * few minutes of sharing costs nothing in freshness; the live price above the
 * chart is what moves, and that has its own much shorter window.
 */
const SERIES_CACHE_MS = 5 * 60_000;

/**
 * Pull the bars out of the route's response, or null when the body is not one.
 *
 * An empty `bars` list comes back as an empty array, not as null: on the
 * route it means the provider genuinely has no series for this symbol, which
 * the caller turns into ok(null) — "no history for this ticker" — and that is
 * a real answer rather than the unreadable-body case null stands for.
 */
export function extractBars(body: unknown): Bar[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).bars;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];

  const bars: Bar[] = [];
  for (const row of raw) {
    const bar = mapBarRow(row, isCalendarDay);
    // One unreadable row invalidates the file — see data/barRow.ts.
    if (!bar) return null;
    bars.push(bar);
  }
  // The route sorts, but the reader is what the chart trusts: a series drawn
  // out of order is a jagged fiction that looks like volatility.
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
 * One ticker's daily history. Never throws.
 *
 * ok(null) means "the provider has no history for this symbol" — a real
 * answer, and distinct from 'unavailable', which means the app could not find
 * out.
 */
export async function fetchDailySeries(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<Bar[] | null>> {
  // Demo mode short-circuits before the request, and only on the real fetch
  // path: an injected fetchImpl means a test, which asserts the route's own
  // behaviour and must not be handed a generated series instead.
  if (fetchImpl === fetch && DEMO_FLAGS.demoData) return ok(demoBars(ticker, now));
  return fetchRealDailySeries(ticker, fetchImpl, now);
}

/**
 * One ticker's daily history from the provider, with the sample-data switch
 * deliberately ignored. Never throws.
 *
 * The switch is ignored because of what the one caller does with these bars.
 * A manual portfolio's value through time is its own real ledger priced at
 * real closes; handing that ledger a seeded walk instead would draw invented
 * history under share counts the user actually typed — a plausible-looking
 * curve of a portfolio that never existed, which is the single thing this
 * app's data contract rules out. Every other reader wants the switch honoured
 * and should call `fetchDailySeries`.
 *
 * Both paths share one cache key, so a stock page and the portfolio curve pay
 * for a symbol's history once between them.
 */
export async function fetchRealDailySeries(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<Bar[] | null>> {
  // Only the default fetch is cached; an injected test fetchImpl goes straight
  // through, so tests keep their isolation without touching cache state. The
  // key carries the ticker because each one is its own request.
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

    // The route classifies its own failures — a plan that does not cover
    // candles, a spent quota, a provider timeout — and each needs different
    // words, so the reason is read from the body rather than flattened into
    // one message. Getting this right is what stops a 403 on an unpaid
    // endpoint from reading as "try again later", which it never will fix.
    if (!res.ok) return unavailable(await reasonFromResponse(res, FALLBACK_REASON));

    const body: unknown = await res.json();
    const bars = extractBars(body);
    if (bars === null) return unavailable(FALLBACK_REASON);
    // No sessions is the provider saying it has no series for this symbol. A
    // fact about the ticker, not a fault: the chart says "no history for this
    // symbol" rather than implying something failed.
    if (bars.length === 0) return ok(null);

    // Shape first, then age — so a malformed body is reported as malformed
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
    return unavailable(FALLBACK_REASON);
  } finally {
    clearTimeout(timer);
  }
}
