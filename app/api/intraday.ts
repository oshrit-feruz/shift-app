import { isValidTicker } from './_lib/news.js';
import { intradayUrl, latestSession, mapIntradayBars, type CandleRow } from './_lib/eodhd.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
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
 * WHAT THIS FIXES ON SCREEN. During a trading session the price in the stock
 * header moves — it is a live quote, re-read every thirty seconds — while the
 * chart under it did not, because its newest bar is the last completed
 * session and today's bar is only published after the close. A reader
 * watching a price tick against a chart that never moves is owed the day's
 * shape, and this is it.
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
 * Two minutes at the edge.
 *
 * Short because this is the one series in the app that is supposed to change
 * while someone is looking at it. Not shorter, because the bars are
 * five-minute ones: below the bar width a new request can only ever return
 * what the last one did, at five credits a time.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=120, stale-while-revalidate=600';

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
    // The same three outcomes /api/candles handles, for the same reason: a 404
    // is the provider naming the symbol rather than failing on it, and "no
    // intraday series for this symbol" may never read as "we could not find
    // out". The path is built from an already-validated ticker, so the symbol
    // is the only thing a 404 can be about.
    let bars: CandleRow[] | null;
    if (result.ok) {
      bars = mapIntradayBars(result.body);
    } else if (result.failure.upstreamStatus === 404) {
      bars = [];
    } else {
      return res.status(result.failure.status).json(failureBody(result.failure));
    }
    if (bars === null) {
      console.error('/api/intraday: upstream response had an unexpected shape');
      return res.status(502).json({
        error: 'bad_response',
        message: 'The intraday provider returned an unexpected shape.',
      });
    }

    const session = latestSession(bars);
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
