import { parseSymbolList } from './_lib/symbols.js';
import { mapUsStats, readUsQuoteData, resolveSymbol, usQuoteUrl, type UsStats } from './_lib/eodhd.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Key statistics for US stocks: GET /api/stats?symbols=QCOM,NVDA
 *
 * What the stock page's key-stats grid and the movers table read. Until this
 * route existed those were the last places invented figures sat beside real
 * ones: market cap and P/E came from the prototype's ten-row sample table,
 * forward P/E was `pe * 0.62`, beta and short float were string constants,
 * volume was a frozen string, and relative volume was computed from the
 * LENGTH OF THE TICKER — `1.1 + (ticker.length % 4) * 0.4`, rendered with an
 * "×" beside real prices.
 *
 * WHY A DELAYED FEED IS THE RIGHT SOURCE HERE, when the app refuses one for
 * prices: everything this maps moves on the scale of quarters, or is a
 * session total that only makes sense against a session average. The live
 * price stays on Finnhub and this route deliberately maps no price at all, so
 * nothing here can end up beside the header's live one claiming to be the
 * same moment.
 *
 * US ONLY, AND HONEST ABOUT IT. The endpoint covers US listings; a Toronto or
 * London symbol is absent from its response, and absent from this one too.
 *
 * DATA HONESTY CONTRACT:
 *   - A symbol ABSENT from `stats` is one the provider has nothing for — a
 *     real answer about the symbol, rendered as dashes, not an error.
 *   - Individual nulls inside a row are real too: an ETF has no P/E, a
 *     company that pays nothing has no dividend yield, a newly listed one has
 *     no average volume to be relative to. Never zero for any of them.
 *   - Any failure is an error status with a code, never an empty map: "we
 *     have nothing for these symbols" and "we could not find out" must not
 *     read the same.
 */

/** Upstream budget. A handful of snapshots is a small body. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * How many symbols one request may ask for.
 *
 * The upstream endpoint batches natively — one HTTP request, one API call per
 * symbol — so this is not a fan-out ceiling like /api/quote's. It bounds the
 * URL and the quota a single caller can spend, and twenty-five covers the
 * longest list any screen renders at once.
 */
export const MAX_SYMBOLS = 25;

/** The response body, in the shape the app's reader expects. */
export interface StatsBody {
  /** Keyed by bare uppercase ticker. A symbol with nothing for it is absent. */
  stats: Record<string, UsStats>;
  source: string;
}

/**
 * Whether this endpoint could possibly answer for a symbol.
 *
 * It is a US-equities endpoint, so a symbol resolving to any other exchange is
 * a request we already know the answer to. Filtering them out spends no API
 * call to be told nothing, and gives the reader the same honest absence a
 * round trip would have produced.
 */
export function isUsSymbol(symbol: string): boolean {
  return resolveSymbol(symbol).endsWith('.US');
}

/**
 * Parse and validate the `symbols` parameter, bounded to this route's ceiling.
 *
 * The parsing itself is shared with /api/quote — see _lib/symbols.ts for the
 * two decisions inside it.
 */
export const parseSymbols = (raw: string | undefined) => parseSymbolList(raw, MAX_SYMBOLS);

/**
 * Fifteen minutes: these figures move on the scale of quarters, and the feed
 * behind them is itself delayed by about as long, so a shorter TTL would
 * spend requests to re-fetch the same numbers.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600';

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    const raw = req.query.symbols;
    if (Array.isArray(raw) && raw.length > 1) {
      return res
        .status(400)
        .json({ error: 'repeated_param', message: 'Query param "symbols" must be given once.' });
    }
    const parsed = parseSymbols(Array.isArray(raw) ? raw[0] : raw);
    if ('error' in parsed) {
      return res.status(400).json({ error: 'invalid_symbols', message: parsed.error });
    }

    // Every non-US symbol is already answered. If that is all of them, the
    // whole request is, and no upstream call is spent on it.
    const wanted = parsed.symbols.filter(isUsSymbol);
    if (wanted.length === 0) {
      res.setHeader('Cache-Control', CACHE_CONTROL);
      return res.status(200).json({ stats: {}, source: SOURCE } satisfies StatsBody);
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/stats: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Key statistics are not configured.' });
    }

    const result = await fetchUpstreamJson(
      usQuoteUrl(wanted, apiKey),
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

    // The upstream map is keyed by the symbol as it was asked for; this one is
    // keyed by the bare ticker the app addresses stocks with, so a caller does
    // not have to know how the provider spells things.
    const stats: Record<string, UsStats> = {};
    for (const ticker of wanted) {
      const row = data[resolveSymbol(ticker)];
      if (row === undefined) continue;
      const mapped = mapUsStats(row);
      // A row that is present but not an object is a shape we do not
      // understand — reported, not quietly dropped as an absence.
      if (mapped === null) {
        console.error('/api/stats: upstream row was not an object');
        return res.status(502).json({
          error: 'bad_response',
          message: 'The key-statistics provider returned an unexpected shape.',
        });
      }
      stats[ticker] = mapped;
    }

    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json({ stats, source: SOURCE } satisfies StatsBody);
  };
}

const SOURCE = 'eodhd:us-quote-delayed';

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
