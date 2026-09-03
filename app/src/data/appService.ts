/**
 * The DataService the screens actually read.
 *
 * Two of its methods change source with the sample-data switch. With sample
 * data ON, portfolios() and holdings() return the demo adapter's invented
 * accounts, like everything else that switch fabricates. With it OFF they
 * return the one REAL brokerage account read through SnapTrade
 * (data/snaptradeAccount.ts) — or an honest empty list when none is linked
 * yet. Everything else — symbols, satellite signals, news, earnings, chart
 * series — is untouched by the switch and keeps its existing source.
 *
 * There used to be a third state: a separate "real connected account" switch
 * that swapped the demo accounts for the SnapTrade one. It went, because it
 * made the same fact — "is this money real" — depend on two switches, and a
 * reader who turned sample data off was still shown demo brokers.
 *
 * The SnapTrade integration is a single-account Personal-tier read: see
 * data/snaptradeAccount.ts and the README for what it is and is not.
 *
 * DATA HONESTY: with sample data off and the SnapTrade call failing, these
 * methods return 'unavailable'. They never silently fall back to the demo
 * numbers — a screen promising a real account must not quietly show an
 * invented one.
 */

import { demoService } from './demoAdapter';
import { DEMO_FLAGS } from './demoFlags';
import { fetchConnectedAccounts } from './snaptradeAccount';
import { positionReturnPct } from '../lib/format';
import type { DataService } from './service';
import {
  ok,
  unavailable,
  type ConnectedAccount,
  type ConnectedAccountsResult,
  type Holding,
  type Loadable,
  type PortfolioSummary,
} from './types';

/** The id of the synthetic "all accounts" rollup, matching the demo adapter's. */
const AGGREGATE_ID = 'agg';

/**
 * One in-flight/just-finished result shared by every caller for a moment.
 *
 * A single render of the Portfolio tab asks for portfolios() and then
 * holdings(), and the stock page asks for both again per ticker. Without this
 * each of those would be a separate three-call fan-out to SnapTrade, whose
 * own guidance is to keep holdings reads to a handful per day. The window is
 * deliberately short: a reload must still show the account's current state,
 * not a minute-old one.
 */
const CACHE_MS = 20_000;
let cache: { at: number; promise: Promise<Loadable<ConnectedAccountsResult>> } | null = null;

function connectedAccounts(): Promise<Loadable<ConnectedAccountsResult>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.promise;
  const promise = fetchConnectedAccounts().then((result) => {
    // A failure is never cached: the next look must be able to see a recovery
    // immediately, which is the whole point of showing an honest error.
    if (result.status !== 'ok') cache = null;
    return result;
  });
  cache = { at: now, promise };
  return promise;
}

/** Drops the cache so the next read goes back to SnapTrade — used when the switch flips. */
export function resetConnectedAccountCache() {
  cache = null;
}

const NO_TOTAL = {
  en: 'The brokerage did not report a total value for the connected account.',
  he: 'הברוקר לא דיווח על שווי כולל עבור החשבון המקושר.',
};

/**
 * The account's total value.
 *
 * Prefers the brokerage's own reported total. Falls back to summing cash and
 * position values only when EVERY position carries a market value — a partial
 * sum would be a real-looking number that is quietly too small, which is worse
 * than saying we do not know. Returns null when neither is possible, and the
 * caller then reports the account as unavailable rather than showing a zero.
 */
function accountTotal(account: ConnectedAccount): number | null {
  if (account.totalValue !== null) return account.totalValue;
  if (account.positions.some((p) => p.marketValue === null)) return null;
  const positions = account.positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const cash = account.balances.reduce((sum, b) => sum + (b.cash ?? 0), 0);
  return positions + cash;
}

/**
 * When the brokerage data was fetched, as the "synced …" line under the
 * account's name. Null when SnapTrade gave no timestamp — the line then
 * makes no freshness claim rather than implying one. An unparseable stamp
 * is shown verbatim: it is still a fact the provider reported.
 */
export function syncedAt(asOf: string | null): { en: string; he: string } | null {
  if (asOf === null) return null;
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return { en: asOf, he: asOf };
  const opts = { dateStyle: 'short', timeStyle: 'short' } as const;
  return { en: d.toLocaleString('en-GB', opts), he: d.toLocaleString('he-IL', opts) };
}

/**
 * A real connected account as a PortfolioSummary row, so it sits in the same
 * list as any other account and no screen needs to know where it came from.
 *
 * dayPct and allTimePct are null, not 0: SnapTrade's positions carry no
 * day-change field and no priced history to derive one from, and a 0 would
 * render as a measured flat day the app never measured. Today's move on the
 * positions themselves comes from the live quote, per holding, in
 * lib/holdings.ts — which is where the Portfolio tab reads it.
 */
