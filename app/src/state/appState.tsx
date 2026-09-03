import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { Answer } from '../lib/advisory';
import type { ManualTransaction } from '../lib/transaction';

// Re-exported from lib/transaction, where they moved so that the server-side
// alert engine (api/alerts-run.ts) can share lib/positions.ts without pulling
// this React module into a Node typecheck. Every existing import keeps working.
export type { ManualTransaction, TransactionSide } from '../lib/transaction';

export type Screen =
  | 'home'
  | 'stock'
  | 'pf'
  | 'watch'
  | 'movers'
  | 'news'
  | 'earnings'
  | 'compare'
  | 'more'
  | 'settings'
  | 'connections'
  | 'snaptrade'
  | 'advChat'
  | 'advDisc'
  | 'advDash'
  | 'advConnect'
  | 'advBuy'
  | 'learn'
  | 'steps'
  | 'open';

/** Advisory flow order; advStage marks the furthest step reached (0–5, 5 = done). */
export const ADV_ORDER: Screen[] = ['advChat', 'advDisc', 'advDash', 'advConnect', 'advBuy'];

export type InstitutionKey = 'broker' | 'bank' | 'pension' | 'hisht';

export type AlertKind = 'price' | 'news' | 'earn';

export interface SavedAlert {
  id: string;
  ticker: string;
  kind: AlertKind;
  /**
   * A price alert watches a LEVEL. It fires when the price crosses it,
   * whichever way it was going: "tell me when NVDA is at 200" is one
   * question, and which direction it arrived from is part of the answer the
   * notification gives, not part of what you asked. Rules saved before this
   * carry 'rise' or 'fall' and are read as the same rule.
   */
  condition: 'cross';
  value: string;
  remind: 'day' | 'morning' | 'lands';
  sources: { wires: boolean; filings: boolean };
  notifyBy: { push: boolean; email: boolean };
}

/**
 * What makes two alerts the same alert.
 *
 * Everything the alert *watches for* is in the key; the delivery channels are
 * not. Asking twice for "tell me when MSFT is at $200" is one alert the
 * second time as much as the first — the user wants that notification, not two
 * of it — while asking for it by email as well is a change to how the same
 * alert reaches them, so it edits the one that exists rather than filing a
 * second identical row that would fire twice.
 */
export function alertKey(a: Omit<SavedAlert, 'id'>): string {
  return `${a.ticker}|${a.kind}|${alertDetailKey(a)}`;
}

/** The part of the key that differs per kind: the threshold, the keywords and
 *  where they are watched for, or when the earnings reminder lands. */
function alertDetailKey(a: Omit<SavedAlert, 'id'>): string {
  switch (a.kind) {
    case 'price':
      // The level alone: a price rule has no direction to tell two apart.
      return a.value.trim();
    case 'news':
      return `${a.value.trim().toLowerCase()}|${a.sources.wires}|${a.sources.filings}`;
    default:
      return a.remind;
  }
}

/**
 * Adds an alert unless the list already watches for exactly that, in which
 * case the existing one keeps its id and place and takes the new alert's
 * notification channels.
 */
export function addAlert(alerts: SavedAlert[], alert: SavedAlert): SavedAlert[] {
  const key = alertKey(alert);
  const at = alerts.findIndex((x) => alertKey(x) === key);
  if (at < 0) return [...alerts, alert];
  return alerts.map((x, i) => (i === at ? { ...x, notifyBy: alert.notifyBy } : x));
}

export interface ManualPortfolio {
  id: string;
  name: string;
}

/** A view the user can be returned to: the screen and, for a stock page, which
 *  stock — `openStock` can navigate stock -> stock, so the screen alone does
 *  not say where you were. */
