/**
 * LIVE data source — a US stock's key statistics, from /api/stats (EODHD).
 *
 * What the stock page's key-stats grid reads. It replaced the last cluster of
 * invented figures the app rendered beside real ones: market cap and P/E came
 * from the prototype's ten-row sample table, forward P/E was `pe * 0.62`, and
 * beta, dividend yield and short float were the same three string constants
 * under every ticker in the app.
 *
 * NOT GATED ON THE SAMPLE-DATA SWITCH, and that is the point. Demo mode
 * exists to fill in what has nothing real behind it (data/demoFlags.ts); these
 * figures now do, so they are read live with the switch in either position —
 * exactly like the prices and the day change beside them. A ticker this
 * provider does not carry renders "—", in demo mode too, because that is the
 * true answer rather than an absence worth papering over.
 *
 * DATA HONESTY CONTRACT, matching data/priceHistory.ts:
 * - ok(null) means the provider has no extended quote for this symbol — the
 *   normal answer for anything not listed in the US, and a real one. The grid
 *   dashes out rather than reporting a failure.
 * - Individual nulls inside the payload are real too: an ETF has no P/E, and
 *   a company that pays no dividend has no yield. Neither is a zero.
 * - Any failure — network, timeout, non-2xx, unparseable body, a shape we do
 *   not recognise — is 'unavailable', carrying the route's own reason. There
 *   is no demo fallback.
 */

import { cachedLoadable } from './loadableCache';
import { reasonFromResponse } from './providerReason';
import { ok, unavailable, type Loadable, type StockStats } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const STATS_URL = '/api/stats';

/** A read that takes this long is broken by any measure. */
const TIMEOUT_MS = 15_000;

/**
 * How long one ticker's statistics are reused.
 *
 * Long, on purpose: a market cap or a P/E moves on the scale of quarters, the
 * feed behind them is delayed by about a quarter of an hour anyway, and the
 * route caches for the same window at the edge. Re-opening a stock page
 * should not spend a provider call to be told the same number.
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

/**
 * Pull the statistics out of the route's response.
 *
 * Three outcomes kept apart, because the screen renders them differently:
 * a mapped object, `null` for "no extended quote for this symbol", and
 * `undefined` for a body we do not recognise — which the caller reports as
 * unavailable rather than as an absence.
 */
export function extractStats(body: unknown): StockStats | null | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const raw = (body as Record<string, unknown>).stats;
  if (raw === null) return null;
  if (raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  return {
    marketCap: numOrNull(row.marketCap),
    pe: numOrNull(row.pe),
    forwardPE: numOrNull(row.forwardPE),
    dividendYield: numOrNull(row.dividendYield),
    fiftyTwoWeekHigh: numOrNull(row.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: numOrNull(row.fiftyTwoWeekLow),
  };
}

/**
 * One ticker's key statistics. Never throws.
 *
 * `fetchImpl` is injectable so every branch can be tested without a network;
 * only the default transport is cached, so tests stay isolated.
 */
export async function fetchStockStats(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<StockStats | null>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return ok(null);
  return fetchImpl === fetch
    ? cachedLoadable(`stats:${clean}`, CACHE_MS, () => readStats(clean, fetch))
    : readStats(clean, fetchImpl);
}

/** The uncached read. Never throws. */
async function readStats(ticker: string, fetchImpl: typeof fetch): Promise<Loadable<StockStats | null>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${STATS_URL}?symbol=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // The route classifies its own failures — a rejected key, a spent quota,
    // a provider timeout — and each needs different words.
    if (!res.ok) return unavailable(await reasonFromResponse(res, FALLBACK_REASON));

    const body: unknown = await res.json();
    const stats = extractStats(body);
    if (stats === undefined) return unavailable(FALLBACK_REASON);
    return ok(stats);
  } catch {
    return unavailable(FALLBACK_REASON);
  } finally {
    clearTimeout(timer);
  }
}
