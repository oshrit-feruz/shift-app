import type { Quote } from '../data/types';
import type { ManualTransaction } from './transaction';

/**
 * A position built from the user's own transaction log, and the valuation of
 * one against live prices.
 *
 * This replaces the fold that used to live in `holdings.ts`, which got three
 * things wrong in ways that read as real numbers on screen:
 *
 *  - a sell moved `avgCost` to the *sale* price, which is not what average
 *    cost means and made a profitable sale look like a cost-basis increase;
 *  - `value` accumulated cost basis but was rendered as the position's worth,
 *    so a holding up 40% displayed what it had been paid for;
 *  - `plPct` was never assigned at all, so every manual position rendered a
 *    green `+0.00%` — an invented flat return presented as a measured one;
 *  - dividends were recorded by the sheet and then skipped outright, and a
 *    position sold to zero vanished from the list as though it never existed.
 */
export interface Position {
  ticker: string;
  /**
   * Shares held. Positive for a long, NEGATIVE for a short, zero for a
   * position that has been closed. A short is a real position — shares sold
   * that were not held, to be bought back later — and it reads the same way
   * a brokerage reports one.
   */
  shares: number;
  /**
   * Average cost of the shares still held. For a long, what they were bought
   * at; for a short, what they were sold at. A trade that reduces the
   * position does not move it — that is what "average" means — so this stays
   * the price the remaining shares were actually opened at.
   */
  avgCost: number;
  /**
   * What the open position cost: `shares * avgCost`. Negative for a short,
   * which is money received rather than paid, and which is what makes
   * `value - costBasis` the open P/L in both directions.
   */
  costBasis: number;
  /**
   * The cost of everything that has since been closed — shares sold out of a
   * long, or bought back into a short — at the price it was opened at. Kept
   * because total return is a percentage of everything ever put at risk, not
   * only of what is still open: a position half closed at a profit would
   * otherwise report a return against half its true basis.
   */
  soldCost: number;
  /** Profit or loss already booked by closing, in currency. */
  realised: number;
  /** Dividends received on this ticker, in currency. */
  dividends: number;
}

/**
 * A position priced against the market, or explicitly not priced.
 *
 * `price`, `value` and `plPct` are `null` — never 0 — for both ways a price
 * can be missing: the quote read failed, or it succeeded and the provider has
 * no price for this ticker. Zero is a number a reader will believe; `—` is
 * the truth.
 */
export interface ValuedPosition extends Position {
  price: number | null;
  value: number | null;
  /**
   * Total return on this position in currency — what the held shares are
   * worth now, plus what selling already booked, plus dividends, less what
   * the held shares cost. `null` when unpriced.
   */
  pl: number | null;
  /**
   * The same return as a percentage of what was invested — unrealised,
   * realised and dividends together. `null` when unpriced, and also when
   * nothing was ever invested (a dividend logged against no purchase has no
   * denominator to be a percentage of).
   */
  plPct: number | null;
}

/** A portfolio's valuation, and what it could not price. */
export interface PortfolioValuation {
  positions: ValuedPosition[];
  /**
   * The portfolio's net market value — shorts count negative — or `null` if any open position could not be
   * priced. A total that quietly omits a leg is not a smaller total, it is a
   * wrong one — and wrong in the flattering direction whenever the missing leg
   * is the one that is up.
   */
  total: number | null;
  /** How many held positions carry a price. */
  priced: number;
  /** How many positions are open at all (shares ≠ 0, long or short). */
  held: number;
  /** Held tickers with no price, in list order, so the UI can name them. */
  unpriced: string[];
  /**
   * Everything ever paid into this portfolio: the cost of what is still held
   * plus the cost of what has since been sold. The denominator `plPct` is a
   * percentage of, and a real number even when nothing can be priced.
   */
  invested: number;
  /**
   * Total return in currency — what the held shares are worth now, plus what
   * selling already booked, plus dividends, less what the held shares cost.
   *
   * `null` on exactly the same condition as `total`: one unpriced leg makes
   * the profit unknown, not smaller, and wrong in the flattering direction
   * whenever the missing leg is the one that is down.
   */
  pl: number | null;
  /**
   * `pl` as a percentage of `invested`. `null` when `pl` is, and also when
   * nothing was ever invested — a dividend logged against no purchase has no
   * denominator, and both `Infinity%` and `0.00%` would be inventions.
   */
  plPct: number | null;
}

/**
 * Fold a transaction log into positions, one per ticker.
 *
 * Ordered by trade date rather than array order: average-cost accounting is
 * order-dependent, so a log whose rows arrived out of order — two devices, or
 * a back-dated trade entered later — would otherwise produce a different cost
 * basis than the same trades entered in sequence. Ties keep their original
 * relative order (`Array.prototype.sort` is stable), which is the closest
 * thing to an entry order that a bare date gives us.
 *
 * A sell of more than is held opens a SHORT for the excess, at the sale
 * price; a buy against a short covers it first, booking the difference, and
 * any excess opens a long. That is how a brokerage records the same trades,
 * and it is what lets the Sandbox hold a position "in minus" — the old fold
 * clamped such a sell to the shares held and recorded the rest as an error.
 *
 * Closed positions are kept, with `shares === 0` and their realised P/L. A
 * position disappearing the moment it is closed looks like data loss, and
 * takes the record of what the trade actually earned with it.
 */
