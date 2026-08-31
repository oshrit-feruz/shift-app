/**
 * LIVE data source — real-time quotes, from /api/quote (Finnhub).
 *
 * This is where every price on every screen now comes from. Until this file
 * existed the app's "price" was a field in a once-a-day snapshot of the
 * screener engine — yesterday's close, presented as the price, and only for
 * the hundred names that snapshot happened to rank — and the day-change
 * printed beside it was a demo figure carried over from the design
 * prototype, because that snapshot had no day-change to make real.
 *
 * WHY A ROUTE RATHER THAN A DIRECT CALL: the provider key is the whole
 * account's quota in one string. In the browser bundle it is one page-source
 * away from being spent by someone else, so the fan-out happens in
 * api/quote.ts and the browser only ever talks to this app's own origin.
 *
 * DATA HONESTY CONTRACT, matching data/priceHistory.ts:
 * - A ticker the provider prices is in the map, with real numbers.
 * - A ticker it does not price is ABSENT from the map. That is a real answer
 *   ("we have no price for this symbol"), it renders as "—", and it is not
 *   the same as a failure. MDA trades in Toronto and this provider has no US
 *   tape for it; nothing is invented to fill the gap.
 * - Any failure — network, timeout, non-2xx, unparseable body, a shape we do
 *   not recognise — is 'unavailable', carrying the provider's own reason when
 *   the route named one. There is no demo fallback: a plausible number where
 *   a real price should be is the exact lie this file exists to remove.
 *
 * FRESHNESS: quotes are cached per ticker for QUOTE_TTL_MS. That window is
 * short enough that a price cannot go visibly stale while someone looks at it
 * and long enough that one screen's several reads of the same ticker — the
 * header, the holdings card, the watchlist row — cost one request between
 * them. Screens that want a moving price re-read on an interval; see
 * useLoadable's `refreshMs`.
 */

import { cachedLoadable, clearLoadableCachePrefix } from './loadableCache';
import { reasonFromResponse } from './providerReason';
import { ok, unavailable, type Loadable, type Quote } from './types';

/** Where the batch route lives, relative to the app's own origin. */
export const QUOTE_URL = '/api/quote';

/** Must match MAX_SYMBOLS in api/quote.ts — a longer list is refused there. */
export const MAX_SYMBOLS_PER_REQUEST = 25;

/** A quote read that takes this long is broken by any measure. */
const TIMEOUT_MS = 12_000;

/** How long one ticker's quote is reused before it is fetched again. */
export const QUOTE_TTL_MS = 20_000;

/**
 * How often a screen showing prices re-reads them (useLoadable's `refreshMs`).
 *
 * Deliberately longer than the TTL above, so a refresh always crosses it and
 * actually fetches rather than replaying the same cached numbers.
 *
 * Thirty seconds is the arithmetic, not a feeling. The route spends one
 * upstream request per symbol and the free provider key allows sixty a
 * minute, so a screen holding N tickers burns 2N of them per minute. At ten
 * sample symbols plus a watchlist that is comfortably inside the limit with
 * room for the charts and a second screen mounted alongside; at fifteen
 * seconds the same screen would sit at the ceiling and start answering
 * "quota reached" to its own reader.
 */
export const PRICE_REFRESH_MS = 30_000;

