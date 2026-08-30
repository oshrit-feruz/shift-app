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

export type DemoFlag = 'unavailable' | 'demoData' | 'liveAccount';

/**
 * What the flags read when localStorage cannot be reached.
 *
 * Storage throws outright in some browser configurations (Safari private mode,
 * cookies blocked). Without this, `set` would silently do nothing while
 * DemoModeProvider's own state went to `true` — the switch would look on and
 * the data layer would keep reading false, so charts would never change. This
 * keeps the two in step for the session even when nothing can be persisted.
 */
const memory = new Map<DemoFlag, boolean>();

/**
 * Subscribers notified when any flag flips — see data/useDemoFlag.ts.
 *
 * DemoModeProvider mirrors `demoData` into React state and is its only
 * writer, which covers that flag. `liveAccount` is read straight out of
 * storage by useDemoFlag() instead, so it needs a change signal of its own;
 * this is it. Both go through `set` below, so neither can drift.
 */
const listeners = new Set<() => void>();

export const DEMO_FLAGS = {
  key: {
    unavailable: 'shift.demo.unavailable',
    demoData: 'shift.demo.data',
    liveAccount: 'shift.demo.liveAccount',
  } as Record<DemoFlag, string>,
  read(flag: DemoFlag): boolean {
    try {
      const raw = localStorage.getItem(this.key[flag]);
      // An absent key falls through to memory rather than answering false:
      // `set(flag, false)` removes the key, and memory carries that same
      // answer, so the two agree either way.
      if (raw !== null) return raw === '1';
    } catch {
      /* fall through to memory */
    }
    return memory.get(flag) ?? false;
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
  /**
   * Founder-demo switch: replace the demo adapter's accounts and holdings
   * with the one real brokerage account read through SnapTrade Personal
   * (see data/snaptradeAccount.ts). Off by default, and off means the app
   * behaves exactly as it did before this flag existed — every surface it
   * touches falls straight back to the demo adapter.
   *
   * Unlike demoData this never substitutes invented numbers: it swaps one
   * real source in. A failure behind it still reports itself as a failure.
   */
  get liveAccount(): boolean {
    return this.read('liveAccount');
  },
  set(flag: DemoFlag, on: boolean) {
    // Recorded before the write, so the flag still answers correctly for this
    // session when the write below throws.
    memory.set(flag, on);
    try {
      if (on) localStorage.setItem(this.key[flag], '1');
      else localStorage.removeItem(this.key[flag]);
    } catch {
      /* no storage — the flag holds for this session but does not persist */
    }
    // After the write, and regardless of whether it threw: the flag is in
    // effect for this session either way, so readers must re-render either way.
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
