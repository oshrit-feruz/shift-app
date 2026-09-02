/**
 * LIVE data source — the trading day at five-minute resolution, from
 * /api/intraday (EODHD).
 *
 * What the stock chart's 1D tab draws. That tab did not exist: every chart in
 * the app is built on daily bars, one point per session, so a day was a single
 * dot and a "1D" could only have been filled by inventing the path between
 * yesterday's close and today's. The tab was absent rather than present and
 * lying; it is present now because the path is real.
 *
 * WHY IT MATTERS DURING A SESSION. The price in the stock header is a live
 * quote and re-reads every thirty seconds. The daily chart under it does not
 * move at all until the session closes and the provider publishes that day's
 * bar. This is the one series in the app meant to change while someone is
 * watching it, which is why it is the only one with a short cache and a
 * refresh interval behind it.
 *
 * DATA HONESTY CONTRACT, matching data/priceHistory.ts:
 * - ok(null) means the provider has no intraday series for this symbol — the
 *   normal answer for a listing it does not carry intraday, and a real one.
 *   The chart says "no series"; it does not report a failure.
 * - Any failure — network, timeout, non-2xx, unparseable body, a shape we do
 *   not recognise — is 'unavailable', carrying the route's own reason.
 * - Nothing is interpolated. A gap inside the session is drawn as the gap it
 *   is, and the closing print the feed appends (a zero-width bar with no
 *   volume) is dropped upstream rather than drawn as a five-minute session.
 *
 * NO DEMO BRANCH, unlike the daily series. See fetchIntradaySeries.
 */

import { cachedLoadable } from './loadableCache';
import { isInstant, mapBarRow } from './barRow';
import { readRoute } from './readRoute';
import { ok, type Bar, type Loadable } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const INTRADAY_URL = '/api/intraday';

/** A read that takes this long is broken by any measure. */
const TIMEOUT_MS = 20_000;

/**
 * How long one session's bars are shared.
 *
 * Two minutes, matching the route's edge cache. Short because this series is
 * supposed to move while the page is open; not shorter because the bars are
 * five-minute ones and the request costs five credits, so asking more often
 * than the bar width can only return what the last read did.
 */
export const INTRADAY_CACHE_MS = 2 * 60_000;

/** How often the chart re-reads while the 1D tab is on screen. */
export const INTRADAY_REFRESH_MS = INTRADAY_CACHE_MS;

const FALLBACK_REASON = {
  en: "Today's price history is unavailable right now.",
  he: 'היסטוריית המחירים של היום אינה זמינה כרגע.',
};

/**
 * Pull the session's bars out of the route's response, or null when the body
 * is not one.
 *
 * An empty list comes back as an empty array rather than null: on the route it
 * means the provider genuinely has no intraday series for this symbol, which
 * the caller turns into ok(null).
 */
export function extractIntradayBars(body: unknown): Bar[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).bars;
  if (!Array.isArray(raw)) return null;

  const bars: Bar[] = [];
  for (const row of raw) {
    const bar = mapBarRow(row, isInstant);
    // One unreadable bar invalidates the session — see data/barRow.ts.
    if (bar === null) return null;
    bars.push(bar);
  }
  // The route sorts, but the reader is what the chart trusts: a series drawn
  // out of order is a jagged fiction that looks like volatility.
  bars.sort((a, z) => a.date.localeCompare(z.date));
  return bars;
}

/**
 * The most recent session's bars for one ticker, or null when the provider
 * carries none. Never throws.
 *
 * NOT GATED ON THE SAMPLE-DATA SWITCH, unlike fetchDailySeries. That gate
 * exists for figures with nothing real behind them, and this has a real
 * source for any symbol. The consequence is a deliberate one and the stock
 * screen acts on it: with sample data ON the daily tabs draw a generated walk,
 * so offering a real 1D beside them would put two incompatible pictures under
 * one set of chips — the tab is hidden in that position rather than
 * contradicting its neighbours.
 */
export async function fetchIntradaySeries(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<Bar[] | null>> {
  const clean = ticker.trim().toUpperCase();
  if (clean === '') return ok(null);
  return fetchImpl === fetch
    ? cachedLoadable(`intraday:${clean}`, INTRADAY_CACHE_MS, () => readIntraday(clean, fetch))
    : readIntraday(clean, fetchImpl);
}

/**
 * The uncached read. Never throws — see data/readRoute.ts.
 *
 * The one thing done here rather than there: an empty session is turned into
 * ok(null), because "the provider has no intraday series for this symbol" is
 * what the chart renders as "no series" — a real answer about the symbol, and
 * not the same as a failure.
 */
async function readIntraday(ticker: string, fetchImpl: typeof fetch): Promise<Loadable<Bar[] | null>> {
  const read = await readRoute(
    `${INTRADAY_URL}?symbol=${encodeURIComponent(ticker)}`,
    { timeoutMs: TIMEOUT_MS, fallbackReason: FALLBACK_REASON, extract: extractIntradayBars },
    fetchImpl,
  );
  if (read.status !== 'ok') return read;
  return ok(read.data.length === 0 ? null : read.data);
}