/** The generic reason, used when the route did not name a specific one. */
const FALLBACK_REASON = {
  en: 'Live prices are unavailable right now.',
  he: 'המחירים בזמן אמת אינם זמינים כרגע.',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * One ticker's cached quote.
 *
 * `quote: null` is cached deliberately, and is the reason this is a record
 * rather than a bare map of quotes: "the provider has no price for MDA" is an
 * answer worth remembering for the TTL, and without it every render of a
 * watchlist containing one uncovered ticker would ask again.
 */
interface CacheEntry {
  at: number;
  quote: Quote | null;
}

const cache = new Map<string, CacheEntry>();

/**
 * The key prefix every batch response is shared under. Owned here, because
 * clearing a quote means clearing both halves of where it is kept.
 */
const BATCH_KEY_PREFIX = 'quotes:';

/**
 * Drop every cached quote.
 *
 * Both halves: the per-ticker map above, and the batch responses shared
 * through loadableCache. Clearing only the first left the next read free to
 * replay the same batch payload for the rest of its TTL — a "clear" that
 * handed back exactly the quotes it was asked to forget.
 */
export function clearQuoteCache(): void {
  cache.clear();
  clearLoadableCachePrefix(BATCH_KEY_PREFIX);
}

/** Normalise a caller's list: trimmed, upper-case, de-duplicated, in order. */
export function normaliseTickers(tickers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (ticker === '' || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

/**
 * Map one wire quote into a Quote, or null when it is not one.
 *
 * Every field is required. The route only ever sends a complete quote — the
 * adapter behind it drops a partial one — so a row failing here means the
 * response came from something other than this app's route, and refusing it
 * is the only honest answer. A price that arrived without its previous close
 * cannot have a real day change, and printing 0.00% for one is worse than a
 * dash because a reader acts on it.
 */
export function mapQuote(raw: unknown): Quote | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const q = raw as Record<string, unknown>;
  const { price, change, changePct, prevClose, dayHigh, dayLow, open, asOf } = q;
  if (!isNum(price) || !isNum(change) || !isNum(changePct) || !isNum(prevClose)) return null;
  if (!isNum(dayHigh) || !isNum(dayLow) || !isNum(open)) return null;
  if (typeof asOf !== 'string' || asOf === '') return null;
  return { price, change, changePct, prevClose, dayHigh, dayLow, open, asOf };
}

/**
 * Pull the quotes out of a route response, or null when the body is not one.
 *
 * An empty `quotes` object is a real answer — none of the symbols asked for
 * are priced by the provider — and must not read as a broken response, so it
 * comes back as an empty map rather than null.
 */
export function extractQuotes(body: unknown): Record<string, Quote> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).quotes;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, Quote> = {};
  for (const [ticker, value] of Object.entries(raw as Record<string, unknown>)) {
    const quote = mapQuote(value);
    // One unreadable row invalidates the response: a partially mapped batch
    // would silently price some rows and dash others, with nothing to say
    // which happened.
    if (quote === null) return null;
    out[ticker.trim().toUpperCase()] = quote;
  }
  return out;
}

/**
 * The tickers a response failed on, as reported by the route.
 *
 * Missing or malformed is treated as "none", not as a failure: the field is
 * additive information about which symbols to leave uncached, and a response
 * without it is still a perfectly good set of quotes.
 */
function extractUnavailable(body: unknown): Set<string> {
  const out = new Set<string>();
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return out;
  const raw = (body as Record<string, unknown>).unavailable;
  if (!Array.isArray(raw)) return out;
  for (const t of raw) if (typeof t === 'string') out.add(t.trim().toUpperCase());
  return out;
}

/** One batch's round trip. Never throws. */
async function readBatch(tickers: string[], fetchImpl: typeof fetch): Promise<Loadable<BatchData>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${QUOTE_URL}?symbols=${encodeURIComponent(tickers.join(','))}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // The route classifies its own failures — a rejected key, a spent quota,
    // a provider timeout — and each needs different words, so the reason is
    // read from the body rather than flattened into one message.
    if (!res.ok) return unavailable(await reasonFromResponse(res, FALLBACK_REASON));

    const body: unknown = await res.json();
    const quotes = extractQuotes(body);
    if (quotes === null) return unavailable(FALLBACK_REASON);
    return ok({ quotes, unavailable: extractUnavailable(body) });
  } catch {
    return unavailable(FALLBACK_REASON);
  } finally {
    clearTimeout(timer);
  }
}

/** One batch's successful payload, named so the merge below can be typed. */
type BatchData = { quotes: Record<string, Quote>; unavailable: Set<string> };