export interface NavEntry {
  screen: Screen;
  ticker: string;
  /**
   * Chrome that belongs to the view rather than to the screen component: the
   * "back to the steps" pill, and whether the advisory connect screen was
   * opened on its own rather than as a step of the flow. Both are set by the
   * navigation that opened the view, so returning to it without them lands on
   * a differently-dressed version of the screen the user left — a step opened
   * from the checklist loses its way back to the checklist.
   */
  fromSteps: boolean;
  advSolo: boolean;
}

export interface AppState {
  screen: Screen;
  ticker: string;
  /** The views behind the current one, oldest first — what the Android back
   *  button walks back through (state/backStack.tsx). Ephemeral like `screen`:
   *  never persisted, and a fresh boot always starts at home with no trail. */
  navStack: NavEntry[];
  /** advisory */
  advAnswers: Answer[];
  advStage: number;
  advBroker: 'blink' | 'ibkr' | 'colmex' | null;
  advConnections: Partial<Record<InstitutionKey, string>>;
  /** advConnect opened standalone (no flow chrome) vs. as a flow step */
  advSolo: boolean;
  /** self-directed — the user's own watchlist, empty until they add to it */
  watchlist: string[];
  /** onboarding */
  firstRunSeen: boolean;
  stepsDone: Record<string, boolean>;
  fromSteps: boolean;
  /** price-alert thresholds — opt-in, blank by default, informational only */
  alertUpThreshold: string;
  alertDownThreshold: string;
  /** portfolio tab index */
  pfIndex: number;
  aggExcluded: Record<string, boolean>;
  savedAlerts: SavedAlert[];
  manualPortfolios: ManualPortfolio[];
  manualTransactions: Record<string, ManualTransaction[]>;
}

export const initial: AppState = {
  screen: 'home',
  ticker: 'NVDA',
  navStack: [],
  advAnswers: [],
  advStage: 0,
  advBroker: null,
  advConnections: {},
  advSolo: false,
  watchlist: [],
  firstRunSeen: false,
  stepsDone: {},
  fromSteps: false,
  alertUpThreshold: '',
  alertDownThreshold: '',
  pfIndex: 0,
  aggExcluded: {},
  savedAlerts: [],
  manualPortfolios: [],
  manualTransactions: {},
};

export type Action =
  | { type: 'go'; screen: Screen; fromSteps?: boolean }
  | { type: 'openStock'; ticker: string }
  /** Return to the previous view. Raised by the Android back button, and a
   *  no-op with nothing behind us — the shell only claims a back press while
   *  the trail has something on it, so that press leaves the app instead. */
  | { type: 'back' }
  | { type: 'advAnswer'; value: Answer }
  | { type: 'advReset' }
  | { type: 'advStage'; stage: number }
  | { type: 'advGoto'; screen: Screen; stage?: number; solo?: boolean }
  | { type: 'advBroker'; broker: AppState['advBroker'] }
  | { type: 'advConnect'; inst: InstitutionKey; provider: string | null }
  | { type: 'toggleWatch'; ticker: string }
  | { type: 'removeWatch'; ticker: string }
  | { type: 'firstRunSeen' }
  | { type: 'stepDone'; key: string; done: boolean }
  | { type: 'setThreshold'; which: 'up' | 'down'; value: string }
  | { type: 'pfIndex'; index: number }
  | { type: 'toggleAggAccount'; id: string }
  | { type: 'addAlert'; alert: SavedAlert }
  | { type: 'removeAlert'; id: string }
  | { type: 'addManualPortfolio'; portfolio: ManualPortfolio }
  | { type: 'addManualTransaction'; portfolioId: string; transaction: ManualTransaction }
  | { type: 'removeManualPortfolio'; id: string }
  | { type: 'removeManualTransaction'; portfolioId: string; id: string }
  /**
   * The reconciled ledger — server rows minus queued deletes plus queued
   * inserts (state/ledger.ts). Replaces both keys wholesale rather than
   * merging: reconcile() has already done the merging, and a second one here
   * could only reintroduce a row it deliberately dropped.
   */
  | {
      type: 'ledgerLoaded';
      portfolios: ManualPortfolio[];
      transactions: Record<string, ManualTransaction[]>;
    }
  /** Hydrate the persisted slice from the signed-in user's Supabase row. */
  | { type: 'replaceState'; persisted: Partial<AppState> }
  /** Sign-out: drop the persisted slice so the next account on this device
   *  never sees the previous user's risk profile or progress. */
  | { type: 'resetPersisted' };

