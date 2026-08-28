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
}

const entries = new Map<string, Entry>();

export function cachedLoadable<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<Loadable<T>>,
): Promise<Loadable<T>> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.promise as Promise<Loadable<T>>;
  }
  const promise = fetcher().then(
    (result) => {
      if (result.status !== 'ok' && entries.get(key)?.promise === promise) entries.delete(key);
      return result;
    },
    (err: unknown) => {
      if (entries.get(key)?.promise === promise) entries.delete(key);
      throw err;
    },
  );
  entries.set(key, { promise, at: Date.now() });
  return promise;
}

/** Drop every cached entry. For tests. */
export function clearLoadableCache(): void {
  entries.clear();
}
