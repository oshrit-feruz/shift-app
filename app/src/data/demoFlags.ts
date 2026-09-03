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
 * What each flag answers before anyone has chosen.
 *
 * `demoData` starts ON. The app is a demonstration first: with it off, a
 * first-time reader lands on a home screen where the movers card, the
 * portfolio and the earnings week are all "only available in demo"
 * placeholders and the watchlist is empty, so there is nothing on screen to
 * look at — including none of the live prices, because a price needs a stock
 * to be about. On, the app shows itself, and every invented figure in it is
 * still labelled as sample data by the switch that produced it. The live
 * halves stay live either way: prices and the day change beside them come
 * from the quote route with the switch in either position.
 *
 * `unavailable` starts off: it is a QA switch for rendering failure states on
 * purpose, which is not a state to put a reader in without them asking.
 *
 * There used to be a third flag, `liveAccount`, that pointed the app at the
 * one real brokerage account while sample data stayed on. It is gone: with
 * sample data OFF the accounts are the real ones (data/appService.ts), so one
 * switch answers "is this money real" instead of two.
 */
const DEFAULTS: Record<DemoFlag, boolean> = {
  unavailable: false,
  demoData: true,
};

/**
 * Subscribers notified when any flag flips — see data/useDemoFlag.ts.
 *
 * DemoModeProvider mirrors `demoData` into React state and is its only
 * writer; anything reading a flag straight out of storage needs a change
 * signal of its own, and this is it. Every write goes through `set` below, so
 * the two cannot drift.
 */
const listeners = new Set<() => void>();

export const DEMO_FLAGS = {
  key: {
    unavailable: 'shift.demo.unavailable',
    demoData: 'shift.demo.data',
  } as Record<DemoFlag, string>,
  read(flag: DemoFlag): boolean {
    try {
      const raw = localStorage.getItem(this.key[flag]);
      // A stored value is always an explicit choice, in either direction —
      // `set` writes '0' for off rather than removing the key. It has to:
      // with `demoData` defaulting ON, a removed key would read as "on"
      // again, so turning the switch off would quietly undo itself on the
      // next load, which is the one thing a switch may never do.
      if (raw !== null) return raw === '1';
    } catch {
      /* fall through to memory, then to the default */
    }
    return memory.get(flag) ?? DEFAULTS[flag];
  },
  /** QA switch: the demo-backed fetches report 'unavailable' on purpose. */
  get unavailable(): boolean {
    return this.read('unavailable');
  },
  /**
   * Demo data: one switch, ON by default (see DEFAULTS), that makes every
   * figure in the app that has nothing real behind it a sample figure.
   *
   * Price charts draw a generated series instead of the published sessions,
   * and the earnings surfaces render a full illustrative week and quarterly
   * history rather than only what the free data plan carries. Every whole
   * feature with nothing real behind it reads this too — the portfolio,
   * analyst ratings, connected accounts, notifications — and with the switch
   * off each says so in place (components/DemoOnly.tsx) rather than rendering
   * invented money. Market movers used to be on that list and no longer is:
   * the board ranks the real market through /api/movers, so there was nothing
   * left for the gate to hide.
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
    // Recorded before the write, so the flag still answers correctly for this
    // session when the write below throws.
    memory.set(flag, on);
    try {
      // Both directions are written. See `read`: an absent key means "no
      // choice yet" and falls back to the default, so recording "off" by
      // deleting the key would lose the reader's choice for any flag whose
      // default is on.
      localStorage.setItem(this.key[flag], on ? '1' : '0');
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
