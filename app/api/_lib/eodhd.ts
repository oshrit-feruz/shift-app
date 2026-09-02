/**
 * EODHD adapter — daily price history for the charts.
 *
 * WHY THIS EXISTS. The charts used to read Finnhub's `/stock/candle`, which
 * that provider moved to its paid tiers: a free key gets a 403, so every
 * chart, sparkline and bar-derived statistic in the app had been rendering
 * "this subscription may not include this data" (the honest sentence, but
 * still a dark chart). The account's EODHD subscription — EOD+Intraday, All
 * World Extended — covers daily OHLCV including volume, for US and non-US
 * exchanges alike, and the key is already server-side for /api/news. So the
 * charts come back on with a key that is already paid for and already set.
 *
 * WHAT IT SERVES, AND WHAT IT DELIBERATELY DOES NOT.
 * `/api/eod` answers one row per session with open, high, low, close,
 * adjusted_close and volume. This maps the RAW prices and ignores
 * `adjusted_close`, for a reason worth stating: the app draws candlesticks,
 * and the provider adjusts only the close. Deriving an adjusted open, high
 * and low by scaling them with the adjusted/raw ratio would put three prices
 * on screen that no one ever traded at, which is the one thing this codebase
 * does not do — and EODHD's adjustment folds in dividends as well as splits,
 * so the result is not a historical price at all. The honest cost of that
 * choice: a split inside the window draws as a cliff, because that is what
 * the raw price did. If a split-adjusted view is ever wanted it belongs
 * behind an explicit, labelled toggle, computed from the split feed (also on
 * this plan) rather than from a ratio applied to fields it does not describe.
 *
 * THE SYMBOL. EODHD addresses instruments as SYMBOL.EXCHANGE while the app
 * addresses them by bare ticker, and resolveSymbol below is the translation.
 * It lives here rather than beside the news route that first needed it,
 * because it encodes this provider's format and both routes want it to mean
 * the same thing.
 */

/** One daily bar, in the shape the app's charts already read. */
export interface CandleRow {
  d: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const API_ROOT = 'https://eodhd.com/api';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Every exchange code EODHD addresses, read from its own `/api/exchanges-list`
 * on 2026-09-02, plus INDX (the indices exchange, which that endpoint omits
 * and the docs use). It exists to answer one question: in "SOMETHING.X", is X
 * an exchange or part of the ticker?
 *
 * That question has to be asked, because the two conventions collide. This
 * app lets someone write a foreign listing as "MDA.TO" AND a class share as
 * "BRK.B" — the ledger's own column comment names both — while EODHD writes
 * the class share as "BRK-B.US" and reads "BRK.B" as ticker BRK on an
 * exchange called B. Verified against the live API: `BRK.B` answers with an
 * empty series and `BRK-B.US` answers with real sessions. Without this list
 * the app would have told a Berkshire holder "no price history for this
 * symbol" — which reads like a fact about the stock and would have been a
 * fact about our own translation instead.
 *
 * THE RESIDUAL AMBIGUITY, stated rather than hidden: a suffix this list does
 * not know is treated as part of the ticker, so a genuinely new EODHD
 * exchange would resolve to a US symbol that does not exist and the reader
 * would be told there is no history. The opposite default would break every
 * class share, which is far more common in this app, and both mistakes fail
 * the same honest way — an empty series, never a wrong number. Single-letter
 * exchange codes (V for TSX Venture, F for Frankfurt) are the sharp edge of
 * that trade: ".V" and ".F" resolve as exchanges, so a class V or F share
 * would need its hyphenated EODHD name typed in full.
 */
// prettier-ignore
const EXCHANGES = new Set([
  'AS', 'AT', 'AU', 'BA', 'BC', 'BK', 'BR', 'BUD',
  'CC', 'CM', 'CO', 'DSE', 'DU', 'EGX', 'EUFUND', 'F',
  'FOREX', 'GBOND', 'GSE', 'HA', 'HE', 'HM', 'INDX', 'IR',
  'JK', 'JSE', 'KAR', 'KLSE', 'KO', 'KQ', 'LIM', 'LS',
  'LSE', 'LU', 'LUSE', 'MC', 'MONEY', 'MSE', 'MU', 'MX',
  'NEO', 'OL', 'PA', 'PR', 'PSE', 'RO', 'RSE', 'SA',
  'SEM', 'SHE', 'SHG', 'SN', 'ST', 'STU', 'SW', 'TO',
  'TW', 'TWO', 'US', 'USE', 'V', 'VFEX', 'VI', 'VN',
  'WAR', 'XBOT', 'XETRA', 'XNAI', 'XNSA', 'XZIM', 'ZSE',
]);

/**
 * One app ticker as EODHD addresses it.
 *
 * Three cases: a bare ticker gets the US listing ("NVDA" -> "NVDA.US"); a
 * known exchange suffix is left exactly as written ("MDA.TO", "EURUSD.FOREX");
 * and anything else is a class share whose dots become the hyphens EODHD uses
 * ("BRK.B" -> "BRK-B.US"). A ticker already written the provider's way
 * ("RY-PT") only needs the exchange.
 */
export function resolveSymbol(ticker: string): string {
  // Trailing dots would otherwise produce an empty suffix and a trailing
  // hyphen ("NVDA." -> "NVDA-.US"), which is a symbol nobody meant.
  const clean = ticker.trim().toUpperCase().replace(/\.+$/, '');
  const dot = clean.lastIndexOf('.');
  if (dot === -1) return `${clean}.US`;
  if (EXCHANGES.has(clean.slice(dot + 1))) return clean;
  return `${clean.replace(/\./g, '-')}.US`;
}

/**
 * A YYYY-MM-DD stamp in UTC — the form EODHD's `from`/`to` take, and the form
 * the route already publishes as `as_of`.
 */
export function isoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True when the string is YYYY-MM-DD *and* a real calendar day.
 *
 * The round trip is the point, and it is the same guard the client's
 * staleness checks use: Date.UTC silently rolls 2026-02-31 forward into
 * March, so a shape test alone would let an impossible date through and the
 * chart would date a session to a day that never existed.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [, y, mo, d] = m;
  const back = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    back.getUTCFullYear() === Number(y) &&
    back.getUTCMonth() === Number(mo) - 1 &&
    back.getUTCDate() === Number(d)
  );
}

