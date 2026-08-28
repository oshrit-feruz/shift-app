/**
 * LIVE data source — SEC EDGAR fundamentals for one ticker, via the engine's
 * /api/stock/{ticker}/fundamentals route.
 *
 * WHY THIS ONE STILL CALLS RENDER DIRECTLY:
 * The daily screener is mirrored into this repo because it is a single
 * ranking that changes once a day (see recoveryDetector.ts). This route
 * cannot be mirrored the same way: it is per-ticker and on-demand, so
 * pre-fetching it would mean pre-fetching every ticker a user might ever
 * open. It therefore still pays Render's free-tier cold start — up to ~60s
 * on the first request after an idle period — which is why TIMEOUT_MS is so
 * generous and why the calling screen must show a loading state that
 * survives that wait rather than giving up after a second or two.
 *
 * HONEST-STATUS CONTRACT:
 * The engine answers 200 for *everything*, including a ticker it has no data
 * for and a ticker that does not exist — the HTTP status carries no
 * information here. The `status` field in the body is the only signal, and
 * this module branches purely on it, exactly as the engine documents:
 * 'ok' carries real filed figures, anything else is 'unavailable' with a
 * reason, and a number is never estimated or invented to fill a gap.
 *
 * An unrecognised status is treated as unavailable, never as ok. Reading a
 * body we do not understand as though it were good data is the one failure
 * mode this contract exists to prevent.
 */

import { ok, unavailable, type Fundamentals, type Loadable } from './types';
import { RECOVERY_DETECTOR_ORIGIN } from './recoveryDetector';

/**
 * Long on purpose: this endpoint can hit a Render cold start of up to ~60s.
 * A shorter budget here would turn a slow-but-working engine into a
 * spurious "unavailable", which is a lie of a different kind.
 */
const TIMEOUT_MS = 60_000;

/** Parse a value as a finite number, accepting numbers or numeric strings. Returns null for anything else or non-finite values. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extract a trimmed non-empty string from a value, or return null if it's not a usable string. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Narrow an unknown value to a plain object (not null, not an array), or return null. */
function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Map the engine's 'ok' body onto Fundamentals.
 *
 * Returns null when the body carries no revenue figure — an 'ok' with
 * nothing to show is not something this screen can render honestly — and
 * equally when the filing provenance (filed date or form) is missing: the
 * engine documents this figure as display-only and NOT point-in-time, so a
 * number that cannot say which filing it came from is not a "filed result"
 * and must not be presented as one. Both cases surface as unavailable
 * rather than as a card of dashes pretending to be a report.
 */
export function mapFundamentals(body: unknown): Fundamentals | null {
  const root = obj(body);
  if (!root) return null;

  const ticker = str(root.ticker);
  if (!ticker) return null;

  const revenue = obj(root.revenue);
  const filing = obj(root.filing);

  const value = revenue ? num(revenue.value) : null;
  const filed = filing ? str(filing.filed) : null;
  const form = filing ? str(filing.form) : null;
  if (value === null || filed === null || form === null) return null;

  return {
    ticker: ticker.toUpperCase(),
    revenue: value,
    periodEnd: revenue ? str(revenue.period_end) : null,
    yoyPct: revenue ? num(revenue.yoy_pct) : null,
    filed,
    form,
    source: str(root.source),
  };
}

/**
 * The engine's own reason for an 'unavailable' is a single fixed English
 * sentence ("No usable EDGAR filing data for this ticker (not SEC-listed,
 * no annual revenue on file, or EDGAR unreachable)"). It is not rendered
 * directly: this is a Hebrew-first UI and the data layer has no i18n hooks,
 * so the meaning is carried here in both languages, matching the convention
 * used by the satellite feed's staleness reasons.
 *
 * Deliberately no attempt to string-match the engine's exact wording and
 * translate it piecemeal — that would break silently the moment the engine
 * rephrases. This says what is reliably true of every unavailable answer.
 */
const NO_FILINGS = {
  en: 'No filed figures are available for this ticker — it may not be SEC-listed, or have no annual revenue on file.',
  he: 'אין נתונים מדוחות עבור מניה זו — ייתכן שאינה רשומה ב-SEC, או שאין לה דוח שנתי עם הכנסות.',
};

const COULD_NOT_REACH = {
  en: 'Could not reach the reports service. It may still be waking up — try again in a moment.',
  he: 'לא הצלחנו להגיע לשירות הדוחות. ייתכן שהוא עדיין מתעורר — נסי שוב בעוד רגע.',
};

/**
 * Fetch one ticker's fundamentals. Never throws.
 *
 * `fetchImpl` is injectable so every branch can be tested without a network.
 */
export async function fetchFundamentals(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<Fundamentals>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return unavailable(NO_FILINGS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `${RECOVERY_DETECTOR_ORIGIN}/api/stock/${encodeURIComponent(clean)}/fundamentals`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    );
    // A non-2xx here is a transport/service problem rather than "this ticker
    // has no filings" — the engine answers 200 even for a ticker it knows
    // nothing about, so the two cases must not be collapsed into one message.
    if (!res.ok) return unavailable(COULD_NOT_REACH);

    const body: unknown = await res.json();
    const root = obj(body);
    if (!root) return unavailable(COULD_NOT_REACH);

    // Branch purely on the engine's status field. Anything that is not
    // literally 'ok' — including a status we have never seen — is
    // unavailable; an unknown status must never be optimistically read as
    // good data.
    if (root.status !== 'ok') return unavailable(NO_FILINGS);

    const mapped = mapFundamentals(root);
    if (mapped === null) return unavailable(NO_FILINGS);
    return ok(mapped);
  } catch {
    // Network failure, abort/timeout, unparseable JSON — all honestly
    // unavailable. Deliberately no demo fallback.
    return unavailable(COULD_NOT_REACH);
  } finally {
    clearTimeout(timer);
  }
}
