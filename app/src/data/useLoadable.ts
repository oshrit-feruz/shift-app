import { useCallback, useEffect, useState } from 'react';
import { loading, type Loadable } from './types';

/** Fetch-once hook around a DataService method, with retry for the honest
 *  'unavailable' state. */
export function useLoadable<T>(fetcher: () => Promise<Loadable<T>>, deps: unknown[] = []) {
  const [state, setState] = useState<Loadable<T>>(loading());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
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
