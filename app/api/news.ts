import { isValidTicker, mapArticle, resolveSymbol, type NewsArticle } from './_lib/news.js';

/**
 * Minimal shape of what Vercel's Node.js runtime actually hands a function —
 * the parsed query object on the request and status/json/setHeader helpers
 * on the response. Declared locally instead of depending on @vercel/node
 * purely for these two names; the runtime augments a plain Node req/res with
 * exactly this API whether or not the package is installed.
 */
interface ApiRequest {
  method?: string;
  query: Partial<Record<string, string | string[]>>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const EODHD_NEWS_URL = 'https://eodhd.com/api/news';
const MAX_ARTICLES = 10;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;

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

    const tickerParam = req.query.ticker;
    const ticker = (Array.isArray(tickerParam) ? tickerParam[0] : tickerParam)?.trim();
    if (!ticker) {
      return res.status(400).json({ error: 'missing_ticker', message: 'Query param "ticker" is required.' });
    }
    if (!isValidTicker(ticker)) {
      return res.status(400).json({ error: 'invalid_ticker', message: 'Ticker contains unsupported characters.' });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      // A deploy/config problem, not a caller error — logged for us, generic for callers.
      console.error('/api/news: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'News service is not configured.' });
    }

    const upstreamUrl = new URL(EODHD_NEWS_URL);
    upstreamUrl.searchParams.set('s', resolveSymbol(ticker.toUpperCase()));
    upstreamUrl.searchParams.set('api_token', apiKey);
    upstreamUrl.searchParams.set('fmt', 'json');
    upstreamUrl.searchParams.set('limit', String(MAX_ARTICLES));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // The timeout must stay active through body parsing, not just until
    // fetch() resolves: fetch() can resolve as soon as headers arrive, while
    // the body is still streaming in. Clearing the timer any earlier would
    // let a stalled body hang well past timeoutMs — so upstreamRes.json() is
    // inside the same try, and the timer is only cleared in the outer finally.
    let body: unknown = null;
    try {
      const upstreamRes = await fetch(upstreamUrl, { signal: controller.signal });
      if (!upstreamRes.ok) {
        console.error(`/api/news: upstream returned ${upstreamRes.status}`);
        return res.status(502).json({ error: 'upstream_error', message: 'The news provider returned an error.' });
      }
      try {
        body = await upstreamRes.json();
      } catch (err) {
        // Covers both malformed JSON and an abort firing mid-body-read — either
        // way the upstream response couldn't be read, which is what this
        // status is for.
        console.error('/api/news: upstream response was not valid JSON:', err);
        return res
          .status(502)
          .json({ error: 'bad_response', message: 'The news provider returned an unreadable response.' });
      }
    } catch (err) {
      console.error('/api/news: upstream fetch failed:', err);
      return res.status(502).json({ error: 'upstream_unavailable', message: 'Could not reach the news provider.' });
    } finally {
      clearTimeout(timeout);
    }

    if (!Array.isArray(body)) {
      console.error('/api/news: upstream response was not an array');
      return res
        .status(502)
        .json({ error: 'bad_response', message: 'The news provider returned an unexpected shape.' });
    }

    const articles: NewsArticle[] = body
      .map(mapArticle)
      .filter((a): a is NewsArticle => a !== null)
      .slice(0, MAX_ARTICLES);

    // A short edge cache on a successful response only — never on an error
    // path above, which must keep reaching this function so a real recovery
    // shows up quickly. This absorbs repeat requests for the same ticker
    // (e.g. a user re-opening the same stock page) without spending more of
    // EODHD's daily quota than the real traffic needs; it is not a substitute
    // for per-client abuse throttling, which would need a durable store this
    // app doesn't have yet.
    //
    // No stale-while-revalidate: that directive lets a shared cache serve an
    // already-expired response for up to its own window while fetching a
    // fresh one in the background — which is exactly the "stale-cached
    // fallback" this endpoint was built to never do. Once s-maxage expires,
    // the next request must get a real answer, not a held-over one.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(200).json({ ticker: ticker.toUpperCase(), articles });
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
