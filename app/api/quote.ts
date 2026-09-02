import { parseSymbolList } from './_lib/symbols.js';
import { mapQuote, quoteUrl, type QuoteRow } from './_lib/finnhub.js';
import { failureBody, fetchUpstreamJson, type UpstreamFailure } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Live quotes: GET /api/quote?symbols=NVDA,AAPL
 *
 * This is the route that made the app's prices real. Every price on every
 * screen used to come from a once-a-day snapshot of the screener engine —
 * yesterday's close, presented as the price — and the day-change beside it
 * was a demo figure carried over from the design prototype, because that
 * snapshot had no day-change field to make real. Both now come from here.
 *
 * WHY A BATCH: one screen is one list. The watchlist, the movers table and
 * the search results each want ten to twenty prices at once, and twenty
 * separate round trips from a phone is a visibly slower screen for no gain.
 * Finnhub has no batch quote endpoint on any plan, so the fan-out happens
 * here, on one warm server next to the provider, instead of over the
 * client's radio.
 *
 * THE KEY STAYS SERVER-SIDE. Finnhub's key is a bearer of the whole account's
 * quota; shipped in the browser bundle it is one page-source away from being
 * spent by someone else. That is the entire reason this is a function and not
 * a fetch from the app.
 *
 * DATA HONESTY CONTRACT, matching the rest of the app:
 *   - A symbol the provider prices appears in `quotes`.
 *   - A symbol it does not carry is simply ABSENT from `quotes` and is not
 *     listed in `unavailable` — "there is no price for this symbol" is a real
 *     answer (MDA trades in Toronto and this provider has no US tape for it),
 *     and the app renders it as "—".
 *   - A symbol whose fetch actually FAILED is listed in `unavailable`, so a
 *     caller can tell "no such price" from "we could not find out". The two
 *     must never collapse: one is a fact about the symbol, the other about us.
 *   - If EVERY symbol failed, the route answers the failure itself rather
 *     than a 200 with an empty map — a spent quota or a rejected key is not
 *     "none of these stocks exist", and the app says which it was.
 */

/** Upstream budget. A quote is a small body; slower than this is broken. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * How many symbols one request may ask for.
 *
 * The free key allows 60 requests a minute and this route spends one per
 * symbol, so an unbounded list is a way for a single caller to spend the
 * whole minute's allowance for everyone. Twenty-five covers the longest list
 * any screen renders at once.
 */
export const MAX_SYMBOLS = 25;

/**
 * Concurrent upstream calls per request.
 *
 * Wide enough that twenty-five symbols cost about four sequential round trips
 * rather than twenty-five, narrow enough that two overlapping requests cannot
 * burst through the per-minute limit on their own.
 */
const CONCURRENCY = 6;

/** Success for one symbol, a classified failure, or "no such price". */
type SymbolOutcome =
  | { kind: 'quote'; symbol: string; quote: QuoteRow }
  | { kind: 'absent'; symbol: string }
  | { kind: 'failed'; symbol: string; failure: UpstreamFailure };

/**
 * Parse and validate the `symbols` parameter, bounded to this route's ceiling.
 *
 * The parsing itself is shared with /api/stats — see _lib/symbols.ts for the
 * two decisions inside it.
 */
export const parseSymbols = (raw: string | undefined) => parseSymbolList(raw, MAX_SYMBOLS);

/** One symbol's round trip. Never throws — every failure is classified. */
async function fetchOne(
  symbol: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<SymbolOutcome> {
  const result = await fetchUpstreamJson(
    quoteUrl(symbol, apiKey),
    timeoutMs,
    'quote',
    '/api/quote',
    fetchImpl,
  );
  if (!result.ok) return { kind: 'failed', symbol, failure: result.failure };
  const quote = mapQuote(result.body);
  return quote === null ? { kind: 'absent', symbol } : { kind: 'quote', symbol, quote };
}

/**
 * Run `work` over the symbols with a fixed number of workers in flight.
 *
 * A plain Promise.all over twenty-five symbols opens twenty-five sockets at
 * once and is the fastest way to trip a per-minute rate limit; this keeps the
 * same total work under a ceiling.
 */
async function inBatches(symbols: string[], work: (s: string) => Promise<SymbolOutcome>) {
  const out: SymbolOutcome[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= symbols.length) return;
      out.push(await work(symbols[i]));
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Builds the handler with an injectable upstream budget and fetch, the way
 * the other routes do, so a timeout can be exercised without waiting one out.
 */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    // A repeated parameter is ambiguous, not a value to pick from — the same
    // rule the earnings route applies, for the same reason.
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

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error('/api/quote: FINNHUB_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Quotes are not configured.' });
    }

    const outcomes = await inBatches(parsed.symbols, (symbol) =>
      fetchOne(symbol, apiKey, timeoutMs, fetchImpl),
    );

    const failures = outcomes.filter((o): o is Extract<SymbolOutcome, { kind: 'failed' }> => {
      return o.kind === 'failed';
    });
    // Every symbol failed: report the failure, not an empty market. The first
    // one stands for all of them — they share a key, a quota and a provider,
    // so they fail for the same reason.
    if (failures.length === parsed.symbols.length) {
      const failure = failures[0].failure;
      return res.status(failure.status).json(failureBody(failure));
    }

    const quotes: Record<string, QuoteRow> = {};
    for (const o of outcomes) if (o.kind === 'quote') quotes[o.symbol] = o.quote;

    // Success only, and briefly: this is the one route in the app whose whole
    // value is freshness. Ten seconds is enough for the burst of reads a
    // single screen makes on arrival without letting a price go visibly
    // stale while someone is looking at it.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=20');
    return res.status(200).json({
      quotes,
      // Named, not implied: a caller must be able to tell the symbols we
      // could not price from the ones that have no price. Ordered with an
      // explicit comparator rather than the default one, which sorts by
      // UTF-16 code unit and is only accidentally right for tickers.
      unavailable: failures.map((f) => f.symbol).sort((a, b) => a.localeCompare(b)),
    });
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
