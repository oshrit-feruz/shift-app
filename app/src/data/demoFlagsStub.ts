import { vi } from 'vitest';
import { DEMO_FLAGS } from './demoFlags';

/**
 * Stubs `localStorage` with the specified `demoData` flag state for tests.
 *
 * @param on - Whether to enable the `demoData` flag
 */
export function withDemoData(on: boolean): void {
  const store = new Map<string, string>();
  store.set(DEMO_FLAGS.key.demoData, on ? '1' : '0');
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
}
