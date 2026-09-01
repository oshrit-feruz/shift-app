import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loading, type Loadable } from './types';

/**
 * Loads a value and optionally refreshes it silently at a fixed interval.
 *
 * Initial loads report loading, success, or failure. Refreshes replace the
 * current value only when successful, pause while the document is hidden, and
 * run immediately when visibility returns.
 *
 * @param fetcher - Function that retrieves the loadable value
 * @param deps - Values that trigger a new initial load when they change
 * @param refreshMs - Refresh interval in milliseconds, or undefined to disable refreshing
 * @returns The current loadable state and a function that retries the initial load
 */
export function useLoadable<T>(
  fetcher: () => Promise<Loadable<T>>,
  deps: unknown[] = [],
  refreshMs?: number,
) {
  const [state, setState] = useState<Loadable<T>>(loading());
  const [tick, setTick] = useState(0);

  // The fetcher is rebuilt on every render by every call site; the effects
  // below must call the newest one without re-subscribing for it.
  const latest = useRef(fetcher);
  latest.current = fetcher;

  /**
   * Which read is the current one. Shared by BOTH paths below, because the
   * race crosses them.
   *
   * Reads are not ordered by when they were started. Leaving a tab with a
   * poll in flight and coming straight back fires a second read while the
   * first is still on the wire — and the second usually answers first, out of
   * the quote layer's short cache, while the first is still waiting on the
   * network. Without this, that first read then lands on top of the newer one
   * and puts an older price back on screen, which is exactly what a live
   * price may not do. Every read takes a number and only the newest may
   * write.
   */
  const generation = useRef(0);

  useLayoutEffect(() => {
    let alive = true;
    // Reset for the slow path (a deps change to data not yet cached); on the
    // fast path the settled result overwrites this before anything paints.
    setState(loading());
    const mine = ++generation.current;
    latest.current().then((r) => {
      if (alive && mine === generation.current) setState(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    let alive = true;
    const refresh = () => {
      const mine = ++generation.current;
      latest.current().then((r) => {
        // Only a good read replaces what is on screen, and only the newest
        // one. See the notes above: one failed poll must not take a screenful
        // of real prices away, and a slow read must not undo a fast one.
        if (alive && mine === generation.current && r.status === 'ok') setState(r);
      });
    };
    // Not started at all while the document is hidden. Mounting in a
    // background tab used to arm the interval anyway, and it then polled
    // until the first visibility change — spending the provider's quota on
    // numbers nobody could see, which is the opposite of what the pause
    // below is for.
    let timer: number | undefined;
    const start = () => {
      timer = window.setInterval(refresh, refreshMs);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    if (document.visibilityState !== 'hidden') start();
    const onVisibility = () => {
      stop();
      if (document.visibilityState === 'hidden') return;
      // Back on screen: read immediately, because whatever is showing was
      // last true when the tab was hidden, then resume the cadence.
      refresh();
      start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, refreshMs]);

  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { state, retry };
}
