import {
  evaluatePriceRule,
  evaluateThresholds,
  priceRuleKey,
  readLevel,
  type HeldPosition,
} from '../api/_lib/alerts.js';
import type { Outcome, StateMap, UserRules, UserState } from '../api/_lib/alertStore.js';

/**
 * The price worker's deciding, as pure functions over a snapshot.
 *
 * The worker holds one socket and sees every trade for the symbols it
 * watches. What it does with a trade is exactly what the scheduled route
 * does with a quote — the same evaluators in api/_lib/alerts.ts, the same
 * state keys, the same dedupe — so a rule cannot fire differently depending
 * on which process happened to see the crossing. This file is the glue: it
 * turns "a trade for NVDA at 201.5" into the calls those evaluators expect.
 *
 * Nothing here touches the socket or the database, which is what makes
 * the tables below testable: a snapshot in, a trade in, outcomes out.
 */

/** Everything the worker knows about the rules, refreshed every minute. */
export interface Snapshot {
  users: UserRules[];
  /** Held positions per user, for the Settings thresholds. */
  positions: Map<string, HeldPosition[]>;
}

export const EMPTY_SNAPSHOT: Snapshot = { users: [], positions: new Map() };

/**
 * The symbols the snapshot needs prices for, sorted: every price rule with a
 * readable level, and every held ticker of a user with a threshold set.
 */
export function wantedSymbols(snapshot: Snapshot): string[] {
  const wanted = new Set<string>();
  for (const u of snapshot.users) {
    for (const r of u.rules) if (r.kind === 'price' && readLevel(r) !== null) wanted.add(r.ticker);
    if (u.thresholds.up !== null || u.thresholds.down !== null) {
      for (const p of snapshot.positions.get(u.userId) ?? []) wanted.add(p.ticker);
    }
  }
  return [...wanted].sort((a, b) => a.localeCompare(b));
}

/**
 * What to send the feed so that it watches `wanted` and nothing else,
 * within the connection's symbol limit. The overflow is named rather than
 * silently dropped: a rule whose symbol is not watched cannot fire, and the
 * heartbeat says which ones those are.
 */
export function planSubscriptions(
  current: ReadonlySet<string>,
  wanted: string[],
  max: number,
): { subscribe: string[]; unsubscribe: string[]; skipped: string[] } {
  const kept = wanted.slice(0, max);
  const keptSet = new Set(kept);
  return {
    subscribe: kept.filter((s) => !current.has(s)),
    unsubscribe: [...current].filter((s) => !keptSet.has(s)).sort((a, b) => a.localeCompare(b)),
    skipped: wanted.slice(max),
  };
}

export interface TickResult {
  outcomes: Outcome[];
  states: UserState[];
}

/**
 * A copy of the engine's memory, deep enough to evaluate against safely.
 *
 * The per-user bag is copied too. A shallow `new Map(states)` would share
 * those objects, so `evaluateTick` writing into the copy would still reach
 * the original — which is the whole thing the copy exists to prevent.
 */
export function cloneStates(states: StateMap): StateMap {
  return new Map([...states].map(([userId, bag]) => [userId, { ...bag }]));
}

/**
 * One trade against every rule that watches its symbol.
 *
 * `states` is the engine's memory and is UPDATED IN PLACE with whatever the
 * evaluators decide to remember, so the next trade a second later sees the
 * side this one recorded — the database write that follows is for the next
 * process, not for this one. Without that, two trades in the same second
 * would both see the pre-crossing side and both fire.
 *
 * In place, but not on the live map: the caller evaluates against a
 * `cloneStates` copy and installs it only once the write succeeded, so a
 * crossing the database refused is not remembered as handled.
 */
export function evaluateTick(
  snapshot: Snapshot,
  states: StateMap,
  symbol: string,
  price: number,
  today: string,
): TickResult {
  const outcomes: Outcome[] = [];
  const writes: UserState[] = [];
  const quotes = { [symbol]: price };

  for (const u of snapshot.users) {
    const prev = states.get(u.userId) ?? {};
    const collect = (
      push: boolean,
      ev: { firings: Outcome['firing'][]; states: UserState[] | { key: string; state: string }[] },
    ) => {
      for (const firing of ev.firings) outcomes.push({ userId: u.userId, firing, push });
      for (const s of ev.states) {
        prev[s.key] = s.state;
        writes.push({ userId: u.userId, key: s.key, state: s.state });
      }
    };

    for (const r of u.rules) {
      if (r.kind !== 'price' || r.ticker !== symbol) continue;
      const level = readLevel(r);
      if (level === null) continue;
      const stored = prev[priceRuleKey(r.ticker, r.condition, level)];
      collect(r.notifyBy.push, evaluatePriceRule(r, price, stored, today));
    }

    // The quotes map carries only this symbol, so evaluateThresholds skips
    // every other held position on its own: no price, nothing to measure.
    const held = snapshot.positions.get(u.userId) ?? [];
    if (held.some((p) => p.ticker === symbol)) {
      collect(true, evaluateThresholds(held, u.thresholds, quotes, prev, today));
    }
    if (!states.has(u.userId) && Object.keys(prev).length > 0) states.set(u.userId, prev);
  }
  return { outcomes, states: writes };
}

/**
 * Trades arrive many times a second for a busy symbol; a rule needs to be
 * checked at most once a second. The coalescer keeps the newest price per
 * symbol and hands each symbol out no more often than `intervalMs`.
 */
export class Coalescer {
  private readonly pending = new Map<string, number>();
  private readonly lastAt = new Map<string, number>();

  constructor(private readonly intervalMs: number) {}

  /** Remember the newest price for a symbol. */
  offer(symbol: string, price: number): void {
    this.pending.set(symbol, price);
  }

  /** The symbols whose turn it is, with their newest price, removed from the queue. */
  due(now: number): Array<{ symbol: string; price: number }> {
    const out: Array<{ symbol: string; price: number }> = [];
    for (const [symbol, price] of this.pending) {
      const last = this.lastAt.get(symbol) ?? 0;
      if (now - last < this.intervalMs) continue;
      this.lastAt.set(symbol, now);
      this.pending.delete(symbol);
      out.push({ symbol, price });
    }
    return out;
  }

  /** How many symbols are waiting for their turn. */
  get size(): number {
    return this.pending.size;
  }
}