export function buildPositions(transactions: ManualTransaction[]): Position[] {
  const byTicker = new Map<string, Position>();
  const ordered = [...transactions].sort(byTradeDate);

  for (const tx of ordered) {
    const ticker = tx.ticker;
    let pos = byTicker.get(ticker);
    if (!pos) {
      pos = { ticker, shares: 0, avgCost: 0, costBasis: 0, soldCost: 0, realised: 0, dividends: 0 };
      byTicker.set(ticker, pos);
    }

    if (tx.side === 'div') {
      // Touches neither shares nor cost basis — a dividend is cash received,
      // not a change in the position. It still belongs in total return.
      pos.dividends += tx.shares > 0 ? tx.shares * tx.price : tx.price;
      continue;
    }

    // Both sides are the same two steps: close whatever of the OPPOSITE
    // position is there, then open or add to a position on this side with
    // what is left. `direction` is +1 for a buy and −1 for a sell, so the
    // arithmetic below is written once for longs and shorts alike.
    const direction = tx.side === 'buy' ? 1 : -1;
    let remaining = tx.shares;

    // Step one: close. Runs when the position is on the other side of this
    // trade — a sell against a long, or a buy against a short.
    if (pos.shares !== 0 && Math.sign(pos.shares) !== direction) {
      const closed = Math.min(remaining, Math.abs(pos.shares));
      // Booked against what those shares were opened at, not against
      // whatever the average happens to be afterwards. A long gains when
      // sold above its cost; a short gains when bought back below it.
      pos.realised += closed * (tx.price - pos.avgCost) * -direction;
      pos.soldCost += closed * pos.avgCost;
      pos.shares += closed * direction;
      pos.costBasis = pos.shares * pos.avgCost;
      remaining -= closed;
    }

    // Step two: open, or add to, a position on this side. Averaged in with
    // whatever is already open on the same side; a fresh position after a
    // full close starts from nothing.
    if (remaining > 0) {
      const open = Math.abs(pos.shares);
      const total = open + remaining;
      pos.avgCost = (open * pos.avgCost + remaining * tx.price) / total;
      pos.shares = total * direction;
      pos.costBasis = pos.shares * pos.avgCost;
    }
  }

  return [...byTicker.values()];
}

/** Oldest trade first; equal dates keep their relative order (the sort is stable). */
function byTradeDate(a: ManualTransaction, b: ManualTransaction): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return 0;
}

/** What an open position is worth at `price`, or null when there is none. */
function openWorth(pos: Position, price: number | null): number | null {
  return price === null ? null : pos.shares * price;
}

/**
 * Price a set of positions against a quote map, and total what can be totalled.
 *
 * `quotes` is `fetchQuotes()`'s map, or `null` when that read was unavailable —
 * in which case nothing is priced and the total is `null`, which is the same
 * answer as "one leg is missing" because it is the same fact: we do not know
 * what this portfolio is worth.
 */
export function valuePositions(
  positions: Position[],
  quotes: Record<string, Quote> | null,
): PortfolioValuation {
  const valued: ValuedPosition[] = positions.map((pos) => {
    const price = quotes?.[pos.ticker]?.price ?? null;
    // A closed position is worth zero — known, not unknown, and known
    // without a quote. Passing null here made its booked result null too,
    // so a position sold out months ago showed "—" whenever its ticker
    // happened to be unpriced today, though realised, dividends and soldCost
    // already determine the whole answer.
    const value = pos.shares === 0 ? 0 : openWorth(pos, price);
    return { ...pos, price, value, pl: totalReturn(pos, value), plPct: totalReturnPct(pos, value) };
  });

  // Open in either direction: a short is a held position with negative
  // shares, and its (negative) value is part of what the portfolio is worth.
  const held = valued.filter((x) => x.shares !== 0);
  const unpriced = held.filter((x) => x.value === null).map((x) => x.ticker);
  const total = unpriced.length > 0 ? null : held.reduce((sum, x) => sum + (x.value ?? 0), 0);

  // The basis is the money put at risk, so a short's negative cost basis
  // counts by its size — the same reason positionReturnPct() takes an
  // absolute basis.
  const invested = valued.reduce((sum, x) => sum + Math.abs(x.costBasis) + x.soldCost, 0);
  // A closed position contributes what it booked and paid out, and needs no
  // price to do it: its `costBasis` is zero and it holds no shares to value.
  // Only a HELD leg needs a price, which is why one unpriced held ticker —
  // and not an unpriced closed one — is what makes the profit unknown.
  const pl =
    total === null
      ? null
      : valued.reduce(
          (sum, x) => sum + (x.shares !== 0 ? (x.value ?? 0) : 0) + x.realised + x.dividends - x.costBasis,
          0,
        );

  return {
    positions: valued,
    total,
    priced: held.length - unpriced.length,
    held: held.length,
    unpriced,
    invested,
    pl,
    plPct: pl === null || invested <= 0 ? null : (pl / invested) * 100,
  };
}

/**
 * Total return on a position as a percentage of what was invested: what the
 * shares are worth now, plus what selling already booked, plus dividends,
 * against the cost of everything that was bought.
 *
 * `null` when the position cannot be priced, and when nothing was ever
 * invested — a dividend logged against no purchase is a real number with no
 * denominator, and dividing by zero to render `Infinity%` or `0.00%` would
 * both be inventions.
 */
function totalReturnPct(pos: Position, value: number | null): number | null {
  const pl = totalReturn(pos, value);
  if (pl === null) return null;
  // Everything ever put at risk on this ticker: what the open position cost
  // (by its size — a short's basis is negative) plus what the closed part did.
  const invested = Math.abs(pos.costBasis) + pos.soldCost;
  if (invested <= 0) return null;
  return (pl / invested) * 100;
}

/**
 * Total return on a position in currency: the money form of the percentage
 * above, over exactly the same terms, so the two can never disagree.
 */
function totalReturn(pos: Position, value: number | null): number | null {
  if (value === null) return null;
  return value + pos.realised + pos.dividends - pos.costBasis;
}
