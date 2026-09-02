/**
 * Tiny module-level cache for Loadable fetchers.
 *
 * Screens unmount on every tab switch, so without this each navigation
 * re-fires the same network reads (and concurrent mounts fire them in
 * parallel). Sharing the in-flight promise dedupes concurrent callers, and
 * keeping a successful result for a short TTL turns re-entry into a cache
 * hit.
 *
 * Only 'ok' results stay cached: a loading promise that settles to
 * 'unavailable' is evicted immediately, so a retry (or the next mount) hits
 * the network again instead of replaying the failure for the whole TTL.
 *
 * Callers that inject a test fetchImpl bypass this module entirely — see the
 * call sites — so tests keep their isolation without touching cache state.
 */

import type { Loadable } from './types';

interface Entry {
  promise: Promise<Loadable<unknown>>;
  at: number;
  /** This entry's own TTL, kept so the sweep below can judge it. */
  ttlMs: number;
  /** In-flight entries are never swept; only settled ones can expire. */
  settled: boolean;
}

const entries = new Map<string, Entry>();

/**
 * Drop settled entries whose TTL has passed. Ran opportunistically on every
 * lookup: expired keys that are re-requested get overwritten anyway, but a
 * long session opening many unique keys (one per ticker) would otherwise
 * retain every stale payload for its lifetime. In-flight work is exempt so a
 * slow fetch is never discarded mid-air.
 */
function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.settled && now - entry.at >= entry.ttlMs) entries.delete(key);
  }
}

export function cachedLoadable<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<Loadable<T>>,
): Promise<Loadable<T>> {
  sweep();
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.promise as Promise<Loadable<T>>;
  }
  // The callbacks below run only after this whole block: promises settle
  // asynchronously, so referencing `entry` inside them is safe.
  let entry: Entry;
  const promise = fetcher().then(
    (result) => {
      entry.settled = true;
      if (result.status !== 'ok' && entries.get(key) === entry) entries.delete(key);
      return result;
    },
    (err: unknown) => {
      entry.settled = true;
      if (entries.get(key) === entry) entries.delete(key);
      throw err;
    },
  );
  entry = { promise, at: Date.now(), ttlMs, settled: false };
  entries.set(key, entry);
  return promise;
}

/** Drop every cached entry. For tests. */
export function clearLoadableCache(): void {
  entries.clear();
}

/**
 * Drop the entries whose key starts with `prefix`.
 *
 * One caller's cache and this shared one can hold two halves of the same
 * answer — the quote layer keys a batch response here while keeping the
 * per-ticker quotes itself — and clearing only its own half leaves the batch
 * to be replayed for the rest of the TTL. A caller that owns a key prefix can
 * drop both halves together.
 */
export function clearLoadableCachePrefix(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
