import { useCallback, useSyncExternalStore } from 'react';

/** Locally-recorded acknowledgements of recommendations. Acknowledging
 *  never executes anything — it only marks that the user read and
 *  confirmed the suggested change (the disclosure copy says exactly that). */

const STORAGE_KEY = 'shift.actions.v1';

let cache: Record<string, string> | null = null;
const listeners = new Set<() => void>();

function read(): Record<string, string> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Record<string, string>) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // persistence is best-effort
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCompletedActions(): [Record<string, string>, (id: string) => void] {
  const completed = useSyncExternalStore(subscribe, read);
  const complete = useCallback((id: string) => {
    write({ ...read(), [id]: new Date().toISOString() });
  }, []);
  return [completed, complete];
}
