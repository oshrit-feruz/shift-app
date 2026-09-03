import { isValidTicker } from './_lib/news.js';
import {
  buildStatements,
  companyFactsUrl,
  readCompanyFacts,
  readTickerMap,
  secTicker,
  TICKER_FILE_URL,
  type CompanyFacts,
  type StatementRow,
} from './_lib/edgar.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Financial statements, as filed with the SEC: GET /api/financials?symbol=QCOM
 *
 * What the stock page's Reports tab reads for its income statement, balance
 * sheet and cash-flow lines. The source is EDGAR's XBRL company-facts API —
 * every US-GAAP figure a company has tagged in its 10-K and 10-Q filings —
 * which is free and needs no key. It replaces nothing invented; until now
 * the tab carried one filed figure (annual revenue) from the engine, and the
 * rest of the statements were not in the app at all.
 *
 * WHY THIS AND NOT THE MARKET-DATA PROVIDER: the provider's fundamentals
 * endpoint is not on the account's plan (it answers 403; see
 * docs/eodhd-plan-decision.md). EDGAR is the primary source those feeds are
 * built from, and it is the one place the figures come with the form and
 * date they were filed in.
 *
 * US-LISTED FILERS ONLY, AND HONEST ABOUT IT. A ticker the SEC's own file
 * does not know, or a filer with no US-GAAP facts (an IFRS filer, a fund),
 * answers 200 with `listed: false` — a real answer about the symbol, not an
 * error.
 *
 * THE USER-AGENT. The SEC's fair-access policy requires automated requests
 * to declare themselves with a contact in the User-Agent header, and blocks
 * those that do not. That string is deployment configuration —
 * SEC_USER_AGENT, e.g. "Shift contact@example.com" — not something to
 * hardcode, so without it the route answers `not_configured` rather than
 * making a request that will be refused.
 *
 * DATA HONESTY CONTRACT:
 *   - Every figure is one the company filed, with the filing it came from.
 *     Nothing is derived: no Q4 from year-less-three-quarters, no gross
 *     profit from revenue-less-cost. A line the filing lacks is null.
 *   - `listed: false` and an empty statement list are real answers. Any
 *     failure — network, timeout, a blocked request, a shape we cannot read
 *     — is an error status with a code, never an empty list.
 */

/** Upstream budget per request. A company-facts payload can run to several MB. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000;

/** How many periods each span carries: five years, eight quarters. */
export const ANNUAL_PERIODS = 5;
export const QUARTERLY_PERIODS = 8;

/**
 * The ticker file is ~700 KB and changes rarely; it is read once per
 * function instance and reused for a day. A failed read is not cached, so a
 * transient error does not become a day of "not listed" answers.
 */
const TICKER_MAP_TTL_MS = 24 * 60 * 60_000;
let tickerMap: { at: number; map: Map<string, { cik: string; title: string | null }> } | null = null;

/** Drops the cached ticker file — for tests. */
export function resetTickerMapCache(): void {
  tickerMap = null;
}

/**
 * Six hours at the edge: statements change once a quarter, and a filing
 * landing this afternoon can wait until the evening. Stale-while-revalidate
 * so a reader never waits on the multi-megabyte upstream read for a company
 * someone opened earlier today.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';

const PROVIDER = 'SEC EDGAR';
const ROUTE = '/api/financials';
const SOURCE = 'sec:companyfacts';

/** The response body, in the shape the app's reader expects. */
export interface FinancialsBody {
  ticker: string;
  /** False when the SEC has no filer, or no US-GAAP facts, for this ticker. */
  listed: boolean;
  cik: string | null;
  entity: string | null;
  annual: StatementRow[];
  quarterly: StatementRow[];
  source: string;
}

function notListed(ticker: string): FinancialsBody {
  return { ticker, listed: false, cik: null, entity: null, annual: [], quarterly: [], source: SOURCE };
}

