import { isValidTicker } from './_lib/news.js';
import { mapUsStats, readUsQuoteData, resolveSymbol, usQuoteUrl, type UsStats } from './_lib/eodhd.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Key statistics for one US stock: GET /api/stats?symbol=QCOM
 *
 * What the stock page's key-stats grid reads. Until this route existed that
 * grid was the last place in the app where invented figures sat beside real
 * ones: market cap and P/E came from the prototype's ten-row sample table
 * (the same "4.45T" for NVIDIA whatever NVIDIA was actually worth), forward
 * P/E was literally `pe * 0.62`, and beta, dividend yield and short float
 * were string constants — the same 2.14, 0.02% and 1.1% under every ticker
 * in the app.
 *
 * WHY A DELAYED FEED IS THE RIGHT SOURCE HERE, when the app refuses one for
 * prices: these are quantities that move on the scale of quarters. A market
 * cap fifteen minutes old is the same market cap. The live price stays on
 * Finnhub and this route deliberately maps no price at all, so nothing here
 * can end up beside the header's live one claiming to be the same moment.
 *
 * US ONLY, AND HONEST ABOUT IT. The endpoint covers US listings; a Toronto
 * or London symbol is simply absent from its response. The app renders those
 * rows as "—" rather than borrowing a number from somewhere else.
 *
 * DATA HONESTY CONTRACT:
 *   - `stats: null` means the provider has no extended quote for this symbol
 *     — a real answer about the symbol, rendered as dashes, not an error.
 *   - Individual nulls inside `stats` are real too: an ETF has no P/E and a
 *     company that pays nothing has no dividend yield. Never zero for either.
 *   - Any failure is an error status with a code, never an empty payload:
 *     "we have nothing for this symbol" and "we could not find out" must not
 *     read the same.
 */

/** Upstream budget. One symbol's snapshot is a small body. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

/** The response body, in the shape the app's reader expects. */
export interface StatsBody {
  ticker: string;
  source: string;
  /** Null when this provider carries no extended quote for the symbol. */
  stats: UsStats | null;
}

/**
 * Whether this endpoint could possibly answer for a symbol.
 *
 * It is a US-equities endpoint, so a symbol resolving to any other exchange
 * is a request we already know the answer to. Short-circuiting spends no API
 * call to be told nothing, and — more to the point — gives the reader the
 * same honest "—" a round trip would have produced.
 */
export function isUsSymbol(symbol: string): boolean {
  return resolveSymbol(symbol).endsWith('.US');
}

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    const raw = req.query.symbol;
    if (Array.isArray(raw) && raw.length > 1) {
      return res
        .status(400)
        .json({ error: 'repeated_param', message: 'Query param "symbol" must be given once.' });
    }
    const symbol = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!symbol || !isValidTicker(symbol)) {
      return res
        .status(400)
        .json({ error: 'invalid_ticker', message: 'Query param "symbol" is required and must be a ticker.' });
    }
    const ticker = symbol.toUpperCase();

    // Cached like a success, because it is one: the answer for a non-US
    // symbol is a fact about the symbol and will not change on a retry.
    if (!isUsSymbol(symbol)) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
      return res.status(200).json(body(ticker, null));
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/stats: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Key statistics are not configured.' });
    }

    const result = await fetchUpstreamJson(
      usQuoteUrl([symbol], apiKey),
      timeoutMs,
      'key statistics',
      '/api/stats',
      fetchImpl,
    );
    if (!result.ok) return res.status(result.failure.status).json(failureBody(result.failure));

    const data = readUsQuoteData(result.body);
    if (data === null) {
      console.error('/api/stats: upstream response had an unexpected shape');
      return res.status(502).json({
        error: 'bad_response',
        message: 'The key-statistics provider returned an unexpected shape.',
      });
    }

    // The map is keyed by the symbol as it was asked for, and a symbol the
    // provider does not carry is absent from it entirely.
    const row = data[resolveSymbol(symbol)];
    if (row === undefined) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
      return res.status(200).json(body(ticker, null));
    }

    const stats = mapUsStats(row);
    if (stats === null) {
      console.error('/api/stats: upstream row was not an object');
      return res.status(502).json({
        error: 'bad_response',
        message: 'The key-statistics provider returned an unexpected shape.',
      });
    }

    // Fifteen minutes: these figures move on the scale of quarters, and the
    // feed behind them is itself delayed by about as long, so a shorter TTL
    // would spend requests to re-fetch the same numbers.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(body(ticker, stats));
  };
}

function body(ticker: string, stats: UsStats | null): StatsBody {
  return { ticker, source: 'eodhd:us-quote-delayed', stats };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