/** How many views back the trail keeps. Deep enough that nobody reaches the
 *  end of it in a session; bounded because every entry is also a session-history
 *  entry, and an unbounded trail would turn a few minutes of tapping between
 *  tabs into a hundred back presses before the app would close. */
const MAX_TRAIL = 25;

/**
 * Whether a view *is* a given destination.
 *
 * The ticker is part of a view's identity only on the stock page, the one
 * screen it selects. Everywhere else it is merely whichever stock was looked
 * at last, and it drifts: opening AMD and going home would otherwise not
 * recognise the home the user started on (filed under NVDA), and would stack a
 * second, indistinguishable home behind the first. Back would then land on
 * home twice with a stock page in between.
 */
function isView(view: NavEntry, screen: Screen, ticker: string): boolean {
  return view.screen === screen && (screen !== 'stock' || view.ticker === ticker);
}

/**
 * The trail behind the view the app is moving to.
 *
 * A view already on the trail is *returned to* rather than stacked on: the
 * trail truncates back to it. Otherwise home -> portfolio -> home would leave
 * two entries behind a screen the user is looking at for the second time, and
 * flipping between two tabs would grow the trail without bound. Truncating
 * matches what a tab bar is understood to do — back walks toward where you
 * started, not through every tap that got you here.
 *
 * Exported for tests; the app reaches it only through the reducer.
 */
export function trailTo(s: AppState, screen: Screen, ticker: string): NavEntry[] {
  // Navigating to where we already are (tapping the current tab) is not a
  // navigation and must not leave a back press that appears to do nothing.
  if (isView(s, screen, ticker)) return s.navStack;
  const at = s.navStack.findIndex((x) => isView(x, screen, ticker));
  if (at >= 0) return s.navStack.slice(0, at);
  // The whole view, not just where it was: see NavEntry.
  const trail = [
    ...s.navStack,
    { screen: s.screen, ticker: s.ticker, fromSteps: s.fromSteps, advSolo: s.advSolo },
  ];
  return trail.length > MAX_TRAIL ? trail.slice(trail.length - MAX_TRAIL) : trail;
}

/**
 * Add a symbol to the watchlist, or remove it if it is there.
 *
 * Symbols reach this from search, the earnings calendar and news chips as
 * well as the stock page, so they are normalised here rather than at each
 * call site — 'nvda' and 'NVDA' must never become two rows.
 */
function toggleWatch(s: AppState, raw: string): AppState {
  const ticker = raw.trim().toUpperCase();
  if (!ticker) return s;
  const watchlist = s.watchlist.includes(ticker)
    ? s.watchlist.filter((t) => t !== ticker)
    : [...s.watchlist, ticker];
  return { ...s, watchlist };
}

