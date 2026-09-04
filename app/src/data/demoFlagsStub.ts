import { vi } from 'vitest';
import { DEMO_FLAGS } from './demoFlags';

/**
 * Test-only: put the `demoData` flag in a known state.
 *
 * DEMO_FLAGS reads localStorage synchronously and vitest provides none, so an
 * unstubbed run gets the flag's DEFAULT — which for `demoData` is now OFF.
 * Every suite that depends on the switch still has to say which state it
 * means, in BOTH directions: this writes the key explicitly rather than
 * leaving it absent, because absent is "no choice yet" and a suite that
 * relied on the default would silently change meaning the next time the
 * default does.
 *
 * Shared rather than copied into each suite: several suites need it, and the
 * same thirteen lines in each is what SonarCloud's duplication gate flagged.
 * Pair every call with `vi.unstubAllGlobals()` in an afterEach.
 *
 * Not named `*.test.ts` on purpose — vitest's default include would then
 * collect it as a suite with no tests in it.
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
