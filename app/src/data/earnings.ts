/**
 * LIVE data source — the earnings calendar, via this app's /api/earnings
 * Vercel function (which proxies EODHD so the key stays server-side).
 *
 * Two questions, one endpoint, because upstream answers both from one route:
 * - `fetchWeekEarnings` — every company reporting in a date window. Backs the
 *   calendar tab on the news screen.
 * - `fetchTickerEarnings` — one company's reports over a window. Backs the
 *   history on a stock's Reports tab, and is the only way to get PAST
 *   results: the engine's fundamentals route takes no period parameter and
 *   returns only the newest filing.
 *
 * EMPTY IS NOT AN ERROR. A quiet week genuinely has no reports, and a
 * newly-listed company genuinely has no history — both come back as ok([])
 * and render as an honest empty state. That is a different thing from the
 * provider being down, which is 'unavailable' with a retry, and the two stay
 * distinct all the way to the UI.
 */

import { ok, unavailable, type EarningsRow, type Loadable } from './types';

/**
 * A calendar result, plus whether the endpoint had more rows than it sent.
 *
 * `truncated` is carried all the way to the screen rather than dropped here:
 * a partial week rendered as though it were the whole week is exactly the
 * quiet inaccuracy this app's data contract exists to prevent.
 */
export interface EarningsPage {
  rows: EarningsRow[];
  truncated: boolean;
  totalAvailable: number;
}

export const EARNINGS_URL = '/api/earnings';

/** Client-side ceiling on top of the function's own 10s upstream budget. */
const TIMEOUT_MS = 20_000;

/**
 * How far back a stock's report history is read. Twelve quarters is three
 * years — long enough to show a full business cycle and whether the company
 * beats consensus consistently, rather than one lucky quarter.
 */
export const HISTORY_QUARTERS = 12;

/** Days per quarter used to turn HISTORY_QUARTERS into a date window. */
const DAYS_PER_QUARTER = 91;

/**
 * Must not exceed MAX_RANGE_DAYS in api/_lib/earnings.ts — the function
 * refuses a wider window with a 400, so a client that asked for one would
 * get nothing at all rather than a slightly shorter history. Kept here as a
 * derived value rather than a second hand-written number so the two cannot
 * drift into disagreement: the lookahead is whatever the budget leaves after
 * the history, and a test asserts the total stays inside it.
 */
const MAX_RANGE_DAYS = 1200;
const LOOKAHEAD_DAYS = MAX_RANGE_DAYS - HISTORY_QUARTERS * DAYS_PER_QUARTER;

const UNAVAILABLE = {
  en: 'The earnings calendar is unavailable right now.',
  he: 'יומן הדוחות אינו זמין כרגע.',
};

/** Format a Date as the bare YYYY-MM-DD the endpoint expects, in UTC. */
export function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The Monday-to-Sunday window containing `now`, in UTC.
 *
 * Anchored to a whole week rather than "the next seven days" so the day strip
 * reads as a calendar week — Monday stays Monday as the week progresses,
 * instead of the grid sliding forward every day.
 */
export function weekWindow(now: Date = new Date()): { from: string; to: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const offset = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - offset * 86_400_000);
  return { from: isoDay(monday), to: isoDay(new Date(monday.getTime() + 6 * 86_400_000)) };
}

/**
 * A bare YYYY-MM-DD that is a real day, else null.
 *
 * Round-trips through Date.UTC because that constructor silently normalises
 * impossible input rather than rejecting it — the same guard snapshotAgeDays
 * uses, for the same reason.
 */
export function calendarDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const back = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return back.getUTCFullYear() === Number(y) &&
    back.getUTCMonth() === Number(mo) - 1 &&
    back.getUTCDate() === Number(d)
    ? `${y}-${mo}-${d}`
    : null;
}

/** Map one row from the function's response. Returns null for an unusable row. */
export function mapRow(raw: unknown): EarningsRow | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const ticker = typeof r.ticker === 'string' ? r.ticker.trim().toUpperCase() : '';
  // The function already validated both; re-checking here keeps this layer
  // independently trustworthy rather than assuming its own backend is sane —
  // and the check has to be the CALENDAR one, not just the shape. "2026-02-31"
  // matches the shape, and the calendar renders its weekday through
  // Date.UTC(y, m-1, d), which rolls it forward to 3 March: an invented date
  // shown as a real report date.
  const reportDate = calendarDate(r.reportDate);
  if (!ticker || reportDate === null) return null;

  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ticker,
    reportDate,
    periodEnd: calendarDate(r.periodEnd),
    timing: r.timing === 'BMO' || r.timing === 'AMC' ? r.timing : null,
    actual: numOrNull(r.actual),
    estimate: numOrNull(r.estimate),
    surprisePct: numOrNull(r.surprisePct),
  };
}

/** Shared transport and honesty handling. Never throws. */
async function read(url: string, fetchImpl: typeof fetch): Promise<Loadable<EarningsPage>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return unavailable(UNAVAILABLE);

    const body: unknown = await res.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return unavailable(UNAVAILABLE);
    const rows = (body as Record<string, unknown>).earnings;
    // An unrecognised shape is unavailable, never an invented empty list —
    // "no reports this week" is a claim, and we can only make it from a
    // response we actually understood.
    if (!Array.isArray(rows)) return unavailable(UNAVAILABLE);

    const mapped = rows.map(mapRow).filter((r): r is EarningsRow => r !== null);
    const body2 = body as Record<string, unknown>;
    return ok({
      rows: mapped,
      truncated: body2.truncated === true,
      totalAvailable: typeof body2.totalAvailable === 'number' ? body2.totalAvailable : mapped.length,
    });
  } catch {
    return unavailable(UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}

/** Every company reporting in the calendar week containing `now`. */
export async function fetchWeekEarnings(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<EarningsPage>> {
  const { from, to } = weekWindow(now);
  return read(`${EARNINGS_URL}?from=${from}&to=${to}`, fetchImpl);
}

/**
 * One ticker's reports over roughly the last HISTORY_QUARTERS quarters, plus
 * anything already scheduled ahead — the upcoming row is what tells someone
 * when the next report lands, and it arrives from the same call for free.
 */
export async function fetchTickerEarnings(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<EarningsPage>> {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return unavailable(UNAVAILABLE);
  const from = isoDay(new Date(now.getTime() - HISTORY_QUARTERS * DAYS_PER_QUARTER * 86_400_000));
  const to = isoDay(new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000));
  return read(`${EARNINGS_URL}?ticker=${encodeURIComponent(clean)}&from=${from}&to=${to}`, fetchImpl);
}
