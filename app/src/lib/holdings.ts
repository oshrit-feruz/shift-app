import { demoService } from '../data/demoAdapter';
import { appService } from '../data/appService';
import { fetchQuotes } from '../data/quotes';
import { DEMO_FLAGS } from '../data/demoFlags';
import { isLinked } from '../data/linkState';
import { ok, unavailable, type Loadable } from '../data/types';
import type { Holding, PortfolioSummary, Quote } from '../data/types';
import { buildPositions, valuePositions, type PortfolioValuation } from './positions';
import type { ManualPortfolio, ManualTransaction } from '../state/appState';

/**
 * The user's own manual portfolios as PortfolioSummary rows, so they can sit
 * in the same list as the service-reported ones. Shared by the Portfolio tab
 * and the Stock page's holdings card — if these two built the summary
 * differently, the same portfolio would be named or totalled differently
 * depending on which screen you were looking at.
 *
 * total/dayPct/allTimePct are null, not numbers: a manual portfolio's value
 * is its positions valued at live prices, which this function does not have,
 * and its starting cash is not its worth. dayPct and allTimePct have no source
 * at all — a hand-kept ledger has no priced history behind it. Rendering any
 * of the three as a number here is exactly the invented "+0.00%" this change
 * exists to remove; the screens render "—".
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
    total: null,
    dayPct: null,
    allTimePct: null,
  }));
}

/**
 * Applies a portfolio's manual buy/sell log on top of its service-reported
 * holdings. Shared by Portfolio.tsx's own holdings list and the Stock page's
 * per-ticker "your holdings" card, so the two screens can never compute a
 * different position for the same portfolio.
 *
 * The arithmetic lives in lib/positions.ts, which folds the log into average
 * cost, realised P/L and dividends. This function's remaining job is joining
 * that to whatever the service reported and to live prices:
 *
 *  - a ticker the user has logged is theirs, valued from `quotes`. Held
 *    positions and closed ones both come back — a position that vanishes the
 *    moment it is sold looks like data loss;
 *  - a ticker only the service reported (the demo brokers) passes through
 *    untouched, since it is already valued at the demo prices it belongs to.
 *
 * `quotes` is fetchQuotes()'s map, or null when that read was unavailable, in
 * which case the logged positions render "—" rather than 0.
 */
