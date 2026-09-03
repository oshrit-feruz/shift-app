import { isValidTicker } from './_lib/news.js';
import { parseIsoDate, validateRange, type EarningsRow } from './_lib/earnings.js';
import { mapHistoryRow, parseCalendarCsv, readApiError, withinRange } from './_lib/alphavantage.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

const ALPHAVANTAGE_URL = 'https://www.alphavantage.co/query';
/**
 * The market-wide calendar's horizons, shortest first.
 *
 * Upstream offers exactly these three for the same single request, and the
 * response is filtered to the caller's window afterwards — so the right
 * choice is the shortest one that still REACHES the requested `to` date. A
 * fixed 3-month horizon looked harmless while the app only ever asked for a
 * week, but this route accepts windows up to MAX_RANGE_DAYS: a request
 * ending five months out would have come back 200 with an empty list, which
 * says "nobody reports then" about a period never fetched.
 */
const CALENDAR_HORIZONS: Array<{ days: number; value: string }> = [
  { days: 90, value: '3month' },
  { days: 180, value: '6month' },
  { days: 365, value: '12month' },
];

/**
 * The shortest horizon covering `to`, or null when it is beyond all of them.
 *
 * A `to` in the past needs no coverage: the feed is forward-looking, so an
 * empty answer for a past window is a real answer.
 */
export function horizonFor(to: string, now: Date = new Date()): string | null {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
    86_400_000;
  if (days <= 0) return CALENDAR_HORIZONS[0].value;
  return CALENDAR_HORIZONS.find((h) => days <= h.days)?.value ?? null;
}
/**
 * Upstream budget, wider than the news route's: a market-wide week is
 * thousands of rows in one uncompressed JSON body, and the platform limit in
 * vercel.json sits above this so OUR timeout fires first and the caller gets
 * this app's honest JSON rather than the platform's 504 page.
 */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000;
/**
 * Upper bound on rows returned in one response.
 *
 * The calendar feed has no pagination and returns its whole horizon in one
 * response — around 1,500 rows for three months, of which a single week is a
 * few hundred at reporting-season peak. A bound is therefore right
 * for a mobile client, but a SILENT one is not: dropping the tail of a week
 * while answering 200 tells the caller it has the whole week when it does
 * not. The response says when it truncated and how many rows existed, and
 * the UI says so too.
 */
const MAX_ROWS = 400;

/**
 * What each provider notice becomes on the wire, matching the classification
 * the rest of the app already uses for HTTP statuses: a plan problem reads as
 * forbidden (it will not fix itself), a spent quota as rate-limited (it will).
 */
const NOTICE_FAILURES: Record<
  'rate_limited' | 'plan_required' | 'rejected',
  { error: string; message: string }
> = {
  rate_limited: {
    error: 'upstream_rate_limited',
    message: "The earnings provider's request quota has been reached.",
  },
  plan_required: {
    error: 'upstream_forbidden',
    message: "The earnings provider refused the request — this API key's plan may not include this data.",
  },
  rejected: { error: 'upstream_error', message: 'The earnings provider refused the request.' },
};

