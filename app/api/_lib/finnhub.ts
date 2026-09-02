/**
 * Finnhub adapter — the app's live quote provider.
 *
 * Finnhub replaced the daily screener snapshot that used to stand in for a
 * price: a once-a-day file, because the previous provider could not be called
 * from a browser at all (Alpha Vantage's free key allows tens of requests a
 * day, and it moved `outputsize=full` behind a subscription, which is what
 * left the price mirror publishing nothing). Finnhub answers 60 requests a
 * minute on a free key, so a quote can simply be fetched when it is wanted.
 *
 * ONE ENDPOINT, ON PURPOSE. This file used to carry `/stock/candle` too, for
 * the charts, and that endpoint is on Finnhub's paid tiers: a free key gets a
 * 403, so every chart in the app was dark. The charts now read EODHD's daily
 * history instead (_lib/eodhd.ts), on a subscription this account already
 * pays for. The quotes deliberately did NOT move with them — EODHD's REST
 * quote is the delayed one its plan advertises (measured 15-19 minutes behind
 * on an open exchange), while Finnhub's `/quote` is the live price every
 * screen prints. Two providers is the cost of having both a real chart and a
 * real price.
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

const API_ROOT = 'https://finnhub.io/api/v1';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The ISO instant for a UNIX-second stamp, or null when that is not a date.
 *
 * `isNum` accepts any finite number, and JavaScript's Date covers only ±8.64e15
 * ms — so a stamp a few orders of magnitude too large builds an Invalid Date
 * whose toISOString() throws a RangeError. Thrown from inside a mapper that is
 * documented never to throw, that became a 500 from the platform instead of
 * this app's own honest JSON, and the quote route lost the whole batch.
 * Returning null keeps a nonsense timestamp on the same path as any other
 * unreadable field.
 */
function isoFromUnixSeconds(seconds: number): string | null {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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
  // No usable previous close, no quote. A day change has to be measured from
  // somewhere: with `pc` at zero the currency change comes out as the entire
  // price and the percentage as 0.00%, which is not a smaller truth than a
  // dash but a contradiction — "+$150.00" and "0.00%" printed side by side,
  // both from the same row. A Quote is whole or absent (see data/types.ts),
  // and this one cannot be whole.
  if (pc <= 0) return null;
  const asOf = isoFromUnixSeconds(t);
  if (asOf === null) return null;
  const change = c - pc;
  const dayHigh = isNum(h) && h > 0 ? h : c;
  const dayLow = isNum(l) && l > 0 ? l : c;
  const open = isNum(o) && o > 0 ? o : c;
  // The session numbers have to describe a session that could happen. An
  // inverted range renders on the stock page as "Day range 12.00–9.00", and
  // an open above the day's high is a number the reader has no way to tell
  // is impossible. The fallbacks above can produce either from a provider
  // row that is individually well-formed, so the check belongs after them.
  //
  // The last price is deliberately NOT range-checked: extended-hours trading
  // legitimately puts `c` outside a high and low that cover the regular
  // session, so rejecting on that would throw away good quotes.
  if (dayHigh < dayLow || open < dayLow || open > dayHigh) return null;
  return {
    price: c,
    change,
    changePct: (change / pc) * 100,
    prevClose: pc,
    dayHigh,
    dayLow,
    open,
    asOf,
  };
}