export function mergeManualTransactions(
  rows: Holding[],
  transactions: ManualTransaction[],
  quotes: Record<string, Quote> | null = null,
): Holding[] {
  const logged = valuePositions(buildPositions(transactions), quotes).positions;
  const own = new Set(logged.map((x) => x.ticker));
  const service = rows.filter((row) => !own.has(row.ticker));
  const mine: Holding[] = logged.map((x) => ({
    ticker: x.ticker,
    shares: x.shares,
    avgCost: x.avgCost,
    value: x.value,
    plPct: x.plPct,
    costBasis: x.costBasis,
  }));
  return [...service, ...mine];
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
 *
 * The demo portfolios and their holdings are read only while sample data is
 * on. Without that check, gating the Portfolio tab would still leave the same
 * invented positions ("Blink · 14 sh · avg $131.36") on every stock page —
 * the same fabrication, one screen over. The flag is read here rather than
 * passed in because this is the data layer, the same way priceHistory.ts and
 * earnings.ts read it.
 */
export async function fetchYourPositions(
  ticker: string,
  manualTransactions: Record<string, ManualTransaction[]>,
  manualPortfolios: ManualPortfolio[] = [],
): Promise<Loadable<TickerPosition[]>> {
  // Sample data first, then a connected account, then nothing. The switch
  // wins over a real connection on purpose (data/appService.ts,
  // liveDataActive) — it is what keeps the app safe to show to a room.
  const pfs = DEMO_FLAGS.demoData
    ? await demoService.portfolios()
    : isLinked()
      ? await appService.portfolios()
      : ok<PortfolioSummary[]>([]);
  if (pfs.status !== 'ok') return pfs;

  // Built from the same list the Portfolio tab renders, so the index recorded
  // below addresses the same row the tab would select.
  const all = portfolioList(pfs.data, manualPortfolios);
  const eligible = all.filter((pf) => pf.kind !== 'aggregate');
  const settled = await Promise.all(
    eligible.map((pf) =>
      DEMO_FLAGS.demoData
        ? demoService.holdings(pf.id)
        : isLinked()
          ? appService.holdings(pf.id)
          : Promise.resolve(ok<Holding[]>([])),
    ),
  );
  if (settled.some((r) => r.status !== 'ok')) return unavailable();

  // Live prices for the user's own positions. Only the ticker this page is
  // about is priced — the fold below discards every other row anyway, and a
  // quote costs a provider request. A failed read is not fatal: the shares
  // they logged are still theirs to see, and the row simply renders "—" where
  // its worth would go.
  const quotes = await fetchQuotes([ticker]);
  const map = quotes.status === 'ok' ? quotes.data : null;

  const results: TickerPosition[] = [];
  eligible.forEach((pf, i) => {
    const rows = (settled[i] as { status: 'ok'; data: Holding[] }).data;
    const merged = mergeManualTransactions(rows, manualTransactions[pf.id] ?? [], map);
    // Held only. A position sold out is kept by the fold so the Portfolio tab
    // can show what it earned, but "your holdings" on a stock page is a claim
    // about what the reader owns right now, and 0 shares is not one.
    // `!== 0`, not `> 0`: a short is a real position with a negative share
    // count, and `> 0` hid it from its own stock page. The manual ledger
    // cannot go negative, so nothing else changes.
    const match = merged.find((row) => row.ticker === ticker && row.shares !== 0);
    if (match) {
      results.push({ portfolio: pf, holding: match, index: all.findIndex((x) => x.id === pf.id) });
    }
  });
  return ok(results);
}

/**
 * Everything one portfolio's screen needs about its holdings, from one read.
 *
 * The card's rows and the header's total come from here together on purpose.
 * They used to be computed in two places — the header from
 * `PortfolioSummary.total`, the rows from the transaction log — which is how a
 * header could show a confident dollar figure above a list of positions the
 * app had just failed to price.
 *
 * Quote failure is not fatal here: the positions are still the user's own
 * facts about what they hold, so the rows render with "—" where a price
 * belongs and the total reports itself unknown, rather than the whole card
 * going 'unavailable' and hiding the shares they logged.
 */
export interface PortfolioHoldings {
  rows: Holding[];
  valuation: PortfolioValuation;
}

export async function fetchPortfolioHoldings(
  portfolioId: string,
  transactions: ManualTransaction[],
): Promise<Loadable<PortfolioHoldings>> {
  // The same precedence fetchYourPositions() uses above: sample data while
  // its switch is on, then the connected account, then nothing.
  //
  // Reading only the demo adapter was the bug this replaces, and it failed in
  // both directions. With sample data OFF, a linked account's holdings came
  // back empty while the allocation ring beside them — which already went
  // through appService — drew the real positions, so the same card said the
  // account both held things and held nothing. With sample data ON it was
  // worse: invented rows sat under a real account's real total, which is
  // exactly what this app's data contract exists to prevent.
  const service = DEMO_FLAGS.demoData
    ? await demoService.holdings(portfolioId)
    : isLinked()
      ? await appService.holdings(portfolioId)
      : ok<Holding[]>([]);
  if (service.status !== 'ok') return service;

  // Every ticker this portfolio touches, from both halves of it: the service
  // rows and the user's own ledger. Asked for once, together, so one card is
  // one batch rather than a request per row.
  const quotes = await fetchQuotes([
    ...service.data.map((row) => row.ticker),
    ...transactions.map((tx) => tx.ticker),
  ]);
  const map = quotes.status === 'ok' ? quotes.data : null;
  const valuation = valuePositions(buildPositions(transactions), map);
  return ok({ rows: mergeManualTransactions(service.data, transactions, map), valuation });
}

/**
 * The aggregate's total across the accounts included in it.
 *
 * `null` the moment any included account's own total is unknown, for the same
 * reason a portfolio total is null when a leg is unpriced: a sum that quietly
 * drops what it could not read is not a smaller number, it is a wrong one.
 */
export function sumTotals(portfolios: PortfolioSummary[]): number | null {
  if (portfolios.some((pf) => pf.total === null)) return null;
  return portfolios.reduce((sum, pf) => sum + (pf.total ?? 0), 0);
}