function toPortfolioSummary(account: ConnectedAccount, total: number): PortfolioSummary {
  return {
    id: account.id,
    kind: 'linked',
    name: account.institution ?? account.name ?? 'Connected account',
    broker: account.institution,
    logo: null,
    acct: account.numberMasked ?? '',
    syncedAgo: syncedAt(account.asOf),
    total,
    dayPct: null,
    allTimePct: null,
  };
}

/**
 * A real position as a Holding row.
 *
 * shares/avgCost fall back to 0 only where the Holding type has no way to
 * express "unknown". Everything derived is null the moment an input is
 * missing: value is the brokerage's own market value or null, and the P&L
 * pair is derived only when units, price and cost basis are all known.
 * Today's move is null here and attached from the live quote downstream.
 */
function toHolding(position: ConnectedAccount['positions'][number]): Holding {
  const units = position.units ?? 0;
  const avgCost = position.avgCost ?? 0;
  // Shared with the rest of the app so no two places can disagree about the
  // same position — and so the short-position sign fix lives once.
  const plPct = positionReturnPct(position.openPnl, position.units, position.avgCost);
  return {
    ticker: position.ticker,
    shares: units,
    avgCost,
    price: position.price,
    value: position.marketValue,
    pl: position.openPnl,
    plPct,
    dayChange: null,
    dayChangePct: null,
    // The brokerage's own cost basis where it reported one, and units × avg
    // cost where it did not — both fall back to 0 above, so this is 0 exactly
    // when there is nothing to state, matching the rest of this mapping.
    costBasis: units * avgCost,
  };
}

/**
 * Where an account sits in the list the Portfolio tab's `pfIndex` selects on.
 *
 * The ordering rule lives here, beside livePortfolios(), because that is the
 * function that applies it — a second copy of "aggregate first, but only
 * above one account" in a screen would be free to drift out of agreement
 * with this one and send the reader to the wrong account.
 *
 * -1 when the id is not among the accounts, which the caller reads as "leave
 * the selection alone" rather than as index 0.
 */
export function liveAccountIndex(accountIds: readonly string[], accountId: string): number {
  const at = accountIds.indexOf(accountId);
  if (at === -1) return -1;
  return accountIds.length === 1 ? 0 : at + 1;
}

async function livePortfolios(): Promise<Loadable<PortfolioSummary[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  // No account to show: a real, honest empty list. The screens render their
  // genuine empty state rather than an error or a placeholder account. Which
  // KIND of empty this is — nothing connected, or a connection reporting
  // nothing — is the Connections screen's job to explain.
  if (result.data.accounts.length === 0) return ok([]);

  const rows: PortfolioSummary[] = [];
  for (const account of result.data.accounts) {
    const total = accountTotal(account);
    if (total === null) return unavailable(NO_TOTAL);
    rows.push(toPortfolioSummary(account, total));
  }
  // One account needs no rollup: "all accounts" over a single account is the
  // same figure twice, and a chip the reader has to compare against itself.
  if (rows.length === 1) return ok(rows);
  const aggregate: PortfolioSummary = {
    id: AGGREGATE_ID,
    kind: 'aggregate',
    name: 'All accounts',
    broker: null,
    logo: null,
    acct: '',
    syncedAgo: null,
    total: rows.reduce((sum, r) => sum + (r.total ?? 0), 0),
    dayPct: null,
    allTimePct: null,
  };
  return ok([aggregate, ...rows]);
}

async function liveHoldings(portfolioId: string): Promise<Loadable<Holding[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  const accounts =
    portfolioId === AGGREGATE_ID
      ? result.data.accounts
      : result.data.accounts.filter((a) => a.id === portfolioId);
  // An id this source does not know (a manual portfolio, say) gets an empty
  // list, exactly as the demo adapter does — its holdings come from elsewhere.
  return ok(accounts.flatMap((a) => a.positions.map(toHolding)));
}

/**
 * Spread first, then override: every method the switch does not touch stays
 * bound to the demo adapter, so adding a method to DataService cannot
 * accidentally leave it unimplemented here.
 */
export const appService: DataService = {
  ...demoService,
  portfolios: () => (DEMO_FLAGS.demoData ? demoService.portfolios() : livePortfolios()),
  holdings: (portfolioId: string) =>
    DEMO_FLAGS.demoData ? demoService.holdings(portfolioId) : liveHoldings(portfolioId),
};