/** Exported for tests — the app itself only ever reaches this via dispatch. */
export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'go':
      return {
        ...s,
        screen: a.screen,
        fromSteps: a.fromSteps ?? false,
        navStack: trailTo(s, a.screen, s.ticker),
      };
    case 'openStock':
      return {
        ...s,
        screen: 'stock',
        ticker: a.ticker,
        navStack: trailTo(s, 'stock', a.ticker),
      };
    case 'back': {
      const previous = s.navStack.at(-1);
      if (previous == null) return s;
      // Spread whole: an entry is every field that makes the view what it was,
      // so nothing can be added to NavEntry and then quietly not restored.
      return { ...s, ...previous, navStack: s.navStack.slice(0, -1) };
    }
    case 'advAnswer':
      return { ...s, advAnswers: [...s.advAnswers, a.value] };
    case 'advReset':
      return {
        ...s,
        advAnswers: [],
        advStage: 0,
        screen: 'advChat',
        advSolo: false,
        navStack: trailTo(s, 'advChat', s.ticker),
      };
    case 'advStage':
      return { ...s, advStage: Math.max(s.advStage, a.stage) };
    case 'advGoto':
      return {
        ...s,
        screen: a.screen,
        advSolo: a.solo ?? false,
        advStage: a.stage != null ? Math.max(s.advStage, a.stage) : s.advStage,
        navStack: trailTo(s, a.screen, s.ticker),
      };
    case 'advBroker':
      return { ...s, advBroker: a.broker };
    case 'advConnect': {
      const next = { ...s.advConnections };
      if (a.provider == null) delete next[a.inst];
      else next[a.inst] = a.provider;
      return { ...s, advConnections: next };
    }
    case 'toggleWatch':
      return toggleWatch(s, a.ticker);
    case 'removeWatch': {
      const ticker = a.ticker.trim().toUpperCase();
      if (!s.watchlist.includes(ticker)) return s;
      return { ...s, watchlist: s.watchlist.filter((t) => t !== ticker) };
    }
    case 'firstRunSeen':
      return { ...s, firstRunSeen: true };
    case 'stepDone':
      return { ...s, stepsDone: { ...s.stepsDone, [a.key]: a.done } };
    case 'setThreshold':
      return a.which === 'up' ? { ...s, alertUpThreshold: a.value } : { ...s, alertDownThreshold: a.value };
    case 'pfIndex':
      return { ...s, pfIndex: a.index };
    case 'toggleAggAccount':
      return { ...s, aggExcluded: { ...s.aggExcluded, [a.id]: !s.aggExcluded[a.id] } };
    case 'addAlert':
      return { ...s, savedAlerts: addAlert(s.savedAlerts, a.alert) };
    case 'removeAlert':
      return { ...s, savedAlerts: s.savedAlerts.filter((x) => x.id !== a.id) };
    case 'addManualPortfolio':
      return { ...s, manualPortfolios: [...s.manualPortfolios, a.portfolio] };
    case 'addManualTransaction':
      return {
        ...s,
        manualTransactions: {
          ...s.manualTransactions,
          [a.portfolioId]: [...(s.manualTransactions[a.portfolioId] ?? []), a.transaction],
        },
      };
    case 'removeManualPortfolio': {
      // Cascades its transactions, matching the database's `on delete
      // cascade` — leaving them behind would keep the rows in memory,
      // orphaned, until the next read.
      const { [a.id]: _dropped, ...rest } = s.manualTransactions;
      const manualPortfolios = s.manualPortfolios.filter((x) => x.id !== a.id);
      return {
        ...s,
        manualPortfolios,
        manualTransactions: rest,
        // Back to the first account. Portfolio.tsx selects by index into a
        // list this reducer cannot see the length of — it also holds the
        // demo/linked accounts — so there is no index to clamp to correctly.
        // Zero is the one selection that is always valid and always
        // explainable: delete a portfolio, land on the first one.
        pfIndex: 0,
      };
    }
    case 'removeManualTransaction':
      return {
        ...s,
        manualTransactions: {
          ...s.manualTransactions,
          [a.portfolioId]: (s.manualTransactions[a.portfolioId] ?? []).filter((x) => x.id !== a.id),
        },
      };
    case 'ledgerLoaded':
      return {
        ...s,
        manualPortfolios: a.portfolios,
        manualTransactions: a.transactions,
      };
    case 'replaceState':
      // Keep the ephemeral navigation (screen/ticker) — the user is mid-app
      // when the server state lands; yanking them elsewhere would read as a
      // crash, and dropping the trail would turn their next back press into
      // an app exit. Everything else resets to initial + the server's slice.
      return { ...initial, ...a.persisted, screen: s.screen, ticker: s.ticker, navStack: s.navStack };
    case 'resetPersisted':
      // Back to a clean boot; the localStorage effect below then overwrites
      // the on-device cache with the blank slice.
      return { ...initial };
    default:
      return s;
  }
}

