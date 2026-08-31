import { describe, expect, it } from 'vitest';
import {
  reducer,
  readLegacyLedger,
  initial,
  PERSISTED,
  type Action,
  type AppState,
  type ManualTransaction,
} from './appState';
import { todayLocal } from '../sheets/TxSheet';

const base = reducer({ pfIndex: 3 } as AppState, { type: 'pfIndex', index: 3 });

const tx = (id: string, ticker = 'NVDA'): ManualTransaction => ({
  id,
  side: 'buy',
  ticker,
  shares: 10,
  price: 100,
  date: '2026-08-20',
});

const withLedger = (): AppState =>
  ({
    ...base,
    manualPortfolios: [
      { id: 'pf-sandbox-u1', name: 'Sandbox' },
      { id: 'manual-2', name: 'Ideas' },
    ],
    manualTransactions: { 'pf-sandbox-u1': [tx('t1')], 'manual-2': [tx('t2'), tx('t3', 'AMD')] },
  }) as AppState;

describe('removeManualTransaction', () => {
  it('removes only the row asked for', () => {
    const next = reducer(withLedger(), {
      type: 'removeManualTransaction',
      portfolioId: 'manual-2',
      id: 't2',
    });
    expect(next.manualTransactions['manual-2'].map((x) => x.id)).toEqual(['t3']);
    // And leaves the other portfolio alone.
    expect(next.manualTransactions['pf-sandbox-u1']).toHaveLength(1);
  });

  it('is a no-op for a row that is not there', () => {
    const before = withLedger();
    const next = reducer(before, { type: 'removeManualTransaction', portfolioId: 'manual-2', id: 'nope' });
    expect(next.manualTransactions['manual-2']).toHaveLength(2);
  });
});

describe('removeManualPortfolio', () => {
  it('takes the portfolio’s transactions with it', () => {
    // Matching the database's `on delete cascade` — rows left behind would sit
    // in memory orphaned until the next read.
    const next = reducer(withLedger(), { type: 'removeManualPortfolio', id: 'manual-2' });
    expect(next.manualPortfolios.map((x) => x.id)).toEqual(['pf-sandbox-u1']);
    expect(next.manualTransactions['manual-2']).toBeUndefined();
    expect(next.manualTransactions['pf-sandbox-u1']).toHaveLength(1);
  });

  it('lands the selection back on the first account', () => {
    // Portfolio.tsx selects by index into a list that also holds the linked
    // accounts, so there is no index to clamp to correctly — 0 is the one
    // selection that is always valid and always explainable.
    const next = reducer(withLedger(), { type: 'removeManualPortfolio', id: 'manual-2' });
    expect(next.pfIndex).toBe(0);
  });
});

describe('ledgerLoaded', () => {
  it('replaces both keys wholesale', () => {
    // reconcile() has already merged server rows with the outbox; a second
    // merge here could only reintroduce a row it deliberately dropped.
    const next = reducer(withLedger(), {
      type: 'ledgerLoaded',
      portfolios: [{ id: 'only', name: 'Only' }],
      transactions: { only: [tx('t9')] },
    });
    expect(next.manualPortfolios).toEqual([{ id: 'only', name: 'Only' }]);
    expect(next.manualTransactions).toEqual({ only: [tx('t9')] });
  });

  it('accepts an empty ledger without keeping the previous account’s rows', () => {
    const next = reducer(withLedger(), { type: 'ledgerLoaded', portfolios: [], transactions: {} });
    expect(next.manualPortfolios).toEqual([]);
    expect(next.manualTransactions).toEqual({});
  });
});

describe('the ledger keys are no longer persisted', () => {
  // Writing to both stores would reintroduce the lost update the tables exist
  // to fix: the jsonb bag ships wholesale, so a second device's copy
  // overwrites the first's.
  it('keeps them out of PERSISTED', () => {
    expect(PERSISTED).not.toContain('manualPortfolios');
    expect(PERSISTED).not.toContain('manualTransactions');
  });

  it('still reads them out of a stored bag, for the one-time import', () => {
    const legacy = readLegacyLedger({
      watchlist: ['NVDA'],
      manualPortfolios: [{ id: 'p1', name: 'Ideas' }],
      manualTransactions: { p1: [tx('t1')] },
    });
    expect(legacy.manualPortfolios).toEqual([{ id: 'p1', name: 'Ideas' }]);
    expect(legacy.manualTransactions.p1).toHaveLength(1);
  });

  it('reads a bag that never had them as empty, not as broken', () => {
    expect(readLegacyLedger({})).toEqual({ manualPortfolios: [], manualTransactions: {} });
    expect(readLegacyLedger({ manualPortfolios: 'nonsense', manualTransactions: 7 })).toEqual({
      manualPortfolios: [],
      manualTransactions: {},
    });
  });
});