/**
 * The answer for a filer whose company-facts read succeeded.
 *
 * A CIK in the SEC's ticker file is not the same fact as US-GAAP data to
 * read. An IFRS filer or a fund answers 200 with no `us-gaap` key at all,
 * which readCompanyFacts reports as an empty facts map — and `listed: true`
 * for one of those told the reader "listed, no statements" where the truth
 * is "no US-GAAP statements to read". The route's own contract says as much;
 * only the 404 path was honouring it.
 *
 * Either way the identity is reported: the CIK and name were read
 * successfully, and withholding them would claim less than is known.
 */
function answerFor(ticker: string, company: CompanyFacts, title: string | null): FinancialsBody {
  const identity = { cik: company.cik, entity: company.entityName ?? title };
  if (company.facts.size === 0) return { ...notListed(ticker), ...identity };
  return {
    ticker,
    listed: true,
    ...identity,
    annual: buildStatements(company, 'annual', ANNUAL_PERIODS),
    quarterly: buildStatements(company, 'quarterly', QUARTERLY_PERIODS),
    source: SOURCE,
  };
}

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    const raw = req.query.symbol;
    if (Array.isArray(raw) && raw.length > 1) {
      return res
        .status(400)
        .json({ error: 'repeated_param', message: 'Query param "symbol" must be given once.' });
    }
    const symbol = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!symbol || !isValidTicker(symbol)) {
      return res
        .status(400)
        .json({ error: 'invalid_ticker', message: 'Query param "symbol" is required and must be a ticker.' });
    }
    const ticker = symbol.toUpperCase();

    const userAgent = process.env.SEC_USER_AGENT;
    if (!userAgent) {
      console.error(`${ROUTE}: SEC_USER_AGENT is not set`);
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'Financial statements are not configured.' });
    }
    const headers = { 'User-Agent': userAgent, Accept: 'application/json' };

    // ONE budget for the whole request, not one per read. A cold cache makes
    // two sequential upstream calls, and giving each its own `timeoutMs`
    // allowed 40s of waiting inside a function Vercel kills at 30 — the
    // caller would get no response at all rather than a timeout it could
    // report. Each read gets whatever is left, and a read whose share has
    // run out is asked for a moment rather than a negative span.
    const deadline = Date.now() + timeoutMs;
    const remaining = () => Math.max(1, deadline - Date.now());

    // The ticker file, from the cache when it is fresh.
    let map = tickerMap && Date.now() - tickerMap.at < TICKER_MAP_TTL_MS ? tickerMap.map : null;
    if (!map) {
      const result = await fetchUpstreamJson(TICKER_FILE_URL, remaining(), PROVIDER, ROUTE, {
        fetchImpl,
        headers,
      });
      if (!result.ok) return res.status(result.failure.status).json(failureBody(result.failure));
      map = readTickerMap(result.body);
      if (map === null) {
        console.error(`${ROUTE}: the SEC ticker file had an unexpected shape`);
        return res
          .status(502)
          .json({ error: 'bad_response', message: `The ${PROVIDER} provider returned an unexpected shape.` });
      }
      tickerMap = { at: Date.now(), map };
    }

    // Not in the SEC's file: not a US-listed filer. A real answer, cached
    // like one — a symbol that lists tomorrow shows up after the next read.
    const entry = map.get(secTicker(ticker));
    if (!entry) {
      res.setHeader('Cache-Control', CACHE_CONTROL);
      return res.status(200).json(notListed(ticker));
    }

    const facts = await fetchUpstreamJson(companyFactsUrl(entry.cik), remaining(), PROVIDER, ROUTE, {
      fetchImpl,
      headers,
    });
    if (!facts.ok) {
      // A filer with no XBRL facts at all answers 404 here — a fund, or a
      // company that has never filed a tagged statement. That is an answer
      // about the company, not a failure of the read.
      if (facts.failure.upstreamStatus === 404) {
        res.setHeader('Cache-Control', CACHE_CONTROL);
        return res.status(200).json(notListed(ticker));
      }
      return res.status(facts.failure.status).json(failureBody(facts.failure));
    }
    const company = readCompanyFacts(facts.body);
    if (company === null) {
      console.error(`${ROUTE}: company facts for ${ticker} had an unexpected shape`);
      return res
        .status(502)
        .json({ error: 'bad_response', message: `The ${PROVIDER} provider returned an unexpected shape.` });
    }

    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json(answerFor(ticker, company, entry.title));
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
