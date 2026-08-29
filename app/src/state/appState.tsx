import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { Answer } from '../lib/advisory';

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
export type TransactionSide = 'buy' | 'sell' | 'div';

export interface SavedAlert {
  id: string;
  ticker: string;
  kind: AlertKind;
  condition: 'rise' | 'fall';
  value: string;
  remind: 'day' | 'morning' | 'lands';
  sources: { wires: boolean; filings: boolean };
  notifyBy: { push: boolean; email: boolean };
}

export interface ManualPortfolio {
  id: string;
  name: string;
  startingCash: number;
}

export interface ManualTransaction {
  id: string;
  side: TransactionSide;
  ticker: string;
  shares: number;
  price: number;
  date: string;
}

export interface AppState {
  screen: Screen;
  ticker: string;
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
  notificationsRead: boolean;
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
  notificationsRead: false,
  pfIndex: 0,
  aggExcluded: {},
  savedAlerts: [],
  manualPortfolios: [],
  manualTransactions: {},
};

export type Action =
  | { type: 'go'; screen: Screen; fromSteps?: boolean }
  | { type: 'openStock'; ticker: string }
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
  | { type: 'markNotificationsRead' }
  | { type: 'pfIndex'; index: number }
  | { type: 'toggleAggAccount'; id: string }
  | { type: 'addAlert'; alert: SavedAlert }
  | { type: 'removeAlert'; id: string }
  | { type: 'addManualPortfolio'; portfolio: ManualPortfolio }
  | { type: 'addManualTransaction'; portfolioId: string; transaction: ManualTransaction }
  /** Hydrate the persisted slice from the signed-in user's Supabase row. */
  | { type: 'replaceState'; persisted: Partial<AppState> }
  /** Sign-out: drop the persisted slice so the next account on this device
   *  never sees the previous user's risk profile or progress. */
  | { type: 'resetPersisted' };

/** Exported for tests — the app itself only ever reaches this via dispatch. */
export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'go':
      return { ...s, screen: a.screen, fromSteps: a.fromSteps ?? false };
    case 'openStock':
      return { ...s, screen: 'stock', ticker: a.ticker };
    case 'advAnswer':
      return { ...s, advAnswers: [...s.advAnswers, a.value] };
    case 'advReset':
      return { ...s, advAnswers: [], advStage: 0, screen: 'advChat', advSolo: false };
    case 'advStage':
      return { ...s, advStage: Math.max(s.advStage, a.stage) };
    case 'advGoto':
      return {
        ...s,
        screen: a.screen,
        advSolo: a.solo ?? false,
        advStage: a.stage != null ? Math.max(s.advStage, a.stage) : s.advStage,
      };
    case 'advBroker':
      return { ...s, advBroker: a.broker };
    case 'advConnect': {
      const next = { ...s.advConnections };
      if (a.provider == null) delete next[a.inst];
      else next[a.inst] = a.provider;
      return { ...s, advConnections: next };
    }
    case 'toggleWatch': {
      // Symbols reach this from search, the earnings calendar and news chips
      // as well as the stock page, so they are normalised here rather than at
      // each call site — 'nvda' and 'NVDA' must never become two rows.
      const ticker = a.ticker.trim().toUpperCase();
      if (!ticker) return s;
      return {
        ...s,
        watchlist: s.watchlist.includes(ticker)
          ? s.watchlist.filter((t) => t !== ticker)
          : [...s.watchlist, ticker],
      };
    }
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
    case 'markNotificationsRead':
      return { ...s, notificationsRead: true };
    case 'pfIndex':
      return { ...s, pfIndex: a.index };
    case 'toggleAggAccount':
      return { ...s, aggExcluded: { ...s.aggExcluded, [a.id]: !s.aggExcluded[a.id] } };
    case 'addAlert':
      return { ...s, savedAlerts: [...s.savedAlerts, a.alert] };
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
    case 'replaceState':
      // Keep the ephemeral navigation (screen/ticker) — the user is mid-app
      // when the server state lands; yanking them elsewhere would read as a
      // crash. Everything else resets to initial + the server's slice.
      return { ...initial, ...a.persisted, screen: s.screen, ticker: s.ticker };
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
  'manualPortfolios',
  'manualTransactions',
];

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
  return picked;
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
