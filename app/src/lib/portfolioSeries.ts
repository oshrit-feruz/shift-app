/**
 * A portfolio's value through time, computed from the user's own ledger and
 * real daily closes.
 *
 * This replaces nothing less than the seeded random walk the prototype drew
 * here. The rule that shapes every decision below is the same one the totals
 * obey: a day whose holdings could not all be priced is not worth a smaller
 * number, it is worth an unknown one. Such a day is `null`, the line breaks,
 * and the break is visible.
 *
 * The fold is `buildPositions` — the same function the holdings card and the
 * portfolio total run on — applied to the ledger truncated at each date. It
 * would be faster to carry the state forward day by day, and the cost of not
 * doing so is a few tens of thousands of iterations nobody will feel. What is
 * bought with it is that the curve's last point and the total printed above it
 * are the same arithmetic over the same rows, so the two cannot drift apart.
 */

import { buildPositions } from './positions';
import type { ManualTransaction } from '../state/appState';
import type { Bar } from '../data/types';

/**
 * How long a close may stand in for a later day that has no print of its own.
 *
 * A position is genuinely worth its last traded price on a day its exchange
 * was shut — that is what a weekend is, and carrying Friday's close across it
 * states a fact rather than inventing one. What the bound stops is the same
 * move applied to a halted or delisted ticker, where last week's price is no
 * longer an answer about today. Seven days covers a weekend plus a holiday
 * either side of it; a gap wider than that is reported as unpriced.
 */
export const MAX_CARRY_DAYS = 7;

export interface ValuePoint {
  /** The session date, as raw YYYY-MM-DD. */
  date: string;
  /**
   * What the positions held that day were worth at that day's closes, or
   * `null` when any one of them could not be priced.
   */
  value: number | null;
  /**
   * What those same positions cost — `shares * avgCost`, summed.
   *
   * Never null, and that asymmetry is the point: what someone paid is their
   * own arithmetic over their own ledger, and no provider outage can make it
   * unknown. It is why the cost line stays drawn across a gap in the value
   * line, and why the two are not the same kind of claim.
   */
  cost: number;
}

export interface PortfolioSeries {
  points: ValuePoint[];
  /**
   * Tickers that were held on a drawn day and could not be priced there.
   * Named so the gap in the line can say whose it is.
   */
  unpriced: string[];
  /**
   * The first trade in the ledger, when it falls before the earliest close the
   * price window reaches. The curve cannot start where the portfolio did, and
   * a chart that silently begins in the middle of someone's history is telling
   * them their portfolio started on a day it did not.
   */
  ledgerStartsBefore: string | null;
}

/** Whole days from `from` to `to`, both raw YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

interface Closes {
  /** Session dates, ascending. */
  dates: string[];
  /** Close per session date. */
  at: Map<string, number>;
}

function indexCloses(bars: Bar[]): Closes {
  const at = new Map<string, number>();
  for (const bar of bars) {
    // Daily bars carry a raw YYYY-MM-DD; slicing keeps this correct if a
    // caller ever hands over intraday stamps by mistake, and costs nothing.
    at.set(bar.date.slice(0, 10), bar.close);
  }
  // Bare sort(): these are YYYY-MM-DD strings, whose lexicographic order is
  // their chronological one, which is the whole reason the field is raw.
  const dates = [...at.keys()].sort();
  return { dates, at };
}

/**
 * The close standing for `date`, which is that day's own close when there is
 * one and otherwise the most recent close within the carry bound.
 *
 * `null` means the ticker has no usable price for that day — either the window
 * does not reach back that far, or the last print is too old to speak for it.
 */
function closeFor(closes: Closes, date: string): number | null {
  const own = closes.at.get(date);
  if (own !== undefined) return own;

  // Last session on or before `date`, by binary search over the sorted dates.
  let lo = 0;
  let hi = closes.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (closes.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return null;

  const stamp = closes.dates[found];
  if (daysBetween(stamp, date) > MAX_CARRY_DAYS) return null;
  return closes.at.get(stamp) ?? null;
}

/**
 * The portfolio's value on every session its holdings can be placed on.
 *
 * `bars` maps ticker to that ticker's daily history; a ticker the caller could
 * not read at all is simply absent, which makes every day it was held unknown
 * rather than cheaper.
 */
export function buildValueSeries(
  transactions: ManualTransaction[],
  bars: ReadonlyMap<string, Bar[]>,
): PortfolioSeries {
  const empty: PortfolioSeries = { points: [], unpriced: [], ledgerStartsBefore: null };
  if (transactions.length === 0) return empty;

  const closesBy = new Map<string, Closes>();
  for (const [ticker, series] of bars) closesBy.set(ticker, indexCloses(series));

  // The x axis is the union of the sessions the providers actually published
  // for the tickers involved, so every point is a day a market really traded.
  // Building it from a calendar instead would invent Saturdays.
  const axis = new Set<string>();
  for (const closes of closesBy.values()) for (const date of closes.dates) axis.add(date);

  const firstTrade = transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
  const dates = [...axis].filter((d) => d >= firstTrade).sort();
  if (dates.length === 0) return { ...empty, ledgerStartsBefore: firstTrade };

  const unpriced = new Set<string>();
  const points: ValuePoint[] = dates.map((date) => {
    const held = buildPositions(transactions.filter((tx) => tx.date <= date)).filter((p) => p.shares > 0);

    // Nothing held is worth nothing — a real figure, not a missing one. The
    // stretch between selling out and buying back in is genuinely a flat zero,
    // and drawing it as a gap would claim the app lost track of the portfolio.
    if (held.length === 0) return { date, value: 0, cost: 0 };

    let value: number | null = 0;
    let cost = 0;
    for (const pos of held) {
      cost += pos.costBasis;
      const closes = closesBy.get(pos.ticker);
      const close = closes ? closeFor(closes, date) : null;
      if (close === null) {
        unpriced.add(pos.ticker);
        value = null;
        // No break: the remaining legs still have to be costed, and any of
        // them that is also unpriceable deserves to be named too.
        continue;
      }
      if (value !== null) value += pos.shares * close;
    }
    return { date, value, cost };
  });

  return {
    points,
    unpriced: [...unpriced].sort(),
    ledgerStartsBefore: firstTrade < dates[0] ? firstTrade : null,
  };
}

/**
 * What the portfolio is up or down on the positions it still holds, measured
 * on the last day it could be priced: value minus what those positions cost.
 *
 * The obvious alternative is the reason this one exists. Reading the value
 * line's first point against its last looks like performance and is not: that
 * figure rises when money is paid IN, so a portfolio that has not gained a
 * shekel reports a profit the size of the deposit. The gap between the two
 * lines cannot be moved that way — buying more lifts value and cost together
 * — so it is a claim about the market rather than about cash flow.
 *
 * `null` when no day could be priced. The percentage is `null` on top of that
 * when the holdings cost nothing to acquire, since there is nothing to be a
 * percentage of.
 */
export function openGain(points: readonly ValuePoint[]): { abs: number; pct: number | null } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.value === null) continue;
    const abs = point.value - point.cost;
    return { abs, pct: point.cost > 0 ? (abs / point.cost) * 100 : null };
  }
  return null;
}
