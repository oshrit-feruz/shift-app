import { describe, expect, it } from 'vitest';
import { Coalescer, evaluateTick, planSubscriptions, wantedSymbols, type Snapshot } from './engine.js';
import type { AlertRule } from '../api/_lib/alerts.js';
import type { StateMap } from '../api/_lib/alertStore.js';

/**
 * The worker sees trades instead of quotes, but must decide exactly as the
 * scheduled route does: arm on the first look, fire on the crossing, stay
 * quiet while the condition holds. The one thing it adds is memory between
 * two trades in the same second, and that is what the last table checks.
 */

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: 'a1',
  ticker: 'NVDA',
  kind: 'price',
  condition: 'rise',
  value: '200',
  remind: 'day',
  notifyBy: { push: true, email: false },
  ...over,
});

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  users: [{ userId: 'u1', rules: [rule()], thresholds: { up: null, down: null } }],
  positions: new Map(),
  ...over,
});

describe('wantedSymbols', () => {
  it('collects price-rule tickers and, for users with a threshold, their held tickers', () => {
    const s = snapshot({
      users: [
        {
          userId: 'u1',
          rules: [rule(), rule({ id: 'a2', ticker: 'AMD' })],
          thresholds: { up: null, down: null },
        },
        { userId: 'u2', rules: [], thresholds: { up: 25, down: null } },
        {
          userId: 'u3',
          rules: [rule({ id: 'a3', ticker: 'LLY', value: 'soon' })],
          thresholds: { up: null, down: null },
        },
      ],
      positions: new Map([
        ['u2', [{ ticker: 'TSLA', shares: 2, avgCost: 100 }]],
        ['u3', [{ ticker: 'XOM', shares: 2, avgCost: 100 }]],
      ]),
    });
    // u3's rule has no readable level and u3 has no threshold, so neither
    // LLY nor XOM is asked for.
    expect(wantedSymbols(s)).toEqual(['AMD', 'NVDA', 'TSLA']);
  });
});

describe('planSubscriptions', () => {
  it('subscribes what is new, unsubscribes what is gone, and names the overflow', () => {
    const plan = planSubscriptions(new Set(['AMD', 'OLD']), ['AMD', 'NVDA', 'TSLA'], 2);
    expect(plan).toEqual({ subscribe: ['NVDA'], unsubscribe: ['OLD'], skipped: ['TSLA'] });
  });

  it('is a no-op when nothing changed', () => {
    expect(planSubscriptions(new Set(['NVDA']), ['NVDA'], 50)).toEqual({
      subscribe: [],
      unsubscribe: [],
      skipped: [],
    });
  });
});

describe('evaluateTick', () => {
  const today = '2026-09-03';

  it('arms on the first trade and fires on the crossing, remembering in between', () => {
    const states: StateMap = new Map();
    const first = evaluateTick(snapshot(), states, 'NVDA', 199, today);
    expect(first.outcomes).toEqual([]);
    expect(first.states).toEqual([{ userId: 'u1', key: 'price|NVDA|rise|200', state: 'below' }]);
    // The memory was updated in place: the second trade sees 'below'.
    const second = evaluateTick(snapshot(), states, 'NVDA', 200.5, today);
    expect(second.outcomes).toHaveLength(1);
    expect(second.outcomes[0]).toMatchObject({ userId: 'u1', push: true });
    expect(second.outcomes[0].firing.title.en).toBe('NVDA rose above $200.00 (now $200.50)');
    // And a third trade in the same second, still above, is silent.
    const third = evaluateTick(snapshot(), states, 'NVDA', 201, today);
    expect(third).toEqual({ outcomes: [], states: [] });
  });

  it('ignores trades for symbols no rule watches', () => {
    const states: StateMap = new Map();
    expect(evaluateTick(snapshot(), states, 'AMD', 150, today)).toEqual({ outcomes: [], states: [] });
  });

  it('measures the Settings thresholds from entry on the traded symbol only', () => {
    const s = snapshot({
      users: [{ userId: 'u1', rules: [], thresholds: { up: 25, down: null } }],
      positions: new Map([
        [
          'u1',
          [
            { ticker: 'NVDA', shares: 10, avgCost: 100 },
            { ticker: 'AMD', shares: 5, avgCost: 100 },
          ],
        ],
      ]),
    });
    const states: StateMap = new Map([['u1', { 'thr|NVDA|up|25': 'below' }]]);
    const r = evaluateTick(s, states, 'NVDA', 130, today);
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0].firing.title.en).toBe('NVDA crossed your +25% alert (currently +30.0% from entry)');
    // AMD had no trade, so it was not touched: no state written for it.
    expect(r.states).toEqual([{ userId: 'u1', key: 'thr|NVDA|up|25', state: 'above' }]);
  });

  it('starts memory for a user the store had nothing for', () => {
    const states: StateMap = new Map();
    evaluateTick(snapshot(), states, 'NVDA', 150, today);
    expect(states.get('u1')).toEqual({ 'price|NVDA|rise|200': 'below' });
  });
});

describe('Coalescer', () => {
  it('keeps the newest price and hands a symbol out at most once per interval', () => {
    const c = new Coalescer(1000);
    c.offer('NVDA', 1);
    c.offer('NVDA', 2);
    c.offer('AMD', 5);
    expect(c.size).toBe(2);
    expect(c.due(10_000)).toEqual([
      { symbol: 'NVDA', price: 2 },
      { symbol: 'AMD', price: 5 },
    ]);
    expect(c.size).toBe(0);
    c.offer('NVDA', 3);
    // Too soon: it waits.
    expect(c.due(10_500)).toEqual([]);
    expect(c.size).toBe(1);
    expect(c.due(11_000)).toEqual([{ symbol: 'NVDA', price: 3 }]);
  });
});
