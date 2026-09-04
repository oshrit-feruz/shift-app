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
 * `demoData` starts OFF. It used to start ON, and the argument for that was
 * real: with it off a first-time reader landed on a home screen of "only
 * available in demo" placeholders and an empty watchlist, so there was
 * nothing to look at. The argument stopped holding once the app grew a front
 * door. A reader with no holdings now has something specific to do — answer
 * four questions and get an allocation — and showing them six invented
 * positions instead answers a question they never asked, in a way that
 * quietly implies the app already knows what they hold.
 *
 * It is also what makes "does this user hold anything" a question the app can
 * answer at all. While the default was ON, every new reader looked like
 * someone with a populated portfolio, because that is what the switch
 * fabricated for them.
 *
 * Demo mode has not gone away and is not hidden: the switch is in the More
 * tab, one tap, and while it is on every screen carries a badge saying so
 * (components/DemoBadge.tsx). Turning it on is now something someone does on
 * purpose — for a walkthrough, a screenshot, a partner demo — which is what
 * it was always for.
 *
 * Existing installs are NOT flipped out from under their reader: see
 * `migrateLegacyDemoDefault` below.
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
  demoData: false,
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

/**
 * The key the app's persisted state lives under (state/appState.tsx). Read
 * here only to answer one question: has this browser used Shift before?
 */
const APP_STATE_KEY = 'shift.state';

/**
 * Keeps demo mode ON for installs that were already using it, now that the
 * default has flipped to OFF.
 *
 * THE PROBLEM THIS SOLVES. `read` treats an ABSENT key as "no choice yet" and
 * falls back to the default. So flipping the default does not only affect new
 * readers — it silently changes the app for every existing one who never
 * touched the switch, which is most of them. They would open Shift to find
 * their portfolio, their movers and their earnings week replaced by empty
 * states, having changed nothing. A switch may never undo itself, and a
 * default may never reach backwards.
 *
 * HOW IT TELLS THEM APART. `set` writes '1' or '0' explicitly, in both
 * directions, so the key being PRESENT means the reader chose — and that
 * choice is honoured whichever way it points. The key being ABSENT means they
 * never chose, and then one thing separates an existing install from a fresh
 * one: whether this browser has any stored app state at all. It does for
 * anyone who has used the app; it does not for someone opening it today.
 *
 * Deliberately NOT keyed on the presence of a Supabase session or a user row.
 * The flag is per-device and per-browser, and the question here is about this
 * browser, not this account: the same person on a new phone is a new install
 * and should get the new default.
 *
 * Runs once per load, before anything reads the flag (src/main.tsx), and is
 * idempotent — after the first run the key exists, so every later call takes
 * the first branch and does nothing.
 */
export function migrateLegacyDemoDefault(): void {
  try {
    // Already chosen, in either direction. Nothing to do, ever again.
    if (localStorage.getItem(DEMO_FLAGS.key.demoData) !== null) return;
    // Never chosen. A browser with stored state was using the app while the
    // default was ON, so ON is the state it is actually in — write it down
    // rather than let the new default change it.
    if (localStorage.getItem(APP_STATE_KEY) !== null) {
      localStorage.setItem(DEMO_FLAGS.key.demoData, '1');
    }
    // No stored state: a fresh install, which gets the new default by having
    // no key at all. Writing '0' here would work too, but leaving it absent
    // keeps "has never chosen" true for anything that later wants to ask.
  } catch {
    /* No storage: the flag falls back to the default for this session, which
       is the same answer this migration would have produced for a browser
       that cannot have stored anything either. */
  }
}

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
