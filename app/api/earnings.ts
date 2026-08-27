import { isValidTicker, resolveSymbol } from './_lib/news.js';
import { mapEarning, parseIsoDate, validateRange, type EarningsRow } from './_lib/earnings.js';
import { classifyFetchError, classifyUpstreamStatus, failureBody, isAbortError } from './_lib/upstream.js';

/** See api/news.ts — the same minimal shape of what Vercel's Node runtime hands a function. */
interface ApiRequest {
  method?: string;
  query: Partial<Record<string, string | string[]>>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const EODHD_CALENDAR_URL = 'https://eodhd.com/api/calendar/earnings';
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
 * EODHD's calendar has no pagination and returns every record in the range —
 * their own docs put a full year at roughly 120,000 rows, so a market-wide
 * week is on the order of a couple of thousand. A bound is therefore right
 * for a mobile client, but a SILENT one is not: dropping the tail of a week
 * while answering 200 tells the caller it has the whole week when it does
 * not. The response says when it truncated and how many rows existed, and
 * the UI says so too.
 */
const MAX_ROWS = 400;

/**
 * EODHD wraps the rows in { earnings: [...] }; a bare array is tolerated too,
 * since a shape we half-recognise is better handled explicitly than assumed.
 * Null means "not a shape we understand", which the caller reports rather
 * than treating as an empty week.
 */
function extractRows(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'object' || body === null) return null;
  const wrapped = (body as Record<string, unknown>).earnings;
  return Array.isArray(wrapped) ? wrapped : null;
}

/**
 * Builds the handler with an injectable upstream timeout (see api/news.ts for
 * why). The default export is this with the real budget.
 *
 * Proxies EODHD's earnings-calendar API so the key stays server-side. Two
 * shapes of question, same endpoint, because upstream answers both from one
 * route:
 *   /api/earnings?from=&to=              -> every company reporting in a window
 *   /api/earnings?ticker=NVDA&from=&to=  -> one company's reports in a window
 *
 * The second is how a stock's PAST results are read: the calendar carries
 * history as well as scheduled reports, with `actual` filled in once a
 * quarter has been reported and null before that. The engine's own
 * fundamentals route cannot answer this — it takes no period parameter and
 * returns only the newest filing.
 *
 * Cheap by comparison with the news feed: upstream charges one API credit per
 * request here regardless of how many rows come back, which is why a whole
 * week of the market costs the same as one ticker.
 *
 * Data-honesty contract, as everywhere else in this app: any failure returns
 * an error status for the frontend to render as "unavailable" — never stale
 * or invented rows. A window with genuinely no reports is a 200 with an empty
 * list, which is a real answer and not an error.
 */
export function createHandler(timeoutMs: number) {
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
      return res.status(400).json({ error: 'invalid_ticker', message: 'Ticker contains unsupported characters.' });
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
      return res
        .status(400)
        .json({ error: 'invalid_range', message: 'The date range is inverted or wider than this endpoint allows.' });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/earnings: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Earnings service is not configured.' });
    }

    const upstreamUrl = new URL(EODHD_CALENDAR_URL);
    upstreamUrl.searchParams.set('api_token', apiKey);
    upstreamUrl.searchParams.set('fmt', 'json');
    upstreamUrl.searchParams.set('from', from as string);
    upstreamUrl.searchParams.set('to', to as string);
    if (ticker !== null) upstreamUrl.searchParams.set('symbols', resolveSymbol(ticker.toUpperCase()));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // Timeout spans body parsing too — fetch() resolves on headers while the
    // body may still be streaming (see api/news.ts).
    let body: unknown = null;
    try {
      const upstreamRes = await fetch(upstreamUrl, { signal: controller.signal });
      if (!upstreamRes.ok) {
        // 403 here is the one worth naming: EODHD's calendar sits in specific
        // plans, and a key without it is refused indefinitely rather than
        // transiently. Reporting that as a generic error would have someone
        // retrying an outage that is really a subscription.
        console.error(`/api/earnings: upstream returned ${upstreamRes.status}`);
        const failure = classifyUpstreamStatus(upstreamRes.status, 'earnings');
        return res.status(failure.status).json(failureBody(failure));
      }
      try {
        body = await upstreamRes.json();
      } catch (err) {
        // An abort mid-body-read is a timeout, not a malformed body.
        if (isAbortError(err)) {
          console.error('/api/earnings: upstream body read timed out:', err);
          const failure = classifyFetchError(err, timeoutMs, 'earnings');
          return res.status(failure.status).json(failureBody(failure));
        }
        console.error('/api/earnings: upstream response was not valid JSON:', err);
        return res
          .status(502)
          .json({ error: 'bad_response', message: 'The earnings provider returned an unreadable response.' });
      }
    } catch (err) {
      console.error('/api/earnings: upstream fetch failed:', err);
      const failure = classifyFetchError(err, timeoutMs, 'earnings');
      return res.status(failure.status).json(failureBody(failure));
    } finally {
      clearTimeout(timeout);
    }

    const rows = extractRows(body);
    if (rows === null) {
      console.error('/api/earnings: upstream response had an unexpected shape');
      return res
        .status(502)
        .json({ error: 'bad_response', message: 'The earnings provider returned an unexpected shape.' });
    }

    const all: EarningsRow[] = rows
      .map(mapEarning)
      .filter((e): e is EarningsRow => e !== null)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    const earnings = all.slice(0, MAX_ROWS);
    const truncated = all.length > earnings.length;

    // Success only, like /api/news — an error must never be frozen and served
    // for the TTL. Longer than the news TTL because a calendar changes on the
    // scale of hours, not minutes: a scheduled report date does not move
    // between two page loads, so a shorter window would spend quota for no
    // freshness anyone can perceive.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
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

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