/**
 * The daily-history URL for one symbol over an inclusive date range.
 *
 * `period=d` is explicit rather than left to the provider's default: this
 * route serves daily bars and nothing else, and a default that changed
 * upstream would silently reshape every chart in the app.
 *
 * The key travels as a query parameter because that is the form EODHD's own
 * docs use for `api_token`; it never leaves the server either way, since only
 * this route builds the URL.
 */
export function eodUrl(symbol: string, from: string, to: string, apiKey: string): URL {
  const url = new URL(`${API_ROOT}/eod/${encodeURIComponent(resolveSymbol(symbol))}`);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  url.searchParams.set('period', 'd');
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('api_token', apiKey);
  return url;
}

/**
 * The key statistics a US stock page shows, as this provider reports them.
 *
 * Every field is nullable, and each null is a real answer rather than a gap
 * to paper over: an ETF has no P/E (verified — VTI comes back with `pe` and
 * `forwardPE` null), a company that pays nothing has no dividend yield
 * (Tesla's is null, not zero), and a newly listed one may have no 52-week
 * range yet. Zero is a number a reader believes; the app renders these as
 * "—" wherever they are null.
 *
 * Deliberately NOT here: a last price. This endpoint carries one, and it is
 * the delayed quote the plan advertises — the app's live price comes from
 * Finnhub and must keep coming from there. These are slow-moving figures
 * where a quarter-hour is meaningless, which is exactly why they are the
 * ones worth taking from a delayed feed.
 */
