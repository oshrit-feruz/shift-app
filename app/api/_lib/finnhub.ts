/**
 * Finnhub adapter — the app's live market-data provider.
 *
 * Finnhub replaced two things at once: the daily screener snapshot that used
 * to stand in for a price, and the daily bar mirror the charts read. Both
 * were once-a-day files because the previous providers could not be called
 * from a browser at all (Alpha Vantage's free key allows tens of requests a
 * day, and it moved `outputsize=full` behind a subscription, which is what
 * left the price mirror publishing nothing). Finnhub answers 60 requests a
 * minute on a free key, so a quote can simply be fetched when it is wanted.
 *
 * TWO ENDPOINTS, TWO PLANS — carried honestly rather than hidden:
 *   /quote         real-time last price and day change. Free.
 *   /stock/candle  daily bars for the charts. Answers 403 on a free key;
 *                  Finnhub moved historical candles to its paid tiers.
 * The 403 is already classified by _lib/upstream as `upstream_forbidden`,
 * which the app renders as "this subscription may not include this data" —
 * the one message that is true of it. Nothing here degrades to invented
 * bars, and nothing pretends the endpoint is missing when it is only unpaid.
 *
 * THE ZERO-QUOTE TRAP, and why mapQuote is written the way it is: Finnhub
 * answers an unknown symbol with HTTP 200 and every field set to zero rather
 * than with a 404. A caller that trusts the status code therefore renders a
 * real-looking $0.00 for a typo — the exact class of quiet falsehood this
 * app exists to remove — so a quote whose timestamp is missing or zero is
 * read as "no such symbol here", not as a price.
 */

/** One real-time quote, already mapped out of Finnhub's single-letter keys. */
export interface QuoteRow {
  /** Last traded price. */
  price: number;
  /** Day change in currency, signed. */
  change: number;
  /** Day change in percent, signed. */
  changePct: number;
  /** Previous session's close, which the change is measured from. */
  prevClose: number;
  /** Session high, low and open. */
  dayHigh: number;
  dayLow: number;
  open: number;
  /** When the provider stamped the quote, as an ISO instant. */
  asOf: string;
}

/** One daily bar, in the shape the app's charts already read. */
export interface CandleRow {
  d: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const API_ROOT = 'https://finnhub.io/api/v1';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The quote URL for one symbol.
 *
 * The key travels as a query parameter because that is the form Finnhub's
 * own docs use for `token`; it never leaves the server either way, since
 * only these routes build the URL.
 */
export function quoteUrl(symbol: string, apiKey: string): URL {
  const url = new URL(`${API_ROOT}/quote`);
  url.searchParams.set('symbol', symbol.trim().toUpperCase());
  url.searchParams.set('token', apiKey);
  return url;
}

/**
 * The candle URL for one symbol over a UNIX-second window.
 *
 * Resolution is fixed at 'D' by the only caller: everything the app draws is
 * built on daily bars (see the timeframe row on the stock screen), and an
 * intraday resolution would need a chart that can draw one.
 */
export function candleUrl(symbol: string, from: number, to: number, apiKey: string): URL {
  const url = new URL(`${API_ROOT}/stock/candle`);
  url.searchParams.set('symbol', symbol.trim().toUpperCase());
  url.searchParams.set('resolution', 'D');
  url.searchParams.set('from', String(Math.floor(from)));
  url.searchParams.set('to', String(Math.floor(to)));
  url.searchParams.set('token', apiKey);
  return url;
}

/**
 * Map a /quote body into a QuoteRow, or null when it is not one.
 *
 * Null covers two cases that look identical on the wire and are identical in
 * meaning to a caller: a body of a shape we do not recognise, and Finnhub's
 * all-zero answer for a symbol it does not carry. Both mean "no price for
 * this symbol", which the app renders as "—".
 *
 * `dp` (percent) is recomputed from `c` and `pc` rather than trusted, for the
 * one case where the provider sends the price and the previous close but
 * leaves the derived fields at zero: a real -3% shown as 0.00% is worse than
 * a dash, because a reader acts on it.
 */
export function mapQuote(body: unknown): QuoteRow | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const { c, pc, h, l, o, t } = b;
  if (!isNum(c) || !isNum(pc) || !isNum(t)) return null;
  // The zero-quote trap: no timestamp, or a zero price, is Finnhub's way of
  // saying it has never seen this symbol.
  if (t <= 0 || c <= 0) return null;
  const change = c - pc;
  return {
    price: c,
    change,
    // A previous close of zero makes a percentage undefined, not infinite —
    // an IPO's first session is the honest example. Zero change is the only
    // claim that is true of it.
    changePct: pc > 0 ? (change / pc) * 100 : 0,
    prevClose: pc,
    dayHigh: isNum(h) && h > 0 ? h : c,
    dayLow: isNum(l) && l > 0 ? l : c,
    open: isNum(o) && o > 0 ? o : c,
    asOf: new Date(t * 1000).toISOString(),
  };
}

/**
 * Map a /stock/candle body into bars.
 *
 * Three outcomes, kept apart because the app renders them differently:
 *   - an array of bars       -> real history
 *   - []  (`s: 'no_data'`)   -> the provider genuinely has no series for this
 *                               symbol; a real answer, not a failure
 *   - null                   -> a body we do not recognise, reported as such
 *
 * A single unreadable row invalidates the whole series rather than being
 * dropped: a chart is read as a whole, and a series with silently missing
 * sessions is a picture of price action that never happened.
 */
export function mapCandles(body: unknown): CandleRow[] | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.s === 'no_data') return [];
  if (b.s !== 'ok') return null;

  const { t, o, h, l, c, v } = b;
  if (!Array.isArray(t) || !Array.isArray(o) || !Array.isArray(h)) return null;
  if (!Array.isArray(l) || !Array.isArray(c) || !Array.isArray(v)) return null;
  // Parallel arrays are only meaningful together: differing lengths mean the
  // rows cannot be reassembled, and pairing them anyway would invent bars.
  const n = t.length;
  if (n === 0) return null;
  if (o.length !== n || h.length !== n || l.length !== n || c.length !== n || v.length !== n) return null;

  const rows: CandleRow[] = [];
  for (let i = 0; i < n; i++) {
    const ts = t[i];
    if (!isNum(ts) || ts <= 0) return null;
    if (!isNum(o[i]) || !isNum(h[i]) || !isNum(l[i]) || !isNum(c[i]) || !isNum(v[i])) return null;
    if (h[i] < l[i]) return null;
    rows.push({
      d: new Date(ts * 1000).toISOString().slice(0, 10),
      o: o[i],
      h: h[i],
      l: l[i],
      c: c[i],
      v: v[i],
    });
  }
  // The dates are ISO YYYY-MM-DD, so lexicographic order is chronological.
  rows.sort((a, z) => a.d.localeCompare(z.d));
  return rows;
}
