import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { mapProfile, type Answer } from '../lib/advisory';

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
  | 'tour'
  | 'learn'
  | 'steps'
  | 'open';

/** Advisory flow order; advStage marks the furthest step reached (0–5, 5 = done). */
export const ADV_ORDER: Screen[] = ['advChat', 'advDisc', 'advDash', 'advConnect', 'advBuy'];

export type InstitutionKey = 'broker' | 'bank' | 'pension' | 'hisht';

/** A user-logged transaction on a manual (theoretical) portfolio. Nothing is
 *  ever executed — this is the user's own record keeping. */
export interface ManualTx {
  pfId: string;
  side: 'buy' | 'sell' | 'div';
  ticker: string;
  shares: number;
  price: number;
  date: string;
}

/** A user-created theoretical portfolio (no broker behind it). */
export interface ManualPortfolio {
  id: string;
  name: string;
  startCash: number;
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
  /** self-directed manual records (persisted; never executed anywhere) */
  manualTxs: ManualTx[];
  manualPortfolios: ManualPortfolio[];
}

const initial: AppState = {
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
  manualTxs: [],
  manualPortfolios: [],
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
  | { type: 'addManualTx'; tx: ManualTx }
  | { type: 'createPortfolio'; name: string; startCash: number };

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
      return a.which === 'up'
        ? { ...s, alertUpThreshold: a.value }
        : { ...s, alertDownThreshold: a.value };
    case 'markNotificationsRead':
      return { ...s, notificationsRead: true };
    case 'pfIndex':
      return { ...s, pfIndex: a.index };
    case 'toggleAggAccount':
      return { ...s, aggExcluded: { ...s.aggExcluded, [a.id]: !s.aggExcluded[a.id] } };
    case 'addManualTx':
      return { ...s, manualTxs: [...s.manualTxs, a.tx] };
    case 'createPortfolio': {
      const id = `manual-${Date.now().toString(36)}`;
      return { ...s, manualPortfolios: [...s.manualPortfolios, { id, name: a.name, startCash: a.startCash }] };
    }
    default:
      return s;
  }
}

const STORAGE_KEY = 'shift.state';
const PERSISTED: Array<keyof AppState> = [
  'advAnswers',
  'advStage',
  'advBroker',
  'advConnections',
  'watchlist',
  'firstRunSeen',
  'stepsDone',
  'alertUpThreshold',
  'alertDownThreshold',
  'manualTxs',
  'manualPortfolios',
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

/** Derived advisory-setup facts used by banner/settings.
 *
 * Resume never lands past the chat unless a deterministic profile actually
 * exists for the persisted answers — a stale or partial advStage must not
 * surface a defaulted recommendation. */
export function setupProgress(s: AppState) {
  const started = s.advAnswers.length > 0 || s.advStage > 0;
  const incomplete = s.advStage < 5;
  const maxIdx = mapProfile(s.advAnswers) == null ? 0 : 4;
  const idx = Math.min(s.advStage, maxIdx);
  return {
    showBanner: started && incomplete,
    incomplete,
    pct: Math.round((s.advStage / 5) * 100),
    stepLabel: idx + 1,
    resumeScreen: ADV_ORDER[idx],
  };
}
