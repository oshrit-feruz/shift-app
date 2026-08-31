import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loading, type Loadable } from './types';

/** Fetch-once hook around a DataService method, with retry for the honest
 *  'unavailable' state, and an optional silent refresh for live data.
 *
 *  The fetch is kicked off in a LAYOUT effect on purpose. A passive effect
 *  runs after paint, so even a fetcher that resolves immediately — demo data,
 *  or a loadableCache hit whose promise has already settled — painted one
 *  frame of skeleton before the result landed: a visible flash on every
 *  screen entry and tab return. A layout effect runs before paint, and an
 *  already-settled promise delivers its result in a microtask of the same
 *  task, so the re-render with real data commits before the browser paints —
 *  cached data shows from the first frame, while a genuinely slow fetch still
 *  paints the skeleton exactly as before.
 *
 *  `refreshMs` re-reads on an interval, for the screens whose numbers move
 *  while they are on screen: prices. Three properties make it safe to point at
 *  a live source:
 *
 *  - It is SILENT. A refresh never resets to 'loading', so a screen showing
 *    prices does not blink back to skeletons every few seconds.
 *  - A failed refresh KEEPS the last good data rather than replacing a screen
 *    of real prices with an error because one poll timed out. The first read
 *    still reports its failure honestly — that is the state the reader needs
 *    to see, and there is nothing behind it to keep.
 *  - It does not run while the tab is hidden — it never starts there either,
 *    not just stops on the way — and reads once on return. Polling a
 *    backgrounded tab spends the provider's quota on numbers nobody is
 *    looking at, and coming back to a minute-old price is the thing the
 *    interval exists to prevent.
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

  useLayoutEffect(() => {
    let alive = true;
    // Reset for the slow path (a deps change to data not yet cached); on the
    // fast path the settled result overwrites this before anything paints.
    setState(loading());
    latest.current().then((r) => {
      if (alive) setState(r);
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
      latest.current().then((r) => {
        // Only a good read replaces what is on screen. See the note above:
        // one failed poll must not take a screenful of real prices away.
        if (alive && r.status === 'ok') setState(r);
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
