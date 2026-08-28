import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
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
  /** self-directed */
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
  watchlist: ['NVDA', 'AMD', 'LLY', 'JPM', 'AAPL', 'MSFT', 'TSLA', 'XOM'],
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
  | { type: 'firstRunSeen' }
  | { type: 'stepDone'; key: string; done: boolean }
  | { type: 'setThreshold'; which: 'up' | 'down'; value: string }
  | { type: 'markNotificationsRead' }
  | { type: 'pfIndex'; index: number }
  | { type: 'toggleAggAccount'; id: string }
  | { type: 'addAlert'; alert: SavedAlert }
  | { type: 'addManualPortfolio'; portfolio: ManualPortfolio }
  | { type: 'addManualTransaction'; portfolioId: string; transaction: ManualTransaction }
  /** Hydrate the persisted slice from the signed-in user's Supabase row. */
  | { type: 'replaceState'; persisted: Partial<AppState> }
  /** Sign-out: drop the persisted slice so the next account on this device
   *  never sees the previous user's risk profile or progress. */
  | { type: 'resetPersisted' };

function reducer(s: AppState, a: Action): AppState {
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
    case 'toggleWatch':
      return {
        ...s,
        watchlist: s.watchlist.includes(a.ticker)
          ? s.watchlist.filter((t) => t !== a.ticker)
          : [...s.watchlist, a.ticker],
      };
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

function hydrate(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const picked: Partial<AppState> = {};
    for (const k of PERSISTED) if (k in saved) (picked as Record<string, unknown>)[k] = saved[k];
    return { ...initial, ...picked };
  } catch {
    return initial;
  }
}

const StateCtx = createContext<AppState>(initial);
const DispatchCtx = createContext<(a: Action) => void>(() => {});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);
  useEffect(() => {
    try {
      const out: Record<string, unknown> = {};
      for (const k of PERSISTED) out[k] = state[k];
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
