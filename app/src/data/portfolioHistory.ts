/**
 * The reader behind a manual portfolio's value-through-time curve.
 *
 * It fetches one daily history per ticker the ledger touches and hands them to
 * the pure fold in lib/portfolioSeries.ts. Nothing here decides what a day is
 * worth; this half only decides what counts as an answer.
 *
 * The distinction it exists to keep is the one the whole app turns on. A
 * provider that answers "no history for this symbol" has told us something
 * true, and the days that ticker was held are genuinely unknowable rather than
 * broken — the curve breaks there and names it. A read that failed has told us
 * nothing, and if every read failed then the card has no business drawing a
 * shape at all and reports itself unavailable instead.
 */

import { fetchRealDailySeries } from './priceHistory';
import { buildValueSeries, type PortfolioSeries } from '../lib/portfolioSeries';
import { ok, unavailable, type Bar, type Loadable } from './types';
import type { ManualTransaction } from '../state/appState';

const FALLBACK_REASON = {
  en: 'The value history is unavailable right now.',
  he: 'היסטוריית השווי אינה זמינה כרגע.',
};

/** Distinct tickers in the ledger, upper-cased and stable in order. */
export function ledgerTickers(transactions: readonly ManualTransaction[]): string[] {
  const seen = new Set<string>();
  for (const tx of transactions) {
    const ticker = tx.ticker.trim().toUpperCase();
    if (ticker) seen.add(ticker);
  }
  return [...seen];
}

/**
 * A manual portfolio's value on every session it can be placed on.
 *
 * Never throws. An empty ledger is `ok` with no points — a portfolio with no
 * trades has an empty history, which is a real answer and not a failure.
 */
export async function fetchPortfolioSeries(
  transactions: readonly ManualTransaction[],
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<Loadable<PortfolioSeries>> {
  const tickers = ledgerTickers(transactions);
  const ledger = transactions.map((tx) => ({ ...tx, ticker: tx.ticker.trim().toUpperCase() }));
  if (tickers.length === 0) return ok(buildValueSeries([], new Map()));

  const reads = await Promise.all(tickers.map((ticker) => fetchRealDailySeries(ticker, fetchImpl, now)));

  // Every read failing is the one case that is not a portfolio fact at all: it
  // says the app could not find out, so it must not be dressed up as a chart
  // of a portfolio that could not be priced.
  if (reads.every((read) => read.status !== 'ok')) {
    const spoken = reads.find((read) => read.status === 'unavailable' && read.reason);
    return unavailable(spoken?.status === 'unavailable' ? spoken.reason : FALLBACK_REASON);
  }

  // A ticker left out of the map is one with no usable history — whether the
  // provider had none or the read failed. Either way the fold treats the days
  // it was held as unknown, which is what both of those mean here.
  const bars = new Map<string, Bar[]>();
  reads.forEach((read, i) => {
    if (read.status === 'ok' && read.data && read.data.length > 0) bars.set(tickers[i], read.data);
  });

  return ok(buildValueSeries(ledger, bars));
}
