import type { DashboardResponse, ScreenerResponse } from './types';

/** Read-only client of the live Recovery Detector API. This app never
 *  mutates anything on the engine — GET requests only. On failure the UI
 *  shows an honest error state; there is deliberately no fallback data. */

const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'https://stock-screener-7lvr.onrender.com';

async function getJson<T>(path: string, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return getJson<DashboardResponse>('/api/beta/dashboard');
}

/** The screener recomputes on request and can take well over a minute on a
 *  cold service — the generous timeout is deliberate. */
export function fetchScreener(): Promise<ScreenerResponse> {
  return getJson<ScreenerResponse>('/api/screener', 180_000);
}
