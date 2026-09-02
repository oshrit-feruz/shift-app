import { failureBody, type UpstreamResult } from './upstream.js';
import { type CandleRow } from './eodhd.js';

/**
 * The step /api/candles and /api/intraday both take: an upstream result in,
 * bars or a response out.
 *
 * Both routes ask EODHD for a price series and both then have to sort the same
 * three outcomes apart. It is the same thirteen lines in each, and the reason
 * to have it once is not brevity — it is that those three branches ARE the
 * routes' honesty contract, and two copies of a contract are two chances for
 * one of them to quietly stop keeping it.
 *
 * THE MIDDLE BRANCH IS WHY THIS IS NOT A PLAIN `if (!result.ok)`. A 404 is the
 * provider naming the symbol rather than failing on it: EODHD answers one for
 * a ticker it does not carry, where Finnhub answered 200 with `s: 'no_data'`.
 * That means "no series for this symbol" — a real answer, rendered as such —
 * and passing it to the failure classifier turns it into "unavailable", which
 * tells the reader we could not find out when in fact we were told. Those two
 * may never collapse. Both routes build the request path from an
 * already-validated ticker, so the symbol is the only thing a 404 can be
 * about.
 */
export type BarsOutcome =
  { ok: true; bars: CandleRow[] } | { ok: false; status: number; body: Record<string, unknown> };

export function barsFromUpstream(
  result: UpstreamResult,
  mapBars: (body: unknown) => CandleRow[] | null,
  route: string,
): BarsOutcome {
  let bars: CandleRow[] | null;
  if (result.ok) {
    bars = mapBars(result.body);
  } else if (result.failure.upstreamStatus === 404) {
    bars = [];
  } else {
    return { ok: false, status: result.failure.status, body: failureBody(result.failure) };
  }
  if (bars === null) {
    console.error(`${route}: upstream response had an unexpected shape`);
    return {
      ok: false,
      status: 502,
      body: {
        error: 'bad_response',
        message: 'The price-history provider returned an unexpected shape.',
      },
    };
  }
  return { ok: true, bars };
}
