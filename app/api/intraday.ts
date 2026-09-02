import { isValidTicker } from './_lib/news.js';
import { intradayUrl, latestSession, mapIntradayBars, type CandleRow } from './_lib/eodhd.js';
import { barsFromUpstream } from './_lib/bars.js';
import { fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * The trading day, five minutes at a time: GET /api/intraday?symbol=NVDA
 *
 * What the stock chart's 1D tab draws. That tab did not exist, and its absence
 * was the honest answer to a real limit: every chart in the app is built on
 * daily bars, one point per session, so a day was a single dot and a "1D" tab
 * could only have been filled by inventing the path between yesterday's close
 * and today's. The plan carries intraday history, so the path is now
 * available rather than imagined.
 *
 * WHAT IT SHOWS, AND WHAT IT DOES NOT. The last COMPLETED session's shape, at
 * five-minute resolution — not the running day's. That limit is the feed's,
 * measured rather than assumed: on 2026-09-02, thirty minutes into the open US
 * session, this endpoint answered with the previous session and returned an
 * empty array for every window inside the running day, at both 5m and 1m,
 * probed against the provider directly. Nine readings a minute apart never
 * moved. So the chart's 1D tab draws yesterday's path and says so, exactly as
 * the movers board does; it is still the day's shape the daily series cannot
 * draw, and it is still not today's.
 *
 * WHAT WOULD MAKE IT TODAY'S: the live quote already is (Finnhub, measured at
 * 11-42 seconds behind the tape in the same run), and EODHD's WebSocket is
 * real-time on this plan — but a socket needs a process that stays up, which
 * a serverless function is not. See docs/eodhd-plan-decision.md.
 *
 * FIVE MINUTES, NOT ONE. The plan carries 1m too, but one session of 5m bars
 * is 79 points — a legible line on a phone — where 1m is 390 for the same
 * picture, at the same cost in credits. 1m becomes worth asking for if the
 * chart ever zooms.
 *
 * COST. The intraday endpoint bills 5 credits per request against a 100k/day
 * allowance, so this caches at the edge and the client shares one read; see
 * CACHE_CONTROL below for the window and why.
 *
 * DATA HONESTY CONTRACT, the same one /api/candles keeps:
 *   - Real five-minute bars, or nothing. Nothing is interpolated and a gap in
 *     the session is served as the gap it is.
 *   - `session` names the UTC day the bars belong to, so the screen can say
 *     which session it is drawing rather than implying it is today's.
 *   - `bars: []` means the provider has no intraday series for this symbol —
 *     the normal answer for a listing it does not carry intraday, and a real
 *     one, rendered as "no series", never as an error.
 *   - Any failure is an error status with a code, never an empty series.
 */

/** Upstream budget. One session of five-minute bars is a small body. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/** See the module comment: 79 bars a session rather than 390. */
const INTERVAL = '5m' as const;

/**
 * How far back one request asks, in days.
 *
 * Wider than the one session it returns, and deliberately: the route has no
 * market calendar, so it asks for a window certain to contain a completed
 * session — a long weekend plus a holiday — and then keeps the last one
 * present (see latestSession). Four days would fail on the Tuesday after a
 * Monday holiday; six clears every US market closure.
 */
export const LOOKBACK_DAYS = 6;

/**
 * An hour at the edge, and that number is a measurement rather than a guess.
 *
 * This was two minutes, on the assumption that an intraday feed publishes
 * intraday. It does not, on this plan. Measured on 2026-09-02 against the open
 * US session: thirty minutes after the 13:30 UTC open, `/api/intraday` for
 * QCOM and AAPL still answered with the PREVIOUS session and nothing else —
 * an empty array for any window inside the running day, at 5m and at 1m alike,
 * confirmed against the provider directly and not through this route's cache.
 * Nine readings a minute apart never moved.
 *
 * So a two-minute TTL was spending five credits to be told the same thing
 * about a day that had not been published yet. An hour matches /api/candles,
 * whose source publishes on the same schedule, and the evening's new session
 * still lands promptly.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';

export interface IntradayBody {
  symbol: string;
  interval: typeof INTERVAL;
  /** The UTC day the bars belong to, or null when there are none. */
  session: string | null;
  source: string;
  bars: CandleRow[];
}

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();

    const symbol = one(req.query.symbol);
    if (!symbol || !isValidTicker(symbol)) {
      return res
        .status(400)
        .json({ error: 'invalid_ticker', message: 'Query param "symbol" is required and must be a ticker.' });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/intraday: EODHD_API_KEY is not set');
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'Intraday history is not configured.' });
    }

    const now = Date.now();
    const result = await fetchUpstreamJson(
      intradayUrl(
        symbol,
        INTERVAL,
        (now - LOOKBACK_DAYS * 86_400_000) / 1000,
        // Rounded up to the next whole second so a bar stamped this instant is
        // inside the window rather than one tick outside it.
        Math.ceil(now / 1000),
        apiKey,
      ),
      timeoutMs,
      'intraday history',
      '/api/intraday',
      fetchImpl,
    );
    // The same three outcomes /api/candles handles, through the same step: a
    // 404 here is the provider saying it carries no intraday series for this
    // symbol, which may never read as "we could not find out".
    const outcome = barsFromUpstream(result, mapIntradayBars, '/api/intraday');
    if (!outcome.ok) return res.status(outcome.status).json(outcome.body);

    const session = latestSession(outcome.bars);
    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json({
      symbol: symbol.toUpperCase(),
      interval: INTERVAL,
      session: session.length === 0 ? null : session[0].d.slice(0, 10),
      source: 'eodhd:intraday',
      bars: session,
    } satisfies IntradayBody);
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