/** Safely parse a string as JSON. Returns null if the string is not valid JSON instead of throwing. */
function safeJson(text: string): unknown {
  // The calendar path passes the whole CSV body (potentially megabytes)
  // through here just to check for a JSON provider notice. A body that does
  // not even start like JSON cannot be one — skip the guaranteed-to-throw
  // parse instead of paying for the exception on every request.
  const first = text.trimStart()[0];
  if (first !== '{' && first !== '[') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Warm-invocation cache for the market-wide calendar, keyed on horizon.
 *
 * The upstream response is window-independent — the same '3month' horizon
 * serves every from/to pair inside it — but the CDN caches per URL, so two
 * different windows were two full downloads and two CSV parses of the same
 * ~1,500-row body. Module scope survives warm invocations only; a cold start
 * simply misses. TTL matches the route's own s-maxage.
 */
const CALENDAR_CACHE_TTL_MS = 6 * 60 * 60_000;
const calendarCache = new Map<string, { rows: EarningsRow[]; fetchedAt: number }>();

/**
 * In-flight calendar work, keyed on horizon, so concurrent cache misses in
 * the same warm container share ONE upstream call instead of each spending a
 * provider request on the identical download. Entries remove themselves when
 * the work settles; only the result cache above outlives a request.
 */
const calendarInFlight = new Map<string, Promise<UpstreamOutcome>>();

/**
 * Either the mapped rows, or the exact (status, body) failure response every
 * waiter should send. Failures are precomputed here so concurrent requests
 * sharing one upstream call can each answer faithfully.
 */
type UpstreamOutcome = { rows: EarningsRow[] } | { status: number; body: unknown };

/** The whole upstream round trip: fetch, provider-notice check, mapping. */
async function fetchAndMap(
  upstreamUrl: URL,
  timeoutMs: number,
  ticker: string | null,
): Promise<UpstreamOutcome> {
  // The calendar answers CSV; the per-company history answers JSON.
  const result = await fetchUpstreamJson(upstreamUrl, timeoutMs, 'earnings', '/api/earnings', {
    as: ticker === null ? 'text' : 'json',
  });
  if (!result.ok) return { status: result.failure.status, body: failureBody(result.failure) };

  // Alpha Vantage reports its own failures with HTTP 200 and a JSON body,
  // including on the CSV route — so a spent daily quota looks exactly like
  // a successful empty week unless it is read first. Answering "no reports"
  // to a quota error would be this app's worst failure mode: a confident
  // claim made from a response that contained no data at all.
  const notice = readApiError(typeof result.body === 'string' ? safeJson(result.body) : result.body);
  if (notice !== null) {
    console.error(`/api/earnings: provider notice (${notice.kind}): ${notice.detail}`);
    return { status: 502, body: NOTICE_FAILURES[notice.kind] };
  }

  const mapped = ticker === null ? readCalendar(result.body) : readHistory(result.body, ticker.toUpperCase());
  if (mapped === null) {
    console.error('/api/earnings: upstream response had an unexpected shape');
    return {
      status: 502,
      body: { error: 'bad_response', message: 'The earnings provider returned an unexpected shape.' },
    };
  }
  return { rows: mapped };
}

/**
 * Plain string comparison, not localeCompare: reportDate is YYYY-MM-DD,
 * which already sorts lexicographically, and this runs over thousands of
 * rows on the widest windows.
 */
function byReportDate(a: EarningsRow, b: EarningsRow): number {
  if (a.reportDate < b.reportDate) return -1;
  if (a.reportDate > b.reportDate) return 1;
  return 0;
}

/**
 * Parse the market-wide calendar from CSV response body.
 * Returns null if the body is not a recognizable CSV format, which the caller reports as unreadable rather than treating as an empty week.
 */
function readCalendar(body: unknown): EarningsRow[] | null {
  return typeof body === 'string' ? parseCalendarCsv(body) : null;
}

/**
 * Extract a company's reported quarters from the EARNINGS response's quarterlyEarnings array.
 * Returns null if the array is missing (unreadable response), not an empty array (which would mean no history).
 */
function readHistory(body: unknown, ticker: string): EarningsRow[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const rows = (body as Record<string, unknown>).quarterlyEarnings;
  if (!Array.isArray(rows)) return null;
  const mapped = rows.map((r) => mapHistoryRow(ticker, r)).filter((e): e is EarningsRow => e !== null);
  // Same rule as the calendar: quarters that all failed to map mean a shape
  // we did not understand, not a company that has never reported.
  return mapped.length === 0 && rows.length > 0 ? null : mapped;
}

/**
 * Builds the handler with an injectable upstream timeout (see api/news.ts for
 * why). The default export is this with the real budget.
 *
 * Proxies Alpha Vantage's earnings data so the key stays server-side. Two
 * shapes of question, answered by two upstream functions behind one route:
 *   /api/earnings?from=&to=              -> every company due to report in a window
 *   /api/earnings?ticker=NVDA&from=&to=  -> one company's reported quarters
 *
 * The second is how a stock's PAST results are read; the engine's own
 * fundamentals route cannot answer it, taking no period parameter and
 * returning only the newest filing.
 *
 * The route's response shape is unchanged from when EODHD served it, so the
 * whole client is untouched by the switch — and switching back, if that key
 * ever covers the Calendar API, is this file and its adapter.
 *
 * ONE HONEST DIFFERENCE, carried rather than hidden: the market-wide feed
 * lists only reports that have not happened yet, so a week's calendar shows
 * who is DUE to report and no `actual` for anyone who already has. Per-stock
 * history is unaffected. The UI says so on the calendar rather than leaving
 * a reader to infer that a company which reported on Monday is still
 * pending.
 *
 * Data-honesty contract, as everywhere else in this app: any failure returns
 * an error status for the frontend to render as "unavailable" — never stale
 * or invented rows. A window with genuinely no reports is a 200 with an empty
 * list, which is a real answer and not an error.
 */
export function createHandler(timeoutMs: number, useCalendarCache = false) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    // A repeated query parameter is ambiguous, not a value to pick from.
    // Silently taking the first would let ?ticker=NVDA&ticker=BAD%20TICKER
    // reach upstream as NVDA — answering a question that was not asked.
    for (const key of ['ticker', 'from', 'to'] as const) {
      const v = req.query[key];
      if (Array.isArray(v) && v.length > 1) {
        return res
          .status(400)
          .json({ error: 'repeated_param', message: `Query param "${key}" must be given once.` });
      }
    }
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();

    // Ticker is optional: absent means "the whole market in this window".
    // Present-but-malformed is still an error, never silently widened to the
    // whole market — that would answer a question nobody asked.
    const rawTicker = one(req.query.ticker);
    const ticker = rawTicker === undefined || rawTicker === '' ? null : rawTicker;
    if (ticker !== null && !isValidTicker(ticker)) {
      return res
        .status(400)
        .json({ error: 'invalid_ticker', message: 'Ticker contains unsupported characters.' });
    }

    // Dates are required and validated before any upstream call: a bad range
    // would otherwise come back as an opaque upstream 500 (EODHD's own docs
    // warn that over-wide ranges fail), and spend a request finding out.
    const from = parseIsoDate(one(req.query.from));
    const to = parseIsoDate(one(req.query.to));
    const rangeError = validateRange(from, to);
    if (rangeError === 'bad_date') {
      return res
        .status(400)
        .json({ error: 'invalid_range', message: 'Query params "from" and "to" must be YYYY-MM-DD dates.' });
    }
    if (rangeError === 'bad_range') {
      return res.status(400).json({
        error: 'invalid_range',
        message: 'The date range is inverted or wider than this endpoint allows.',
      });
    }

    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) {
      console.error('/api/earnings: ALPHAVANTAGE_API_KEY is not set');
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'Earnings service is not configured.' });
    }

    // Two upstream questions, two functions. Neither takes a date range —
    // EARNINGS returns a company's whole history and EARNINGS_CALENDAR a
    // fixed horizon — so the window is applied here, after mapping.
    const upstreamUrl = new URL(ALPHAVANTAGE_URL);
    upstreamUrl.searchParams.set('apikey', apiKey);
    let horizon: string | null = null;
    if (ticker !== null) {
      upstreamUrl.searchParams.set('function', 'EARNINGS');
      upstreamUrl.searchParams.set('symbol', ticker.toUpperCase());
    } else {
      horizon = horizonFor(to as string);
      if (horizon === null) {
        // Refused rather than answered with an empty list: upstream cannot
        // see that far, and "no reports" would be a claim about a period we
        // never asked for.
        return res.status(400).json({
          error: 'invalid_range',
          message: 'The market-wide calendar reaches at most twelve months ahead.',
        });
      }
      upstreamUrl.searchParams.set('function', 'EARNINGS_CALENDAR');
      upstreamUrl.searchParams.set('horizon', horizon);
    }

    // A cached horizon answers the whole request without touching upstream —
    // the window filter below is the only per-request part.
    let mapped: EarningsRow[] | null = null;
    if (ticker === null && useCalendarCache && horizon !== null) {
      const hit = calendarCache.get(horizon);
      if (hit && Date.now() - hit.fetchedAt < CALENDAR_CACHE_TTL_MS) mapped = hit.rows;
    }

    if (mapped === null) {
      const cacheableCalendar = ticker === null && useCalendarCache && horizon !== null;
      let outcome: UpstreamOutcome;
      if (cacheableCalendar) {
        // Share in-flight work: a burst of concurrent misses for the same
        // horizon must cost one upstream request, not one each.
        let pending = calendarInFlight.get(horizon as string);
        if (!pending) {
          pending = fetchAndMap(upstreamUrl, timeoutMs, ticker);
          calendarInFlight.set(horizon as string, pending);
          // Two-sided .then, not .finally: .finally would return a DERIVED
          // promise that re-throws pending's rejection with nobody attached
          // to it — an unhandled rejection even though the awaiter below
          // handles pending itself.
          const cleanup = () => calendarInFlight.delete(horizon as string);
          void pending.then(cleanup, cleanup);
        }
        outcome = await pending;
      } else {
        outcome = await fetchAndMap(upstreamUrl, timeoutMs, ticker);
      }
      if (!('rows' in outcome)) return res.status(outcome.status).json(outcome.body);
      mapped = outcome.rows;
      // Only a successfully mapped calendar is cached — a failure outcome has
      // already returned above, so an error can never be frozen here.
      if (cacheableCalendar) {
        calendarCache.set(horizon as string, { rows: mapped, fetchedAt: Date.now() });
      }
    }

    const all: EarningsRow[] = withinRange(mapped, from as string, to as string).sort(byReportDate);
    const earnings = all.slice(0, MAX_ROWS);
    const truncated = all.length > earnings.length;

    // Success only, like /api/news — an error must never be frozen and served
    // for the TTL. Six hours rather than the news route's minute, for two
    // reasons that point the same way: a scheduled report date does not move
    // between two page loads, and the free provider key allows only tens of
    // requests a day, so a short TTL would spend the day's quota on freshness
    // nobody can perceive and then start answering "quota reached" to real
    // readers.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600');
    return res.status(200).json({
      ticker: ticker === null ? null : ticker.toUpperCase(),
      from,
      to,
      earnings,
      // Reported, not implied: a caller that gets fewer rows than exist must
      // be able to tell, rather than treating a partial week as the week.
      truncated,
      totalAvailable: all.length,
    });
  };
}

// The deployed handler caches the calendar horizon across warm invocations;
// tests build their own handlers without the cache so runs stay isolated.
export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS, true);