describe('todayLocal', () => {
  it('formats as YYYY-MM-DD, which is what a date input takes', () => {
    expect(todayLocal(new Date(2026, 7, 29, 12, 0))).toBe('2026-08-29');
  });

  // The bug it exists to avoid: toISOString() is UTC, so for a viewer east of
  // it in the small hours the sheet would default a trade to yesterday.
  it('is the viewer’s own day, not UTC’s', () => {
    const justAfterMidnight = new Date(2026, 7, 29, 0, 30);
    expect(todayLocal(justAfterMidnight)).toBe('2026-08-29');
  });
});

describe('the back trail', () => {
  /** Walk a fresh state through a run of navigations. */
  const walk = (...actions: Action[]) => actions.reduce(reducer, initial);
  /** The trail as `screen` names, plus the view actually on screen. */
  const where = (s: AppState) => ({
    at: s.screen === 'stock' ? `stock:${s.ticker}` : s.screen,
    trail: s.navStack.map((x) => (x.screen === 'stock' ? `stock:${x.ticker}` : x.screen)),
  });

  it('starts with nothing behind it, so the first back press leaves the app', () => {
    expect(initial.navStack).toEqual([]);
    expect(reducer(initial, { type: 'back' })).toBe(initial);
  });

  it('records the view you came from', () => {
    const s = walk({ type: 'go', screen: 'pf' }, { type: 'openStock', ticker: 'AMD' });
    expect(where(s)).toEqual({ at: 'stock:AMD', trail: ['home', 'pf'] });
  });

  it('walks back through it, one press per view', () => {
    let s = walk({ type: 'go', screen: 'pf' }, { type: 'openStock', ticker: 'AMD' });
    s = reducer(s, { type: 'back' });
    expect(where(s)).toEqual({ at: 'pf', trail: ['home'] });
    s = reducer(s, { type: 'back' });
    expect(where(s)).toEqual({ at: 'home', trail: [] });
  });

  // Two stock pages are two views even though the screen name never changes,
  // so back from one must land on the other rather than skipping past both.
  it('tells two stock pages apart', () => {
    const s = walk({ type: 'openStock', ticker: 'NVDA' }, { type: 'openStock', ticker: 'AMD' });
    expect(where(s)).toEqual({ at: 'stock:AMD', trail: ['home', 'stock:NVDA'] });
    expect(where(reducer(s, { type: 'back' }))).toEqual({ at: 'stock:NVDA', trail: ['home'] });
  });

  // Otherwise every tap on the tab you are already on would leave a back
  // press that visibly does nothing.
  it('does not stack a navigation to where you already are', () => {
    const s = walk({ type: 'go', screen: 'pf' }, { type: 'go', screen: 'pf' });
    expect(where(s)).toEqual({ at: 'pf', trail: ['home'] });
  });

  // The rule that keeps a tab bar behaving like a tab bar: back walks toward
  // where you started, not through every tap that got you here.
  it('returns to a view already on the trail instead of stacking onto it', () => {
    const s = walk(
      { type: 'go', screen: 'pf' },
      { type: 'go', screen: 'watch' },
      { type: 'go', screen: 'home' },
    );
    expect(where(s)).toEqual({ at: 'home', trail: [] });
  });

  it('cannot grow without bound while someone flips between tabs', () => {
    let s: AppState = initial;
    for (let i = 0; i < 200; i++) {
      s = reducer(s, { type: 'openStock', ticker: `T${i}` });
    }
    expect(s.navStack.length).toBeLessThanOrEqual(25);
    // The oldest views are what is dropped; the recent ones still work.
    expect(where(reducer(s, { type: 'back' })).at).toBe('stock:T198');
  });

  it('is not persisted — a new session starts at home with nothing behind it', () => {
    expect(PERSISTED).not.toContain('navStack');
  });

  // The trail is where the user has been, not something the server knows: a
  // sync landing mid-session must not turn their next back press into an exit.
  it('survives the signed-in state arriving from the server', () => {
    const s = walk({ type: 'go', screen: 'pf' }, { type: 'openStock', ticker: 'AMD' });
    const synced = reducer(s, { type: 'replaceState', persisted: { watchlist: ['NVDA'] } });
    expect(where(synced)).toEqual({ at: 'stock:AMD', trail: ['home', 'pf'] });
  });

  // Sign-out drops it with everything else; the shell then hands the history
  // entries back (state/backStack.tsx) rather than leaving dead back presses.
  it('is dropped on sign-out', () => {
    const s = walk({ type: 'go', screen: 'pf' }, { type: 'openStock', ticker: 'AMD' });
    expect(reducer(s, { type: 'resetPersisted' }).navStack).toEqual([]);
  });
});
