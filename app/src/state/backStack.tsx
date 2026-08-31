import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

/**
 * The Android back button, for an app that has no routes.
 *
 * Installed to the home screen the app runs standalone, where Android maps the
 * back gesture onto the WebView's session history. Nothing here navigates by
 * URL — screens are swapped by the reducer and sheets by a boolean — so that
 * history never held more than the one entry the app booted with, and the very
 * first back press had nothing to pop and closed the app. Users lost their
 * place closing a sheet.
 *
 * So this keeps a stack of *undoable things* — an open sheet, a screen you
 * navigated away from — and mirrors its depth into the session history one
 * `pushState` per entry, all on the same URL. A back press pops history, we
 * hear `popstate`, and we undo entries newest-first until our depth matches
 * the history's again. With the stack empty, back does what it always did and
 * leaves the app, which is what Android users expect from the home screen.
 *
 * Registration is declarative — an owner says how many entries it holds, not
 * "push" and "pop" — because the two directions otherwise race. Closing a
 * sheet *by navigating* (search overlay → a stock page) releases one entry and
 * takes another in the same commit, and an imperative API has to get those in
 * the right order to avoid a spurious history move. A count that is reconciled
 * once per tick cannot: the net delta is all that reaches the history.
 */

/** One thing the back button can undo. Ordered by when it became undoable. */
interface Entry {
  owner: symbol;
  onBack: () => void;
}

/** How deep in our own stack a history entry sits; absent on entries we did
 *  not push (the one the app booted with, or anything Supabase left behind). */
function readDepth(state: unknown): number {
  const depth = (state as { shiftDepth?: unknown } | null)?.shiftDepth;
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

interface BackStack {
  /** Hold exactly `count` entries for `owner`; each is undone by `onBack`. */
  sync: (owner: symbol, count: number, onBack: () => void) => void;
}

/**
 * Outside a provider nothing registers and the back button keeps its default
 * behaviour. Inert rather than a thrown error on purpose: `Sheet` registers a
 * guard, and the design-system page (src/ds) renders sheets with none of the
 * app's providers around them.
 */
const INERT: BackStack = { sync: () => {} };

const Ctx = createContext<BackStack>(INERT);

export function BackStackProvider({ children }: { children: ReactNode }) {
  const entries = useRef<Entry[]>([]);
  /** A `history.go` is in flight. `history.state` still reads as the old entry
   *  until it lands, so reconciling against it now would double the move. */
  const settling = useRef(false);
  /** One reconcile per tick, however many owners synced within it. */
  const queued = useRef(false);

  const reconcile = useCallback(() => {
    if (settling.current) return;
    const want = entries.current.length;
    let have = 0;
    try {
      have = readDepth(history.state);
    } catch {
      return;
    }
    if (want === have) return;
    try {
      if (want > have) {
        // Same URL, one entry per undoable thing: the depth is the payload.
        for (let depth = have + 1; depth <= want; depth++) history.pushState({ shiftDepth: depth }, '');
      } else {
        settling.current = true;
        history.go(want - have);
      }
    } catch {
      // A history the browser refuses to write (rare, and never fatal): the
      // app still works, the back button just goes back to being an exit.
      settling.current = false;
    }
  }, []);

  const schedule = useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(() => {
      queued.current = false;
      reconcile();
    });
  }, [reconcile]);

  const sync = useCallback(
    (owner: symbol, count: number, onBack: () => void) => {
      const list = entries.current;
      let held = 0;
      for (const entry of list) {
        if (entry.owner !== owner) continue;
        // Rebind: the caller's closure is rebuilt on every render, and an
        // entry taken three renders ago must still undo the current state.
        entry.onBack = onBack;
        held++;
      }
      for (; held < count; held++) list.push({ owner, onBack });
      // Newest first, so an owner giving up one of several entries keeps the
      // oldest — the same order the back button would have reached them in.
      for (let i = list.length - 1; i >= 0 && held > count; i--) {
        if (list[i].owner !== owner) continue;
        list.splice(i, 1);
        held--;
      }
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      settling.current = false;
      const depth = readDepth(event.state);
      const list = entries.current;
      // Deeper than the history now goes: the user pressed back (possibly
      // several times). Undo down to it. When it was our own `history.go`
      // landing, the depths already agree and this loop does nothing.
      while (list.length > depth) {
        const entry = list.pop();
        entry?.onBack();
      }
      // Undoing can itself take entries — closing a sheet that reveals a
      // screen with a trail behind it — and a forward press can leave the
      // history deeper than the stack. Either way the next tick settles it.
      schedule();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [schedule]);

  const value = useMemo<BackStack>(() => ({ sync }), [sync]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Claim `count` back presses, each undone by `onBack`, newest first.
 *
 * `onBack` is read at the moment the press arrives, so it never has to be
 * memoised — only `count` drives the registration.
 */
export function useBackEntries(count: number, onBack: () => void) {
  const { sync } = useContext(Ctx);
  const owner = useRef<symbol | null>(null);
  owner.current ??= Symbol('backEntries');
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    const id = owner.current!;
    sync(id, count, () => latest.current());
    // Giving the entries back on unmount is what stops a sheet that was
    // unmounted while open from leaving a back press that undoes nothing.
    // A StrictMode remount releases and re-takes them within the tick, and
    // the reconcile above sees the net zero rather than a trip through the
    // history.
    return () => sync(id, 0, () => {});
  }, [count, sync]);
}

/**
 * The single-entry case: while `active`, the next back press calls `onBack`
 * instead of leaving the app. For sheets, overlays and anything else with one
 * thing to dismiss.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  useBackEntries(active ? 1 : 0, onBack);
}
