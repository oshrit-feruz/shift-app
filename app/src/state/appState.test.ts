import { describe, expect, it, vi } from 'vitest';
import {
  reducer,
  readLegacyLedger,
  readPersisted,
  hydrate,
  setupProgress,
  initial,
  PERSISTED,
  type Action,
  type AppState,
  type ManualTransaction,
} from './appState';
import { todayLocal } from '../sheets/TxSheet';
import { mergeRemote, adoptRemote } from './remoteState';
import type { Answer } from '../lib/advisory';

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

  // The ticker drifts as you browse, and only the stock page is selected by
  // it. Comparing it everywhere meant the home the user started on — filed
  // under whatever stock was current then — went unrecognised, so back landed
  // on home, then a stock page, then an indistinguishable home again.
  it('recognises a non-stock view whatever stock was current when it was left', () => {
    const s = walk({ type: 'openStock', ticker: 'AMD' }, { type: 'go', screen: 'home' });
    expect(where(s)).toEqual({ at: 'home', trail: [] });
  });

  // The pill that leads back to the checklist is set by the navigation that
  // opened the screen, not by the screen — so a screen returned to without it
  // is not the screen the user left.
  it('restores the chrome the view was opened with', () => {
    let s = walk(
      { type: 'go', screen: 'steps' },
      { type: 'go', screen: 'learn', fromSteps: true },
      { type: 'go', screen: 'pf' },
    );
    expect(s.fromSteps).toBe(false);
    s = reducer(s, { type: 'back' });
    expect(where(s).at).toBe('learn');
    expect(s.fromSteps).toBe(true);
  });

  it('restores whether the advisory step was opened on its own', () => {
    let s = walk(
      { type: 'advGoto', screen: 'advConnect', solo: true },
      // The next step of the flow, which is where advSolo is cleared.
      { type: 'advGoto', screen: 'advDash' },
    );
    expect(s.advSolo).toBe(false);
    s = reducer(s, { type: 'back' });
    expect(where(s).at).toBe('advConnect');
    expect(s.advSolo).toBe(true);
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

describe('a stored advisory-answer bag that cannot be trusted', () => {
  /**
   * The quiet failure this guards.
   *
   * `advAnswers` round-trips through localStorage and the synced user_state
   * row, and the reducer appends without a cap, so neither the length nor the
   * values are guaranteed on the way back in. `mapProfile` sums them against
   * thresholds calibrated for exactly four answers each in 1..3 — so a fifth
   * entry, or a 7, or a string, produces a profile that looks entirely
   * ordinary and is built for a risk appetite the reader never described.
   *
   * Nothing throws. Nothing looks wrong. That is why the bag is dropped here
   * rather than read charitably — the same call the alert rows make one
   * function down.
   */
  it('keeps a bag the app could actually have written', () => {
    // Only the complete one keeps a finished stage. The partial arrays are
    // real states, so the ANSWERS survive — but a stage of 5 beside them is
    // not, and is corrected below rather than preserved. An earlier version of
    // this test asserted the opposite and was encoding the bug.
    const out = readPersisted({ advAnswers: [1, 2, 3, 3], advStage: 5 });
    expect(out.advAnswers).toEqual([1, 2, 3, 3]);
    expect(out.advStage).toBe(5);

    for (const answers of [[], [3], [1, 2], [3, 2, 1]]) {
      const partial = readPersisted({ advAnswers: answers, advStage: 0 });
      expect(partial.advAnswers, JSON.stringify(answers)).toEqual(answers);
      expect(partial.advStage).toBe(0);
    }
  });

  it('refuses a stage outside the flow, which routes nowhere at all', () => {
    // ADV_ORDER has five entries and setupProgress indexes it directly, so a
    // negative stage resolves to undefined and navigates to no screen.
    for (const stage of [-1, 6, 99, 2.5, Number.NaN, '3', null]) {
      const out = readPersisted({ advAnswers: [1, 2, 3, 3], advStage: stage });
      expect(out.advStage, String(stage)).toBe(0);
    }
  });

  it('does not judge the pair when only one half is present', () => {
    // Same rule as absent answers: a FRAGMENT carrying one key says nothing
    // about the other, and correcting on the strength of a key never sent
    // would discard progress this row never described. The pair itself is
    // enforced once the state is whole — see the suite below, which is where
    // that omission would otherwise turn into a Balanced allocation.
    expect(readPersisted({ advStage: 3 }).advStage).toBe(3);
    const answersOnly = readPersisted({ advAnswers: [2] });
    expect(answersOnly.advAnswers).toEqual([2]);
    expect(answersOnly).not.toHaveProperty('advStage');
  });

  it('drops a fifth answer rather than summing it', () => {
    const out = readPersisted({ advAnswers: [2, 2, 2, 2, 2], advStage: 5 });
    expect(out.advAnswers).toEqual([]);
  });

  it('drops values outside 1..3, which would sum just as silently', () => {
    // A 7 is not a louder failure than a fifth answer, only a rarer one.
    expect(readPersisted({ advAnswers: [7, 2, 2, 2] }).advAnswers).toEqual([]);
    expect(readPersisted({ advAnswers: [0, 2, 2, 2] }).advAnswers).toEqual([]);
    expect(readPersisted({ advAnswers: [2.5, 2, 2, 2] }).advAnswers).toEqual([]);
  });

  it('drops a string, which would turn the sum into concatenation', () => {
    expect(readPersisted({ advAnswers: ['2', 2, 2, 2] }).advAnswers).toEqual([]);
    expect(readPersisted({ advAnswers: [null, 2, 2, 2] }).advAnswers).toEqual([]);
  });

  it('drops something that is not an array at all', () => {
    expect(readPersisted({ advAnswers: 'routed' }).advAnswers).toEqual([]);
    expect(readPersisted({ advAnswers: { 0: 1 } }).advAnswers).toEqual([]);
    expect(readPersisted({ advAnswers: null }).advAnswers).toEqual([]);
  });

  it('resets the stage alongside, so nothing routes past questions with no answers', () => {
    // advStage only ever advances past the chat, so a stage above zero with no
    // answers is unreachable by the app — and left standing it would send the
    // reader straight to a recommendation with nothing behind it.
    const out = readPersisted({ advAnswers: [2, 2, 2, 2, 2], advStage: 5 });
    expect(out.advStage).toBe(0);
  });

  it('leaves a bag that simply does not mention the answers alone', () => {
    // A partial server row carrying advStage and no advAnswers says nothing
    // about the answers. Treating absent as corrupt would discard progress
    // this row never described — caught by the mergeRemote whitelist test.
    const out = readPersisted({ advStage: 2 });
    expect(out).not.toHaveProperty('advAnswers');
    expect(out.advStage).toBe(2);
  });
});

describe('the answers-and-stage invariant, once the state is whole', () => {
  /**
   * A stage above zero is only ever set after all four answers exist, so the
   * two fields are one fact. But the fact is only visible on an ASSEMBLED
   * state: readPersisted sees a fragment, and a fragment that omits the
   * answers says nothing about them. Both callers then merge over `initial`,
   * which supplies `advAnswers: []` — and a stage of 2 beside an empty array
   * routes to `advDash`, where `mapProfile([])` is null and the recommendation
   * screen's `?? 'bal'` fallback hands over a full Balanced allocation.
   *
   * Nothing is corrupt at any single step, which is why validating the
   * fragment alone was not enough. These cases pin it at both doors.
   */
  const persist = (persisted: Partial<AppState>): AppState =>
    reducer(initial, { type: 'replaceState', persisted } as Action);

  it('refuses a server row that carries a stage and no answers', () => {
    // mergeRemote adopts a non-empty server bag wholesale at sign-in.
    const { next } = mergeRemote({ advAnswers: [], advStage: 0 }, { advStage: 2 });
    const s = persist(next);
    expect(s.advStage).toBe(0);
    expect(setupProgress(s).resumeScreen).toBe('advChat');
  });

  it('refuses a stage-only update landing on partial answers', () => {
    // adoptRemote merges the remote fragment over the CURRENT bag, so the
    // stage can meet answers it never travelled with.
    const merged = adoptRemote({ advAnswers: [2], advStage: 0 }, { advStage: 5 });
    const s = persist(merged ?? {});
    expect(s.advStage).toBe(0);
    expect(s.advAnswers).toEqual([2]);
  });

  it('refuses every incomplete answers-and-stage pair it can be handed', () => {
    for (const advAnswers of [[], [2], [1, 2], [3, 2, 1]] as Answer[][])
      for (const advStage of [1, 2, 3, 4, 5]) {
        const s = persist({ advAnswers, advStage });
        expect(s.advStage, `${JSON.stringify(advAnswers)} @ ${advStage}`).toBe(0);
        // The answers survive: someone mid-chat keeps their place.
        expect(s.advAnswers).toEqual(advAnswers);
      }
  });

  it('leaves every complete pair alone', () => {
    for (const advStage of [0, 1, 2, 3, 4, 5]) {
      expect(persist({ advAnswers: [1, 2, 3, 3], advStage }).advStage, `stage ${advStage}`).toBe(advStage);
    }
  });

  it('holds on a local boot too, not only on the server path', () => {
    const store = new Map([['shift.state', JSON.stringify({ advAnswers: [2], advStage: 5 })]]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {},
    });
    const s = hydrate();
    vi.unstubAllGlobals();
    expect(s.advStage).toBe(0);
    expect(s.advAnswers).toEqual([2]);
  });

  it('never routes an assembled state to a screen that does not exist', () => {
    // The whole point of the invariant, stated as the property it protects.
    // Every stage, not a sample. The omitted 2 and 4 created no separate branch
    // in withCoherentAdvisory, so nothing was untested — but a loop labelled as
    // a property while quietly skipping values reads stronger than it is, and
    // that is the failure mode that has already cost this PR two rounds.
    for (const advAnswers of [[], [2], [1, 2], [3, 2, 1], [1, 2, 3, 3]] as Answer[][])
      for (const advStage of [-2, -1, 0, 1, 2, 3, 4, 5, 6, 99, 2.5, Number.NaN]) {
        const s = persist({ advAnswers, advStage });
        const screen = setupProgress(s).resumeScreen;
        expect(screen, `${JSON.stringify(advAnswers)} @ ${advStage}`).toBeDefined();
        // And it only reaches the recommendation with a real profile behind it.
        if (screen === 'advDash') expect(s.advAnswers).toHaveLength(4);
      }
  });
});
