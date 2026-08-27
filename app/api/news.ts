import { isValidTicker, mapArticle, resolveSymbol, type NewsArticle } from './_lib/news.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

const EODHD_NEWS_URL = 'https://eodhd.com/api/news';
const MAX_ARTICLES = 10;
/**
 * The general market feed returns more, because it backs a browsable screen
 * rather than a per-stock sidebar. Still bounded: an unbounded limit would
 * be a bigger payload for no product reason.
 */
const MAX_FEED_ARTICLES = 30;
/**
 * Upstream budget. EODHD's news route commonly answers in 2-5 seconds and
 * occasionally worse, so the previous 10s left almost no headroom: a slow
 * but healthy provider read as unreachable. The function's own platform
 * limit (vercel.json) is set above this, so OUR timeout fires first and the
 * caller gets this app's honest JSON rather than the platform's 504 page.
 */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Builds the handler with an injectable upstream timeout, so a test can
 * exercise a stalled-body timeout in milliseconds instead of waiting out the
 * real 10s budget. The default export below — what Vercel actually calls in
 * production — is just this with the real timeout.
 *
 * Proxies EODHD's News API so the API key never reaches the browser: it's
 * read from the server-only EODHD_API_KEY environment variable and never
 * placed in a VITE_-prefixed variable or any response body.
 *
 * Data-honesty contract, matching this app's other live-data surface (see
 * src/data/recoveryDetector.ts): any failure — network, timeout, non-2xx, or
 * an unparseable/unexpected upstream body — returns an error status for the
 * frontend to render as "unavailable". It never falls back to stale cached
 * headlines or invented data. Zero real articles for a quiet ticker is a
 * legitimate 200 with an empty list, not an error — and if EODHD has fewer
 * than 5 recent articles for a ticker, that shorter real list is returned
 * as-is rather than padded out to a minimum count.
 */
export function createHandler(timeoutMs: number) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    // Two modes, distinguished only by whether a ticker was supplied:
    //   /api/news             -> the general market feed
    //   /api/news?ticker=NVDA -> that one stock
    // An ABSENT ticker is the feed request; a PRESENT but malformed one is
    // still an error. Those must not be conflated, or a typo'd ticker would
    // silently serve unrelated market news as though it were that stock's.
    const tickerParam = req.query.ticker;
    // A repeated parameter is ambiguous, not a value to pick from. Taking the
    // first would let ?ticker=NVDA&ticker=BAD%20TICKER pass validation as
    // NVDA and spend an upstream call on a request nobody made.
    if (Array.isArray(tickerParam) && tickerParam.length > 1) {
      return res
        .status(400)
        .json({ error: 'repeated_param', message: 'Query param "ticker" must be given once.' });
    }
    const raw = (Array.isArray(tickerParam) ? tickerParam[0] : tickerParam)?.trim();
    const wantsFeed = raw === undefined || raw === '';
    const ticker = wantsFeed ? null : raw;
    if (ticker !== null && !isValidTicker(ticker)) {
      return res.status(400).json({ error: 'invalid_ticker', message: 'Ticker contains unsupported characters.' });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      // A deploy/config problem, not a caller error — logged for us, generic for callers.
      console.error('/api/news: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'News service is not configured.' });
    }

    // EODHD returns the general feed when `s` is omitted entirely. The
    // per-ticker call costs 10 API credits against the quota where the feed
    // costs 5, which is why the browsable screen uses the feed rather than
    // fanning out over a list of large caps.
    const wanted = ticker === null ? MAX_FEED_ARTICLES : MAX_ARTICLES;
    const upstreamUrl = new URL(EODHD_NEWS_URL);
    if (ticker !== null) upstreamUrl.searchParams.set('s', resolveSymbol(ticker.toUpperCase()));
    upstreamUrl.searchParams.set('api_token', apiKey);
    upstreamUrl.searchParams.set('fmt', 'json');
    upstreamUrl.searchParams.set('limit', String(wanted));

    const result = await fetchUpstreamJson(upstreamUrl, timeoutMs, 'news', '/api/news');
    if (!result.ok) return res.status(result.failure.status).json(failureBody(result.failure));
    const body = result.body;

    if (!Array.isArray(body)) {
      console.error('/api/news: upstream response was not an array');
      return res
        .status(502)
        .json({ error: 'bad_response', message: 'The news provider returned an unexpected shape.' });
    }

    const articles: NewsArticle[] = body
      .map(mapArticle)
      .filter((a): a is NewsArticle => a !== null)
      .slice(0, wanted);

    // A short edge cache on a successful response only — never on an error
    // path above, which must keep reaching this function so a real recovery
    // shows up quickly. Freezing a transient EODHD hiccup and serving it to
    // everyone for the full TTL is the silent-degradation pattern this app
    // exists to avoid: an outage must look like an outage for as long as it
    // lasts, and end the moment it does.
    //
    // Vercel's CDN caches a function response only when it carries an
    // explicit Cache-Control, so the error paths above — which set no such
    // header — are uncacheable by omission rather than by convention. The
    // tests assert that directly, because it is the sort of property a later
    // refactor could quietly break.
    //
    // 60s is the quota-vs-freshness trade: at worst one upstream call per
    // ticker per minute regardless of how many people are reading, so a hot
    // ticker costs ~1,440 calls/day instead of one per page view. Headlines
    // are not real-time, so a longer TTL would cut that proportionally
    // (300s -> ~288/day) if the quota ever gets tight — the number is here,
    // deliberately, rather than buried in a config.
    //
    // Note the cache key is the full request URL, so ?ticker=nvda and
    // ?ticker=NVDA are separate entries costing separate upstream calls even
    // though this handler normalises the two to the same query. Harmless
    // while the app is the only caller (it sends uppercase), worth knowing
    // before anyone points other clients at this.
    //
    // FOLLOW-UP (needs external infrastructure, deliberately out of scope):
    // this is a shared cache, not a per-client limit — it blunts repeat load
    // on the same ticker but does nothing about one client walking a
    // thousand different tickers. Real per-user rate limiting needs a
    // durable counter (Vercel KV or Upstash Redis) keyed by client IP or
    // session. Worth adding before the app is genuinely public; the cache
    // below handles the common case until then.
    //
    // No stale-while-revalidate: that directive lets a shared cache serve an
    // already-expired response for up to its own window while fetching a
    // fresh one in the background — which is exactly the "stale-cached
    // fallback" this endpoint was built to never do. Once s-maxage expires,
    // the next request must get a real answer, not a held-over one.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    // `ticker` is null on the feed response — deliberately present-but-null
    // rather than omitted, so a client can tell a feed response from a
    // per-stock one without inferring it from what it happened to request.
    return res.status(200).json({ ticker: ticker === null ? null : ticker.toUpperCase(), articles });
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
