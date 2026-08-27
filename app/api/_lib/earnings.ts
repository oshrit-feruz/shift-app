/**
 * Pure helpers for the /api/earnings proxy — separate from the handler so
 * they can be unit-tested without a request/response pair or a mocked fetch.
 */

export interface UpstreamEarning {
  code?: unknown;
  report_date?: unknown;
  date?: unknown;
  before_after_market?: unknown;
  currency?: unknown;
  actual?: unknown;
  estimate?: unknown;
  difference?: unknown;
  percent?: unknown;
}

export interface EarningsRow {
  /** Bare uppercased ticker, exchange suffix stripped ("AAPL.US" -> "AAPL"). */
  ticker: string;
  /** Date results were announced, raw YYYY-MM-DD. */
  reportDate: string;
  /** Fiscal period the results cover, raw YYYY-MM-DD, or null. */
  periodEnd: string | null;
  /** 'BMO' before market open, 'AMC' after market close, or null when unstated. */
  timing: 'BMO' | 'AMC' | null;
  /** Reported EPS. Null for a report that has not happened yet. */
  actual: number | null;
  /** Consensus EPS estimate, or null when none was published. */
  estimate: number | null;
  /** Signed surprise vs. estimate, in percent, or null. */
  surprisePct: number | null;
}

/** A real calendar date in YYYY-MM-DD, else null. */
export function parseIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const back = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Round-trip guard: Date.UTC silently rolls an impossible date forward, so
  // "2026-02-31" would otherwise pass as a real report date.
  return back.getUTCFullYear() === Number(y) &&
    back.getUTCMonth() === Number(mo) - 1 &&
    back.getUTCDate() === Number(d)
    ? `${y}-${mo}-${d}`
    : null;
}

/** A finite number from a number or numeric string; anything else → null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Map one upstream calendar row.
 *
 * Returns null without a usable ticker or a real report date — those two are
 * what make a row placeable on a calendar at all, and a row that cannot be
 * placed or identified has nothing to render. Every other field is nullable
 * on purpose: a scheduled-but-not-yet-reported quarter genuinely has no
 * `actual`, and a company with no analyst coverage genuinely has no
 * `estimate`. Those render as "—" rather than being filled in.
 */
export function mapEarning(raw: unknown): EarningsRow | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const e = raw as UpstreamEarning;

  const code = typeof e.code === 'string' ? e.code.trim().split('.')[0].toUpperCase() : '';
  if (!code || !/^[A-Z0-9-]{1,15}$/.test(code)) return null;

  const reportDate = parseIsoDate(e.report_date);
  if (!reportDate) return null;

  // Anything we do not recognise becomes null rather than being coerced to a
  // side — guessing "after the close" for an unknown value would put a real
  // number next to a made-up fact about when it lands. A lookup rather than
  // chained ternaries so a new upstream spelling is one line here.
  const t = typeof e.before_after_market === 'string' ? e.before_after_market.trim().toUpperCase() : '';
  const TIMINGS: Record<string, 'BMO' | 'AMC'> = {
    BEFOREMARKET: 'BMO', BMO: 'BMO', AFTERMARKET: 'AMC', AMC: 'AMC',
  };
  const timing = TIMINGS[t] ?? null;

  return {
    ticker: code,
    reportDate,
    periodEnd: parseIsoDate(e.date),
    timing,
    actual: toNumber(e.actual),
    estimate: toNumber(e.estimate),
    surprisePct: toNumber(e.percent),
  };
}

/**
 * Widest window the upstream calendar is asked for in one call.
 *
 * EODHD's own docs warn that ranges beyond about five years fail outright
 * with a 500, so this is a hard client-side bound rather than a courtesy:
 * three years covers the deepest thing the app asks for (twelve quarters of
 * one stock's history) with room to spare, and refusing a wider request here
 * turns an upstream 500 into a clear 400 the caller can act on.
 */
export const MAX_RANGE_DAYS = 1200;

/**
 * Validate a from/to pair. Returns an error code, or null when the range is
 * usable.
 */
export function validateRange(from: string | null, to: string | null): 'bad_date' | 'bad_range' | null {
  if (from === null || to === null) return 'bad_date';
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'bad_date';
  if (b < a) return 'bad_range';
  if ((b - a) / 86_400_000 > MAX_RANGE_DAYS) return 'bad_range';
  return null;
}
