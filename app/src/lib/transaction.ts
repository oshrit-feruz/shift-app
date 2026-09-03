/**
 * One row of the user's own ledger, as the reducer holds it and as
 * lib/positions.ts folds it.
 *
 * A file of its own, with no React in it, because two very different callers
 * fold the same rows: the portfolio screen in the browser, and the alert
 * engine on the server (api/alerts-run.ts), which measures "from entry" for
 * the Settings thresholds. Both must agree on what average cost means, so
 * both import the one fold — and the fold's input type has to live somewhere
 * a Node typecheck can reach.
 */
export type TransactionSide = 'buy' | 'sell' | 'div';

export interface ManualTransaction {
  id: string;
  side: TransactionSide;
  ticker: string;
  shares: number;
  price: number;
  date: string;
  /** When the row was entered, as opposed to the trade date it records.
   *  Optional because valuation never needs it and older locally-held rows
   *  predate it; the transaction log uses it to order same-day entries by
   *  the order they were actually logged. */
  createdAt?: string;
}
