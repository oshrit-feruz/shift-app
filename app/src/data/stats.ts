/**
 * LIVE data source — key statistics for US stocks, from /api/stats (EODHD).
 *
 * What the stock page's key-stats grid and the movers table read. It replaced
 * the last cluster of invented figures the app rendered beside real ones:
 * market cap and P/E came from the prototype's ten-row sample table, forward
 * P/E was `pe * 0.62`, beta and short float were string constants, volume was
 * a frozen string per ticker, and relative volume was computed from the
 * length of the ticker symbol.
 *
 * NOT GATED ON THE SAMPLE-DATA SWITCH, and that is the point. Demo mode exists
 * to fill in what has nothing real behind it (data/demoFlags.ts); these
 * figures now do, so they are read live with the switch in either position —
 * exactly like the prices and the day change beside them.
 *
 * DATA HONESTY CONTRACT, matching data/priceHistory.ts:
 * - A ticker ABSENT from the map is one the provider has nothing for. That is
 *   the normal answer for anything not listed in the US, and a real one: the
 *   grid dashes out rather than reporting a failure.
 * - Individual nulls inside a row are real too: an ETF has no P/E, a company
 *   that pays no dividend has no yield, a newly listed one has no average
 *   volume to be relative to. None of them is a zero.
 * - Any failure — network, timeout, non-2xx, unparseable body, a shape we do
 *   not recognise — is 'unavailable', carrying the route's own reason. There
 *   is no demo fallback.
 */

import { cachedLoadable } from './loadableCache';
import { reasonFromResponse } from './providerReason';
import { ok, unavailable, type Loadable, type StockStats } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const STATS_URL = '/api/stats';

/** Must match MAX_SYMBOLS in api/stats.ts — a longer list is refused there. */
export const MAX_SYMBOLS_PER_REQUEST = 25;

/** A read that takes this long is broken by any measure. */
const TIMEOUT_MS = 15_000;

/**
 * How long one list's statistics are reused.
 *
 * Long, on purpose: a market cap or a P/E moves on the scale of quarters, the
 * feed behind them is delayed by about a quarter of an hour anyway, and the
 * route caches for the same window at the edge. Re-opening a stock page or
 * flipping a movers tab should not spend a provider call to be told the same
 * numbers.
 */
const CACHE_MS = 15 * 60_000;

const FALLBACK_REASON = {
  en: 'Key statistics are unavailable right now.',
  he: 'נתוני המפתח אינם זמינים כרגע.',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A finite number, or null — including for the provider's own nulls. */
function numOrNull(v: unknown): number | null {
  return isNum(v) ? v : null;
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
 * Pull the statistics map out of the route's response, or null when the body
 * is not one.
 *
 * An empty map is a real answer — none of the symbols asked for are carried
 * by the provider — and must not read as a broken response, so it comes back
 * as an empty object rather than null.
 */
export function extractStats(body: unknown): Record<string, StockStats> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).stats;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, StockStats> = {};
  for (const [ticker, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    out[ticker.trim().toUpperCase()] = {
      marketCap: numOrNull(row.marketCap),
      pe: numOrNull(row.pe),
      forwardPE: numOrNull(row.forwardPE),
      dividendYield: numOrNull(row.dividendYield),
      fiftyTwoWeekHigh: numOrNull(row.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: numOrNull(row.fiftyTwoWeekLow),
      volume: numOrNull(row.volume),
      averageVolume: numOrNull(row.averageVolume),
    };
  }
  return out;
}

/**
 * Statistics for a list of tickers, keyed by upper-case ticker.
 *
 * An empty list is ok({}) with no request at all. A ticker the provider does
 * not carry is simply absent from the map, which the screens render as "—".
 */
export async function fetchStatsFor(
  tickers: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<Record<string, StockStats>>> {
  const wanted = normaliseTickers(tickers).slice(0, MAX_SYMBOLS_PER_REQUEST);
  if (wanted.length === 0) return ok<Record<string, StockStats>>({});
  // Sorted so the same set of tickers always produces the same URL: the route's
  // response is cached at the edge per URL, and two screens asking for the same
  // symbols in a different order would otherwise be two entries for one answer.
  const key = [...wanted].sort((a, b) => a.localeCompare(b)).join(',');
  return fetchImpl === fetch
    ? cachedLoadable(`stats:${key}`, CACHE_MS, () => readStats(key, fetch))
    : readStats(key, fetchImpl);
}

/**
 * One ticker's statistics, or null when the provider carries none for it.
 *
 * A thin read over the batch call, for the stock page, which looks at one
 * symbol at a time.
 */
export async function fetchStockStats(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<StockStats | null>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return ok(null);
  const read = await fetchStatsFor([clean], fetchImpl);
  if (read.status !== 'ok') return read;
  return ok(read.data[clean] ?? null);
}

/** The uncached read. Never throws. */
async function readStats(
  symbols: string,
  fetchImpl: typeof fetch,
): Promise<Loadable<Record<string, StockStats>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${STATS_URL}?symbols=${encodeURIComponent(symbols)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // The route classifies its own failures — a rejected key, a spent quota,
    // a provider timeout — and each needs different words.
    if (!res.ok) return unavailable(await reasonFromResponse(res, FALLBACK_REASON));

    const body: unknown = await res.json();
    const stats = extractStats(body);
    if (stats === null) return unavailable(FALLBACK_REASON);
    return ok(stats);
  } catch {
    return unavailable(FALLBACK_REASON);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Relative volume: how busy today is against a normal day.
 *
 * Null unless both halves are real and the average is positive — a newly
 * listed name can have no average to be relative to, and dividing by the zero
 * the provider sends for those would render "∞×" beside a real price.
 *
 * Worth knowing when reading it: `volume` is the session so far, so this runs
 * low all morning and only means what it says near the close. That is what
 * relative volume is in every trading app; it is not an error to correct for.
 */
export function relativeVolume(
  stats: { volume: number | null; averageVolume: number | null } | null | undefined,
): number | null {
  if (!stats) return null;
  const { volume, averageVolume } = stats;
  if (volume === null || averageVolume === null || averageVolume <= 0) return null;
  return volume / averageVolume;
}
