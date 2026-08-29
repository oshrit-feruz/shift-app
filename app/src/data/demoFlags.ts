/**
 * The demo switches, in their own module.
 *
 * Separate from demoAdapter.ts because data/priceHistory.ts reads them too,
 * and demoAdapter imports priceHistory — putting the flags in the adapter
 * would make that a cycle.
 *
 * Storage is localStorage rather than app state because the data layer reads
 * these synchronously, outside React. The React side mirrors them through
 * lib/DemoModeProvider so a flip re-renders and re-fetches immediately; that
 * provider is the only writer, which keeps the two in step.
 */

export type DemoFlag = 'unavailable' | 'demoData';

export const DEMO_FLAGS = {
  key: { unavailable: 'shift.demo.unavailable', demoData: 'shift.demo.data' } as Record<DemoFlag, string>,
  read(flag: DemoFlag): boolean {
    try {
      return localStorage.getItem(this.key[flag]) === '1';
    } catch {
      return false;
    }
  },
  /** QA switch: the demo-backed fetches report 'unavailable' on purpose. */
  get unavailable(): boolean {
    return this.read('unavailable');
  },
  /**
   * Demo data: one switch, off by default, that makes every figure in the app
   * a sample figure.
   *
   * Price charts draw a generated series instead of the published sessions,
   * and the earnings surfaces render a full illustrative week and quarterly
   * history rather than only what the free data plan carries.
   *
   * This is the one thing that may substitute invented numbers for real ones,
   * and it is allowed to because the reader turned it on themselves: the
   * contract this app is built on is that invented figures never pass as real
   * *without the reader knowing*, and someone who flipped this switch knows.
   * Nothing reads it as a fallback — a live failure with the switch off still
   * reports itself as a failure.
   */
  get demoData(): boolean {
    return this.read('demoData');
  },
  set(flag: DemoFlag, on: boolean) {
    try {
      if (on) localStorage.setItem(this.key[flag], '1');
      else localStorage.removeItem(this.key[flag]);
    } catch {
      /* no storage — flags simply don't persist */
    }
  },
};
