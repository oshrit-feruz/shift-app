import { useCallback, useLayoutEffect, useState } from 'react';
import { loading, type Loadable } from './types';

/** Fetch-once hook around a DataService method, with retry for the honest
 *  'unavailable' state.
 *
 *  The fetch is kicked off in a LAYOUT effect on purpose. A passive effect
 *  runs after paint, so even a fetcher that resolves immediately — demo data,
 *  or a loadableCache hit whose promise has already settled — painted one
 *  frame of skeleton before the result landed: a visible flash on every
 *  screen entry and tab return. A layout effect runs before paint, and an
 *  already-settled promise delivers its result in a microtask of the same
 *  task, so the re-render with real data commits before the browser paints —
 *  cached data shows from the first frame, while a genuinely slow fetch still
 *  paints the skeleton exactly as before. */
export function useLoadable<T>(fetcher: () => Promise<Loadable<T>>, deps: unknown[] = []) {
  const [state, setState] = useState<Loadable<T>>(loading());
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    let alive = true;
    // Reset for the slow path (a deps change to data not yet cached); on the
    // fast path the settled result overwrites this before anything paints.
    setState(loading());
    fetcher().then((r) => {
      if (alive) setState(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { state, retry };
}
