import { useCallback, useEffect, useState } from 'react';
import { fetchDashboard, fetchScreener } from './client';
import type { DashboardResponse, ScreenerResponse } from './types';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

/** Module-level promise caches so screens share one in-flight request per
 *  session instead of re-hitting the API on every navigation. `retry`
 *  clears the cache and refetches. */
let dashboardPromise: Promise<DashboardResponse> | null = null;
let screenerPromise: Promise<ScreenerResponse> | null = null;

function useCached<T>(get: () => Promise<T>, invalidate: () => void): [ApiState<T>, () => void] {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    get()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch(() => {
        invalidate();
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // get/invalidate are stable module-level accessors
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  const retry = useCallback(() => {
    invalidate();
    setState({ status: 'loading' });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return [state, retry];
}

export function useDashboard(): [ApiState<DashboardResponse>, () => void] {
  return useCached(
    () => (dashboardPromise ??= fetchDashboard()),
    () => {
      dashboardPromise = null;
    },
  );
}

export function useScreener(): [ApiState<ScreenerResponse>, () => void] {
  return useCached(
    () => (screenerPromise ??= fetchScreener()),
    () => {
      screenerPromise = null;
    },
  );
}
