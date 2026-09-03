/**
 * LIVE data source — a company's filed statements, from /api/financials
 * (SEC EDGAR company facts).
 *
 * What the Reports tab's statements card reads: income statement, balance
 * sheet and cash-flow lines per filed period, annual and quarterly apart.
 * Not gated on the sample-data switch — these are filed figures, read with
 * the switch in either position, like the prices and the news.
 *
 * DATA HONESTY CONTRACT, matching data/stats.ts:
 * - `listed: false` is a real answer: the SEC has no US-GAAP filer for this
 *   ticker. The card says so; it is not a failure and there is no retry.
 * - An empty period list is real too, and so is every null inside a row: a
 *   line the filing lacks. None of them is a zero.
 * - Any failure — network, timeout, the route's own error codes, a shape we
 *   do not recognise — is 'unavailable' with the route's reason. There is no
 *   demo fallback and nothing is estimated.
 */

import { cachedLoadable } from './loadableCache';
import { reasonFromResponse } from './providerReason';
import { ok, unavailable, type FinancialStatementRow, type Financials, type Loadable } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const FINANCIALS_URL = '/api/financials';

/**
 * Generous: the route reads a multi-megabyte upstream payload on a cold
 * edge, and a slow-but-working read must not be reported as an outage.
 */
const TIMEOUT_MS = 25_000;

/** Statements change once a quarter; half an hour of reuse spares the route. */
const CACHE_MS = 30 * 60_000;

const FALLBACK_REASON = {
  en: 'The financial statements are unavailable right now.',
  he: 'הדוחות הכספיים אינם זמינים כרגע.',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** One statement row, or null when it lacks the period and provenance a row must carry. */
function mapRow(raw: unknown): FinancialStatementRow | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const periodEnd = str(r.periodEnd);
  const form = str(r.form);
  const filed = str(r.filed);
  // A figure with no filing behind it is not a filed figure; the row is
  // dropped rather than shown with its provenance shrugged off as "—".
  if (!periodEnd || !form || !filed) return null;
  return {
    periodStart: str(r.periodStart),
    periodEnd,
    fy: numOrNull(r.fy),
    fp: str(r.fp),
    form,
    filed,
    revenue: numOrNull(r.revenue),
    grossProfit: numOrNull(r.grossProfit),
    operatingIncome: numOrNull(r.operatingIncome),
    netIncome: numOrNull(r.netIncome),
    eps: numOrNull(r.eps),
    operatingCashFlow: numOrNull(r.operatingCashFlow),
    assets: numOrNull(r.assets),
    liabilities: numOrNull(r.liabilities),
    equity: numOrNull(r.equity),
    cash: numOrNull(r.cash),
  };
}

/**
 * Pull the statements out of the route's response, or null when the body is
 * not one. Re-validated here rather than trusted: this is the last thing
 * between the response and a number on screen.
 */
export function extractFinancials(body: unknown): Financials | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const ticker = str(b.ticker);
  if (!ticker || typeof b.listed !== 'boolean') return null;
  if (!Array.isArray(b.annual) || !Array.isArray(b.quarterly)) return null;
  return {
    ticker: ticker.toUpperCase(),
    listed: b.listed,
    entity: str(b.entity),
    annual: b.annual.map(mapRow).filter((r): r is FinancialStatementRow => r !== null),
    quarterly: b.quarterly.map(mapRow).filter((r): r is FinancialStatementRow => r !== null),
  };
}

/**
 * One ticker's filed statements. Never throws.
 *
 * `fetchImpl` is injectable so every branch can be tested without a network;
 * an injected fetch bypasses the cache, as the other readers do.
 */
export async function fetchFinancials(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<Financials>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return unavailable(FALLBACK_REASON);
  if (fetchImpl === fetch) {
    return cachedLoadable(`financials:${clean}`, CACHE_MS, () => readFinancials(clean, fetch));
  }
  return readFinancials(clean, fetchImpl);
}

async function readFinancials(clean: string, fetchImpl: typeof fetch): Promise<Loadable<Financials>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${FINANCIALS_URL}?symbol=${encodeURIComponent(clean)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return unavailable(await reasonFromResponse(res, FALLBACK_REASON));
    const parsed = extractFinancials(await res.json());
    if (parsed === null) return unavailable(FALLBACK_REASON);
    return ok(parsed);
  } catch {
    return unavailable(FALLBACK_REASON);
  } finally {
    clearTimeout(timer);
  }
}
