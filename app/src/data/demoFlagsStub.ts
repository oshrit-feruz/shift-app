import { vi } from 'vitest';
import { DEMO_FLAGS } from './demoFlags';

/**
 * Test-only: put the `demoData` flag in a known state.
 *
 * DEMO_FLAGS reads localStorage synchronously, and vitest provides none — so
 * an unstubbed run reads false, which is itself the assertion for every "off"
 * case. This installs a minimal store for the cases that need it on.
 *
 * Shared rather than copied into each suite: two suites need it, and the same
 * thirteen lines in both is what SonarCloud's duplication gate flagged. Pair
 * every call with `vi.unstubAllGlobals()` in an afterEach.
 *
 * Not named `*.test.ts` on purpose — vitest's default include would then
 * collect it as a suite with no tests in it.
 */
export function withDemoData(on: boolean): void {
  const store = new Map<string, string>();
  if (on) store.set(DEMO_FLAGS.key.demoData, '1');
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
