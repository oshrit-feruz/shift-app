import { demoService } from '../data/demoAdapter';
import { ok, unavailable, type Loadable } from '../data/types';
import type { Holding, PortfolioSummary } from '../data/types';
import type { ManualTransaction } from '../state/appState';

/**
 * Applies a portfolio's manual buy/sell log on top of its service-reported
 * holdings. Shared by Portfolio.tsx's own holdings list and the Stock page's
 * per-ticker "your holdings" card, so the two screens can never compute a
 * different position for the same portfolio.
 *
 * Dividends (side 'div') carry no share count and don't affect a position,
 * so they're skipped here.
 */
export function mergeManualTransactions(rows: Holding[], transactions: ManualTransaction[]): Holding[] {
  const merged = new Map(rows.map((row) => [row.ticker, { ...row }]));
  for (const tx of transactions) {
    if (tx.side === 'div') continue;
    const current = merged.get(tx.ticker) ?? {
      ticker: tx.ticker,
      shares: 0,
      avgCost: 0,
      value: 0,
      plPct: 0,
    };
    if (tx.side === 'buy') {
      const shares = current.shares + tx.shares;
      current.avgCost = shares > 0 ? (current.avgCost * current.shares + tx.price * tx.shares) / shares : 0;
      current.shares = shares;
      current.value += tx.price * tx.shares;
    } else {
      current.shares = Math.max(0, current.shares - tx.shares);
      current.value = Math.max(0, current.value - tx.price * tx.shares);
    }
    merged.set(tx.ticker, current);
  }
  return [...merged.values()].filter((row) => row.shares > 0);
}

export interface TickerPosition {
  portfolio: PortfolioSummary;
  holding: Holding;
}

/**
 * Where the user actually holds `ticker`, across every real portfolio —
 * powers the Stock page's "your holdings" card so viewing NVDA while it's
 * sitting in Blink shows that position right there, not just on the
 * Portfolio tab.
 *
 * The aggregate ("All accounts") pseudo-portfolio is deliberately excluded:
 * it is a rollup of the others, not a separate place the ticker is held, so
 * listing it alongside its own constituents would double-count by
 * definition regardless of what the demo numbers happen to show.
 *
 * If any portfolio's holdings call fails, the whole result is 'unavailable'
 * rather than silently treating that portfolio as empty — under the global
 * demo failure flag every call fails together, and reporting "no position"
 * from a failure would misrepresent "we don't know" as "you hold none".
 */
export async function fetchYourPositions(
  ticker: string,
  manualTransactions: Record<string, ManualTransaction[]>,
): Promise<Loadable<TickerPosition[]>> {
  const pfs = await demoService.portfolios();
  if (pfs.status !== 'ok') return pfs;

  const eligible = pfs.data.filter((pf) => pf.kind !== 'aggregate');
  const settled = await Promise.all(eligible.map((pf) => demoService.holdings(pf.id)));
  if (settled.some((r) => r.status !== 'ok')) return unavailable();

  const results: TickerPosition[] = [];
  eligible.forEach((pf, i) => {
    const rows = (settled[i] as { status: 'ok'; data: Holding[] }).data;
    const merged = mergeManualTransactions(rows, manualTransactions[pf.id] ?? []);
    const match = merged.find((row) => row.ticker === ticker);
    if (match) results.push({ portfolio: pf, holding: match });
  });
  return ok(results);
}
