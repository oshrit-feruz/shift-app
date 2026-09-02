import type { Quote } from '../data/types';
import type { ManualTransaction } from '../state/appState';

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
  /** Shares still held. Zero for a position that has been fully sold. */
  shares: number;
  /**
   * Average cost of the shares still held. A sale does not move it — that is
   * what "average cost" means — so this stays the price the remaining shares
   * were actually bought at.
   */
  avgCost: number;
  /** What the shares still held cost: `shares * avgCost`. */
  costBasis: number;
  /**
   * What the shares that have since been sold originally cost. Kept because
   * total return is a percentage of everything ever invested, not only of what
   * is still open — a position half sold at a profit would otherwise report a
   * return against half its true cost.
   */
  soldCost: number;
  /** Profit or loss already booked by selling, in currency. */
  realised: number;
  /** Dividends received on this ticker, in currency. */
  dividends: number;
  /**
   * Shares a sell asked for beyond what was held. TxSheet refuses an oversell
   * at entry, so this only ever comes from rows logged before that check
   * existed. Recorded rather than clamped away: a log that says 10 sold from a
   * holding of 4 is a fact about the log, and silently rounding it to 4 hides
   * the very error the reader needs to see to fix it.
   */
  oversold: number;
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
   * Total return on this position as a percentage of what was invested —
   * unrealised, realised and dividends together. `null` when unpriced, and
   * also when nothing was ever invested (a dividend logged against no
   * purchase has no denominator to be a percentage of).
   */
  plPct: number | null;
}

/** A portfolio's valuation, and what it could not price. */
export interface PortfolioValuation {
  positions: ValuedPosition[];
  /**
   * The portfolio's market value, or `null` if any held position could not be
   * priced. A total that quietly omits a leg is not a smaller total, it is a
   * wrong one — and wrong in the flattering direction whenever the missing leg
   * is the one that is up.
   */
  total: number | null;
  /** How many held positions carry a price. */
  priced: number;
  /** How many positions are held at all (shares > 0). */
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
 * Fully-sold positions are kept, with `shares === 0` and their realised P/L.
 * A position disappearing the moment it is sold looks like data loss, and
 * takes the record of what the trade actually earned with it.
 */
export function buildPositions(transactions: ManualTransaction[]): Position[] {
  const byTicker = new Map<string, Position>();
  const ordered = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const tx of ordered) {
    const ticker = tx.ticker;
    let pos = byTicker.get(ticker);
    if (!pos) {
      pos = {
        ticker,
        shares: 0,
        avgCost: 0,
        costBasis: 0,
        soldCost: 0,
        realised: 0,
        dividends: 0,
        oversold: 0,
      };
      byTicker.set(ticker, pos);
    }

    if (tx.side === 'buy') {
      const shares = pos.shares + tx.shares;
      pos.costBasis += tx.shares * tx.price;
      pos.shares = shares;
      // Guard the divide: a zero-share buy is a nonsense row, and must not
      // turn the whole position's average cost into NaN.
      pos.avgCost = shares > 0 ? pos.costBasis / shares : 0;
      continue;
    }

    if (tx.side === 'div') {
      // Touches neither shares nor cost basis — a dividend is cash received,
      // not a change in the position. It still belongs in total return.
      pos.dividends += tx.shares > 0 ? tx.shares * tx.price : tx.price;
      continue;
    }

    // sell
    const sold = Math.min(tx.shares, pos.shares);
    pos.oversold += tx.shares - sold;
    // Realised P/L is booked against what those shares cost, not against
    // whatever the average happens to be afterwards.
    pos.realised += sold * (tx.price - pos.avgCost);
    // Cost basis comes down at cost, and that cost moves to `soldCost`
    // rather than being forgotten. avgCost is deliberately left alone.
    pos.soldCost += sold * pos.avgCost;
    pos.costBasis -= sold * pos.avgCost;
    pos.shares -= sold;
    if (pos.shares === 0) pos.costBasis = 0;
  }

  return [...byTicker.values()];
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
    const value = price === null ? null : pos.shares * price;
    return { ...pos, price, value, plPct: totalReturnPct(pos, value) };
  });

  const held = valued.filter((x) => x.shares > 0);
  const unpriced = held.filter((x) => x.value === null).map((x) => x.ticker);
  const total = unpriced.length > 0 ? null : held.reduce((sum, x) => sum + (x.value ?? 0), 0);

  const invested = valued.reduce((sum, x) => sum + x.costBasis + x.soldCost, 0);
  // A closed position contributes what it booked and paid out, and needs no
  // price to do it: its `costBasis` is zero and it holds no shares to value.
  // Only a HELD leg needs a price, which is why one unpriced held ticker —
  // and not an unpriced closed one — is what makes the profit unknown.
  const pl =
    total === null
      ? null
      : valued.reduce(
          (sum, x) => sum + (x.shares > 0 ? (x.value ?? 0) : 0) + x.realised + x.dividends - x.costBasis,
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
  if (value === null) return null;
  // Everything ever paid for this ticker: what the remaining shares cost
  // plus what the sold ones cost.
  const invested = pos.costBasis + pos.soldCost;
  if (invested <= 0) return null;
  return ((value + pos.realised + pos.dividends - pos.costBasis) / invested) * 100;
}
