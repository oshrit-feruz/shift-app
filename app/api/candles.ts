import { isValidTicker } from './_lib/news.js';
import { eodUrl, isoDay, mapEodBars, type CandleRow } from './_lib/eodhd.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Daily price history: GET /api/candles?symbol=NVDA&days=400
 *
 * What the charts draw. This replaced a mirror — a GitHub Action that fetched
 * ten tickers' bars once a night and committed them into the repo as static
 * files — which was only ever a workaround for a provider that could not be
 * called on demand, and which had stopped publishing anything at all after
 * Alpha Vantage moved full daily history behind a subscription. A route can
 * serve any symbol the user opens, not just the ten someone listed in
 * advance, and it cannot silently go a week without publishing.
 *
 * WHY EODHD AND NOT FINNHUB, WHICH STILL SERVES THE QUOTES: Finnhub keeps
 * /stock/candle for its paid tiers, so on this app's free key every chart in
 * the app answered 403 and rendered "this subscription may not include this
 * data" — honest, and still a dark chart. The account's EODHD plan
 * (EOD+Intraday, All World Extended) covers daily OHLCV with volume, for US
 * and non-US exchanges alike, and EODHD_API_KEY is already set server-side
 * for /api/news. The quotes above the chart stay on Finnhub deliberately:
 * EODHD's REST quote is the delayed one its plan advertises (measured 15-19
 * minutes behind on an open exchange), so consolidating the two would trade
 * a live price for a stale one.
 *
 * DATA HONESTY CONTRACT:
 *   - Real sessions, or nothing. Gaps are served as the gaps they are and
 *     nothing is interpolated.
 *   - `bars: []` means the provider genuinely has no series for this symbol —
 *     a real answer, rendered as "no history for this symbol", not an error.
 *   - Any failure is an error status with a code, never an empty series: "no
 *     history" and "we could not find out" must not read the same.
 *   - Raw prices, not split- or dividend-adjusted ones. See _lib/eodhd.ts for
 *     why an adjusted candle would mean three prices nobody traded at.
 */

/** Upstream budget. A year of daily bars is a small body. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * The window, in calendar days, that one request may ask for.
 *
 * The longest timeframe the stock screen draws is a year — 252 sessions,
 * which needs about 365 calendar days — and the default leaves room for the
 * holidays and weekends inside it. The ceiling is five years, which is more
 * than any current screen asks for and still one bounded response.
 */
export const DEFAULT_DAYS = 400;
export const MAX_DAYS = 1_830;

/** Parse and bound the `days` parameter. */
export function parseDays(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAYS;
  if (!/^\d{1,5}$/.test(raw.trim())) return null;
  const days = Number(raw.trim());
  if (days < 1 || days > MAX_DAYS) return null;
  return days;
}

/** The response body, kept in the shape the app's chart reader expects. */
export interface CandlesBody {
  ticker: string;
  /** The newest session in the series, or null when there are none. */
  as_of: string | null;
  source: string;
  bars: CandleRow[];
}

export function buildBody(ticker: string, bars: CandleRow[]): CandlesBody {
  return {
    ticker,
    as_of: bars.length > 0 ? bars[bars.length - 1].d : null,
    source: 'eodhd:eod',
    bars,
  };
}

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    for (const key of ['symbol', 'days'] as const) {
      const v = req.query[key];
      if (Array.isArray(v) && v.length > 1) {
        return res
          .status(400)
          .json({ error: 'repeated_param', message: `Query param "${key}" must be given once.` });
      }
    }
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();

    const symbol = one(req.query.symbol);
    if (!symbol || !isValidTicker(symbol)) {
      return res
        .status(400)
        .json({ error: 'invalid_ticker', message: 'Query param "symbol" is required and must be a ticker.' });
    }
    const days = parseDays(one(req.query.days));
    if (days === null) {
      return res
        .status(400)
        .json({ error: 'invalid_range', message: `Query param "days" must be between 1 and ${MAX_DAYS}.` });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/candles: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Price history is not configured.' });
    }

    // Calendar days back from today, in UTC — the same unit `days` has always
    // meant, now expressed as the dates this provider takes. The window is
    // wider than the sessions it contains (weekends and holidays fall inside
    // it), which is why the client asks for 400 days to draw 252 sessions.
    const today = new Date();
    const to = isoDay(today);
    const from = isoDay(new Date(today.getTime() - days * 86_400_000));
    const result = await fetchUpstreamJson(
      eodUrl(symbol, from, to, apiKey),
      timeoutMs,
      'price history',
      '/api/candles',
      fetchImpl,
    );
    // Three outcomes, and the middle one is the whole reason this is not a
    // plain `if (!result.ok) return`. A 404 is the provider naming the symbol
    // rather than failing on it: EODHD answers one for a ticker it does not
    // carry, where Finnhub answered 200 with `s: 'no_data'`. Both mean the
    // same thing, and this route has always reported it the same way — an
    // empty series, which the app renders as "no price history for this
    // symbol". Passed to the classifier it became "unavailable" instead,
    // which tells the reader we could not find out when in fact we were told,
    // and those two may never collapse. The path is built here from an
    // already-validated ticker, so the symbol is the only thing a 404 can be
    // about.
    let bars: CandleRow[] | null;
    if (result.ok) {
      bars = mapEodBars(result.body);
    } else if (result.failure.upstreamStatus === 404) {
      bars = [];
    } else {
      return res.status(result.failure.status).json(failureBody(result.failure));
    }
    if (bars === null) {
      console.error('/api/candles: upstream response had an unexpected shape');
      return res.status(502).json({
        error: 'bad_response',
        message: 'The price-history provider returned an unexpected shape.',
      });
    }

    // Success only, and for an hour: a daily bar changes once a day, so the
    // only thing a shorter TTL buys is a faster view of today's still-forming
    // session — which the live quote above the chart already shows.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(buildBody(symbol.toUpperCase(), bars));
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