export interface UsStats {
  marketCap: number | null;
  /** Trailing P/E. */
  pe: number | null;
  forwardPE: number | null;
  /**
   * A FRACTION, not a percent — 0.0216 means 2.16%.
   *
   * The endpoint's own field table calls this "percent" and its example
   * shows 0.51 for Apple, which would read as 0.51%. The live API disagrees
   * with its documentation: Qualcomm answers 0.0216 while paying 3.68 on a
   * 166.61 price (2.21%), and Apple answers 0.0034 while paying 1.08 on
   * 324.79 (0.33%). Both check out as fractions, so the caller multiplies by
   * 100. Taken at the documentation's word this would have rendered a 2%
   * yield as "0.02%" — a real-looking number off by two orders of magnitude.
   */
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

/** The delayed US extended-quote URL for one or more symbols. */
export function usQuoteUrl(symbols: string[], apiKey: string): URL {
  const url = new URL(`${API_ROOT}/us-quote-delayed`);
  url.searchParams.set('s', symbols.map(resolveSymbol).join(','));
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('api_token', apiKey);
  return url;
}

/**
 * The per-symbol map out of a us-quote-delayed body, or null when the body is
 * not one.
 *
 * A symbol the endpoint does not carry is simply ABSENT from that map rather
 * than present-and-empty — asking for TSLA.US, VTI.US, MDA.TO and a made-up
 * ticker returns a map of two. So an absent key means "this endpoint has
 * nothing for that symbol", which is a fact about the symbol and not a
 * failure, and the caller renders it as "—" rather than as an error.
 */
export function readUsQuoteData(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const data = (body as Record<string, unknown>).data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

/** A finite number, or null for anything else — including the provider's own nulls. */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Map one symbol's row into UsStats, or null when the row is not an object.
 *
 * Individual fields are read leniently because the provider genuinely omits
 * them per instrument type, but a non-positive market cap, P/E or price is
 * refused rather than shown: those are quantities that cannot be zero or
 * negative for a listed company, so a zero is the provider saying nothing
 * rather than saying zero, and printing "P/E 0.0" would be a claim.
 */
export function mapUsStats(raw: unknown): UsStats | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const positive = (v: unknown): number | null => {
    const n = numOrNull(v);
    return n !== null && n > 0 ? n : null;
  };
  return {
    marketCap: positive(row.marketCap),
    pe: positive(row.pe),
    forwardPE: positive(row.forwardPE),
    // Not `positive`: a zero yield is a real answer for a company that pays
    // nothing, and this provider uses null for "no dividend at all".
    dividendYield: numOrNull(row.dividendYield),
    fiftyTwoWeekHigh: positive(row.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: positive(row.fiftyTwoWeekLow),
  };
}

/**
 * Map one raw EODHD row into a CandleRow, or null when it is not one.
 *
 * Every field is required and every price must describe a session that could
 * have happened. A high is the highest the session traded and a low the
 * lowest, so the open and the close both sit between them; a bar whose open
 * is above its own high draws a wick pointing the wrong way, which a reader
 * cannot see through. Prices are positive by definition, and a negative
 * volume is not a smaller volume. Nothing is clamped: the honest answer to a
 * nonsense bar is not a guess about which field was wrong.
 *
 * Volume is required rather than defaulted to zero. It is not decoration —
 * the volume pane, the "Volume" stat and the average-volume stat all read it
 * — and a zero would render as a session in which nothing changed hands.
 */
function mapRow(raw: unknown): CandleRow | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const { date, open, high, low, close, volume } = row;

  if (!isCalendarDate(date)) return null;
  if (!isNum(open) || !isNum(high) || !isNum(low) || !isNum(close) || !isNum(volume)) return null;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) return null;
  if (low > high || open < low || open > high || close < low || close > high) return null;

  return { d: date.trim(), o: open, h: high, l: low, c: close, v: volume };
}

/**
 * Map an `/api/eod` body into bars.
 *
 * Three outcomes, kept apart because the app renders them differently:
 *   - an array of bars -> real sessions
 *   - []               -> the provider genuinely has no series for this
 *                         symbol (it answers an empty array for a ticker it
 *                         does not carry); a real answer, not a failure
 *   - null             -> a body we do not recognise, reported as such
 *
 * A single unreadable row invalidates the whole series rather than being
 * dropped, matching the contract the route has always kept: a chart is read
 * as a whole, and a series with silently missing sessions is a picture of
 * price action that never happened.
 */
export function mapEodBars(body: unknown): CandleRow[] | null {
  if (!Array.isArray(body)) return null;
  if (body.length === 0) return [];

  const rows: CandleRow[] = [];
  for (const raw of body) {
    const bar = mapRow(raw);
    if (bar === null) return null;
    rows.push(bar);
  }
  // The dates are ISO YYYY-MM-DD, so lexicographic order is chronological.
  // The provider already sorts ascending; the route's own output contract
  // says oldest first, and re-sorting costs nothing next to trusting it.
  rows.sort((a, z) => a.d.localeCompare(z.d));
  return rows;
}
