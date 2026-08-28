import { appService } from '../data/appService';
import { ok, unavailable, type Loadable } from '../data/types';
import type { Holding, PortfolioSummary } from '../data/types';
import type { ManualPortfolio, ManualTransaction } from '../state/appState';

/**
 * The user's own manual portfolios as PortfolioSummary rows, so they can sit
 * in the same list as the service-reported ones. Shared by the Portfolio tab
 * and the Stock page's holdings card — if these two built the summary
 * differently, the same portfolio would be named or totalled differently
 * depending on which screen you were looking at.
 *
 * dayPct/allTimePct are 0 because a manual portfolio has no priced history to
 * derive them from; that is a real "no data", not a computed zero.
 */
export function manualPortfolioSummaries(manualPortfolios: ManualPortfolio[]): PortfolioSummary[] {
  return manualPortfolios.map((x) => ({
    id: x.id,
    kind: 'manual',
    name: x.name,
    broker: null,
    logo: null,
    acct: 'manual entry',
    syncedAgo: null,
    total: x.startingCash,
    dayPct: 0,
    allTimePct: 0,
  }));
}

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

/**
 * Every portfolio in the order the Portfolio tab shows them: the
 * service-reported ones (aggregate first) followed by the user's own manual
 * ones.
 *
 * Both the Portfolio tab and the Stock page's holdings card build their list
 * through here, because the tab selects a portfolio by *index* into this list —
 * so if the two screens ordered it differently, tapping a holding on the stock
 * page would open a different account than the one tapped.
 */
export function portfolioList(
  servicePortfolios: PortfolioSummary[],
  manualPortfolios: ManualPortfolio[],
): PortfolioSummary[] {
  return [...servicePortfolios, ...manualPortfolioSummaries(manualPortfolios)];
}

export interface TickerPosition {
  portfolio: PortfolioSummary;
  holding: Holding;
  /**
   * Index of this portfolio in portfolioList(), which is what the Portfolio
   * tab's `pfIndex` selects on — carried here so tapping a holding row can open
   * that specific account rather than whichever one happened to be selected.
   */
  index: number;
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
 * The user's own manual portfolios are included alongside the service-reported
 * ones. They have no service holdings — appService.holdings() returns an
 * empty list for an id it doesn't know — so their positions come entirely from
 * the manual transaction log, exactly as the Portfolio tab builds them. Leaving
 * them out would mean a ticker you logged yourself showed up on the Portfolio
 * tab but not on its own stock page.
 *
 * If any portfolio's holdings call fails, the whole result is 'unavailable'
 * rather than silently treating that portfolio as empty — under the global
 * demo failure flag every call fails together, and reporting "no position"
 * from a failure would misrepresent "we don't know" as "you hold none".
 */
export async function fetchYourPositions(
  ticker: string,
  manualTransactions: Record<string, ManualTransaction[]>,
  manualPortfolios: ManualPortfolio[] = [],
): Promise<Loadable<TickerPosition[]>> {
  const pfs = await appService.portfolios();
  if (pfs.status !== 'ok') return pfs;

  // Built from the same list the Portfolio tab renders, so the index recorded
  // below addresses the same row the tab would select.
  const all = portfolioList(pfs.data, manualPortfolios);
  const eligible = all.filter((pf) => pf.kind !== 'aggregate');
  const settled = await Promise.all(eligible.map((pf) => appService.holdings(pf.id)));
  if (settled.some((r) => r.status !== 'ok')) return unavailable();

  const results: TickerPosition[] = [];
  eligible.forEach((pf, i) => {
    const rows = (settled[i] as { status: 'ok'; data: Holding[] }).data;
    const merged = mergeManualTransactions(rows, manualTransactions[pf.id] ?? []);
    const match = merged.find((row) => row.ticker === ticker);
    if (match) {
      results.push({ portfolio: pf, holding: match, index: all.findIndex((x) => x.id === pf.id) });
    }
  });
  return ok(results);
}
