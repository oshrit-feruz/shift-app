/**
 * One honest read of one of this app's own routes.
 *
 * Three data modules — stats.ts, movers.ts and intraday.ts — had the same
 * twenty lines each: open an abort controller on a timeout, fetch, turn a
 * non-2xx into the route's own reason, parse, refuse a body the extractor does
 * not recognise, and never throw. Identical apart from the URL, the extractor
 * and the fallback sentence. That is worth having in one place beyond the
 * usual argument about repetition: every branch here is a rule from the data
 * honesty contract, and three copies of a contract are three chances for one
 * of them to quietly stop keeping it.
 *
 * WHAT IT GUARANTEES, so a caller does not restate it:
 * - It never throws and never rejects. A dead network, an aborted timeout and
 *   a body that is not JSON all come back as 'unavailable'.
 * - A failure carries the ROUTE's own reason where the route named one — "this
 *   subscription may not include this data" rather than "try again later" —
 *   falling back to the caller's sentence only when it did not.
 * - A body the extractor returns null for is 'unavailable', not empty data.
 *   The two may never collapse: "we could not read the answer" and "the answer
 *   is nothing" are different facts about the world.
 *
 * WHAT IT DELIBERATELY LEAVES TO THE CALLER: what an empty-but-valid answer
 * means. An empty stats map, an empty movers board and an empty intraday
 * session are all real answers, and each screen renders its own differently,
 * so the extractor's value is passed through as-is.
 */

import { reasonFromResponse, type Reason } from './providerReason';
import { ok, unavailable, type Loadable } from './types';

export async function readRoute<T>(
  url: string,
  options: Readonly<{
    /** A read that takes this long is broken by any measure. */
    timeoutMs: number;
    /** Used only when the route did not name a reason of its own. */
    fallbackReason: Reason;
    /** Returns null for a body this reader does not recognise. */
    extract: (body: unknown) => T | null;
  }>,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // The routes classify their own failures — a rejected key, a spent quota,
    // a provider timeout — and each needs different words.
    if (!res.ok) return unavailable(await reasonFromResponse(res, options.fallbackReason));

    const data = options.extract(await res.json());
    if (data === null) return unavailable(options.fallbackReason);
    return ok(data);
  } catch {
    return unavailable(options.fallbackReason);
  } finally {
    clearTimeout(timer);
  }
}
