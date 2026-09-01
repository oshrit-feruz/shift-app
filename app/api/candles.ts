import { isValidTicker } from './_lib/news.js';
import { candleUrl, mapCandles, type CandleRow } from './_lib/finnhub.js';
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
 * ONE THING TO KNOW ABOUT THE PLAN: Finnhub serves /quote on a free key but
 * moved /stock/candle to its paid tiers, where a free key gets 403. That is
 * classified upstream as `upstream_forbidden` and reaches the reader as "this
 * subscription may not include this data" — the true sentence about it. The
 * charts light up the moment the key's plan includes candles, with no code
 * change; nothing here invents bars in the meantime.
 *
 * DATA HONESTY CONTRACT:
 *   - Real sessions, or nothing. Gaps are served as the gaps they are and
 *     nothing is interpolated.
 *   - `bars: []` means the provider genuinely has no series for this symbol —
 *     a real answer, rendered as "no history for this symbol", not an error.
 *   - Any failure is an error status with a code, never an empty series: "no
 *     history" and "we could not find out" must not read the same.
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

/**
 * Parses the requested history range and applies the configured default when omitted.
 *
 * @param raw - The raw `days` query parameter.
 * @returns The validated number of days, the default range when omitted, or `null` when invalid.
 */
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

/**
 * Builds a normalized candle response for a ticker.
 *
 * @param ticker - The uppercase ticker symbol
 * @param bars - The ticker's candle bars in chronological order
 * @returns The response body with the latest bar date, data source, and candle bars
 */
export function buildBody(ticker: string, bars: CandleRow[]): CandlesBody {
  return {
    ticker,
    as_of: bars.length > 0 ? bars[bars.length - 1].d : null,
    source: 'finnhub:stock/candle',
    bars,
  };
}

/**
 * Creates a request handler for retrieving validated candle history.
 *
 * @param timeoutMs - Maximum time allowed for the upstream price-history request
 * @param fetchImpl - Fetch implementation used for the upstream request
 * @returns A request handler for the candles API route
 */
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

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error('/api/candles: FINNHUB_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Price history is not configured.' });
    }

    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86_400;
    const result = await fetchUpstreamJson(
      candleUrl(symbol, from, to, apiKey),
      timeoutMs,
      'price history',
      '/api/candles',
      fetchImpl,
    );
    if (!result.ok) return res.status(result.failure.status).json(failureBody(result.failure));

    const bars = mapCandles(result.body);
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
