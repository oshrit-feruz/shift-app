/**
 * Ids for rows the user creates on their device — alerts, manual portfolios,
 * transactions.
 *
 * Not `Math.random()`. These ids end up as keys in the persisted slice that
 * syncs to the user's Supabase row, so they are identifiers in stored data
 * rather than throwaway UI keys, and a predictable generator is the kind of
 * thing that is fine until the day the id is used to address something.
 * The platform already ships a proper source of randomness; there is no
 * reason to reach for a weaker one.
 *
 * `crypto.randomUUID` needs a secure context, which the app always has in
 * production but not necessarily on a plain-http LAN address during
 * development — hence the getRandomValues step before the last resort.
 */

/** Monotonic within a session; only reached when the platform has no crypto. */
let fallbackCounter = 0;

/** A prefixed, collision-free id for one locally created row. */
export function newId(prefix: string): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`;
  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(8));
    return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  // No crypto at all. A counter is still unique within this session, which is
  // all an id for a locally-created row has to be — and it is honest about
  // being a fallback rather than quietly reintroducing a weak PRNG.
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