/**
 * Split the wanted tickers into what the cache can already answer and what
 * still has to be fetched.
 *
 * `cached` carries only the tickers with a live quote — a cached "no price
 * for this symbol" is remembered (so the next render does not ask again) but
 * has nothing to put in the map.
 */
function partitionByCache(
  wanted: string[],
  useCache: boolean,
  now: number,
): { cached: Record<string, Quote>; missing: string[] } {
  const cached: Record<string, Quote> = {};
  const missing: string[] = [];
  for (const ticker of wanted) {
    const hit = useCache ? cache.get(ticker) : undefined;
    if (hit && now - hit.at < QUOTE_TTL_MS) {
      if (hit.quote !== null) cached[ticker] = hit.quote;
    } else {
      missing.push(ticker);
    }
  }
  return { cached, missing };
}

/**
 * The requests one list of missing tickers becomes.
 *
 * Sorted first, so the same set of tickers always produces the same URL. The
 * route's response is cached at the edge per URL, and two screens asking for
 * the same symbols in a different order would otherwise be two cache entries
 * — and two fan-outs — for one identical answer. Order is irrelevant to the
 * caller, which gets a map back.
 */
function batchTickers(missing: string[]): string[][] {
  const sorted = [...missing].sort((a, b) => a.localeCompare(b));
  const batches: string[][] = [];
  for (let i = 0; i < sorted.length; i += MAX_SYMBOLS_PER_REQUEST) {
    batches.push(sorted.slice(i, i + MAX_SYMBOLS_PER_REQUEST));
  }
  return batches;
}

/**
 * Remember one batch's answers for the TTL.
 *
 * A ticker the route named as failed is left uncached, so the next read asks
 * again instead of remembering an absence that was really an outage.
 * Everything else — priced, or genuinely unpriced — is cached.
 */
function rememberBatch(batch: string[], data: BatchData, now: number): void {
  for (const ticker of batch) {
    if (data.unavailable.has(ticker)) continue;
    cache.set(ticker, { at: now, quote: data.quotes[ticker] ?? null });
  }
}

/**
 * Live quotes for a list of tickers, keyed by upper-case ticker.
 *
 * An empty list is ok({}) with no request at all — a new account with an
 * empty watchlist should cost nothing, and "you have not added anything" is
 * not a failure to report.
 *
 * A failure is reported for the whole read rather than per ticker: the
 * symbols share one key, one quota and one provider, so when the route fails
 * it has failed for all of them, and a map that quietly contained only the
 * cached half would be a screen where some prices are live, some are a minute
 * old, and nothing says which.
 */
export async function fetchQuotes(
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<Loadable<Record<string, Quote>>> {
  const wanted = normaliseTickers(tickers);
  if (wanted.length === 0) return ok<Record<string, Quote>>({});

  // Tests inject a fetchImpl and must not see, or leave behind, cache state.
  const useCache = fetchImpl === fetch;
  const { cached, missing } = partitionByCache(wanted, useCache, now);
  if (missing.length === 0) return ok(cached);

  // Long lists are split because the route bounds one request; the batches
  // run together because they are independent and a watchlist should not pay
  // for them one after another.
  const batches = batchTickers(missing);
  const reads = await Promise.all(
    batches.map((batch) =>
      useCache
        ? // Concurrent screens asking for the same list share one request:
          // Home and the movers table mount together and want the same rows.
          cachedLoadable(`${BATCH_KEY_PREFIX}${batch.join(',')}`, QUOTE_TTL_MS, () =>
            readBatch(batch, fetchImpl),
          )
        : readBatch(batch, fetchImpl),
    ),
  );

  const result = { ...cached };
  for (let i = 0; i < batches.length; i++) {
    const read = reads[i];
    if (read.status !== 'ok')
      return unavailable(read.status === 'unavailable' ? read.reason : FALLBACK_REASON);
    Object.assign(result, read.data.quotes);
    if (useCache) rememberBatch(batches[i], read.data, now);
  }
  return ok(result);
}