const STORAGE_KEY = 'shift.state';
/** The slice that outlives a session: localStorage cache + the signed-in
 *  user's Supabase row (state/remoteState.ts) both persist exactly this. */
export const PERSISTED: Array<keyof AppState> = [
  'advAnswers',
  'advStage',
  'advBroker',
  'advConnections',
  'watchlist',
  'firstRunSeen',
  'stepsDone',
  'alertUpThreshold',
  'alertDownThreshold',
  'savedAlerts',
  // NOT 'manualPortfolios' / 'manualTransactions'. The ledger lives in its own
  // Supabase tables now (supabase/migrations/0005_ledger.sql, synced by
  // state/useLedgerSync.ts). Writing it to both stores would reintroduce
  // through the back door the very bug the tables exist to fix: this bag ships
  // wholesale on a debounce, so a second device's copy overwrites the first's
  // and one transaction vanishes with no error anywhere.
  //
  // They stay READABLE from a stored bag — see readLegacyLedger below — so a
  // device that has been offline since before the move still hands its
  // transactions over on the next sign-in.
];

/**
 * The two ledger keys as they were written into the bag before the move, for
 * the one-time import (state/ledger.ts, planLegacyImport).
 *
 * Kept for two releases. Reading a key we no longer write is cheap; a
 * long-offline device whose only copy of its transactions is this bag has no
 * other way to hand them over, and dropping the reader is how that copy
 * becomes the one nobody thought about.
 */
export function readLegacyLedger(saved: Record<string, unknown>): {
  manualPortfolios: ManualPortfolio[];
  manualTransactions: Record<string, ManualTransaction[]>;
} {
  const pfs = saved.manualPortfolios;
  const txs = saved.manualTransactions;
  return {
    manualPortfolios: Array.isArray(pfs) ? (pfs as ManualPortfolio[]) : [],
    manualTransactions:
      txs !== null && typeof txs === 'object' && !Array.isArray(txs)
        ? (txs as Record<string, ManualTransaction[]>)
        : {},
  };
}

/**
 * The watchlist every install used to boot with, before the list became the
 * user's own. It was never chosen by anyone, so a stored slice that still
 * carries exactly it is a seed, not a decision, and is dropped on read —
 * otherwise "starts empty" would only be true for people installing today,
 * and everyone else would keep eight stocks they never picked.
 *
 * Only an exact match is dropped. A list the user has since edited — one name
 * added or removed — is theirs, and is left alone.
 */
export const LEGACY_SEED_WATCHLIST = ['NVDA', 'AMD', 'LLY', 'JPM', 'AAPL', 'MSFT', 'TSLA', 'XOM'];

/** True when `value` is exactly the retired demo seed, in any order. */
export function isSeededWatchlist(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== LEGACY_SEED_WATCHLIST.length) return false;
  const seen = new Set(value.map((x) => (typeof x === 'string' ? x.toUpperCase() : x)));
  return seen.size === LEGACY_SEED_WATCHLIST.length && LEGACY_SEED_WATCHLIST.every((t) => seen.has(t));
}

/**
 * Whitelist a stored bag (localStorage cache or the Supabase row) down to the
 * persisted keys, normalising what has to be normalised. Shared by both read
 * paths so a slice cannot arrive clean from one and seeded from the other.
 */
export function readPersisted(saved: Record<string, unknown>): Partial<AppState> {
  const picked: Partial<AppState> = {};
  for (const k of PERSISTED) if (k in saved) (picked as Record<string, unknown>)[k] = saved[k];
  if (isSeededWatchlist(picked.watchlist)) picked.watchlist = [];
  else if (Array.isArray(picked.watchlist)) {
    // Stored before tickers were normalised on the way in, or hand-edited.
    const out: string[] = [];
    for (const raw of picked.watchlist) {
      if (typeof raw !== 'string') continue;
      const ticker = raw.trim().toUpperCase();
      if (ticker && !out.includes(ticker)) out.push(ticker);
    }
    picked.watchlist = out;
  }
  if (Array.isArray(picked.savedAlerts)) {
    // Duplicates could be stored before addAlert collapsed them, and a device
    // that filed the same alert four times would otherwise keep all four (and
    // fire four notifications) forever. Reading them through the same collapse
    // heals that list once, on the next boot.
    picked.savedAlerts = picked.savedAlerts
      .filter(isSavedAlert)
      // A price rule stored before the direction was dropped carries 'rise'
      // or 'fall'. It is the same rule — a level — so it is read as one here
      // rather than left sitting in a field whose type says 'cross', where
      // every later reader would have to remember that it might not be.
      .map((alert) => (alert.condition === 'cross' ? alert : { ...alert, condition: 'cross' as const }))
      // Wrapped rather than passed straight to reduce: the callback is handed
      // an index and the source array too, and addAlert must not be reading a
      // third and fourth argument it never declared.
      .reduce<SavedAlert[]>((kept, alert) => addAlert(kept, alert), []);
  }
  return picked;
}

/** A stored row shaped like an alert; anything else is dropped on read. */
function isSavedAlert(value: unknown): value is SavedAlert {
  if (value === null || typeof value !== 'object') return false;
  const a = value as Partial<SavedAlert>;
  return (
    typeof a.id === 'string' &&
    typeof a.ticker === 'string' &&
    typeof a.value === 'string' &&
    (a.kind === 'price' || a.kind === 'news' || a.kind === 'earn') &&
    typeof a.sources === 'object' &&
    a.sources !== null &&
    typeof a.notifyBy === 'object' &&
    a.notifyBy !== null
  );
}

function hydrate(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...initial, ...readPersisted(saved) };
  } catch {
    return initial;
  }
}

const StateCtx = createContext<AppState>(initial);
const DispatchCtx = createContext<(a: Action) => void>(() => {});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);
  // Written only when a persisted key actually changed: most dispatches are
  // navigation, which is not persisted, and a synchronous stringify+write of
  // the whole slice on every tab tap is main-thread work for nothing. The
  // reducer spreads a new state object but keeps untouched values by
  // reference, so a per-key identity check is a faithful "did it change".
  const lastPersisted = useRef<Partial<AppState> | null>(null);
  useEffect(() => {
    const prev = lastPersisted.current;
    if (prev !== null && PERSISTED.every((k) => state[k] === prev[k])) return;
    try {
      const out: Partial<AppState> = {};
      for (const k of PERSISTED) (out as Record<string, unknown>)[k] = state[k];
      lastPersisted.current = out;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
      /* persistence is best-effort */
    }
  }, [state]);
  const d = useMemo(() => dispatch, []);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={d}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export const useAppState = () => useContext(StateCtx);
export const useDispatch = () => useContext(DispatchCtx);

/** Derived advisory-setup facts used by banner/settings. */
export function setupProgress(s: AppState) {
  const started = s.advAnswers.length > 0 || s.advStage > 0;
  const incomplete = s.advStage < 5;
  return {
    showBanner: started && incomplete,
    incomplete,
    pct: Math.round((s.advStage / 5) * 100),
    stepLabel: Math.min(s.advStage, 4) + 1,
    // A flow still in progress resumes where it stopped. A finished one
    // (advStage 5) goes back to the recommendation, not to the last step:
    // clamping to ADV_ORDER[4] sent every completed user to the first-purchase
    // simulation forever, which reads as being dropped mid-tutorial with no
    // recommendation in sight.
    resumeScreen: s.advStage >= 5 ? 'advDash' : ADV_ORDER[Math.min(s.advStage, 4)],
  };
}
