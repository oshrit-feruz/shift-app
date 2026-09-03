/**
 * The DataService the screens actually read.
 *
 * By default it *is* the demo adapter — every method delegates straight
 * through, so a user who has not connected a brokerage sees exactly the app
 * that existed before this file.
 *
 * Once a user connects one (Connections → "connect an account", which opens
 * SnapTrade's hosted portal), two methods change source: portfolios() and
 * holdings() stop returning the demo adapter's invented accounts and return
 * that person's REAL brokerage accounts instead (data/snaptradeAccount.ts).
 * Everything else — symbols, satellite signals, news, earnings, chart series
 * — is untouched and keeps its existing source.
 *
 * WHAT DECIDES WHICH SOURCE. `isLinked()` (data/linkState.ts), which is the
 * remembered answer to "has this user connected a brokerage", written only by
 * a real response from the server. It used to be a demo switch in Settings;
 * it is now a fact about the account, so nobody has to turn anything on to
 * see their own money.
 *
 * DATA HONESTY: when a user IS linked and the SnapTrade call fails, these
 * methods return 'unavailable'. They never silently fall back to the demo
 * numbers — a screen showing a real account must not quietly show an invented
 * one. The one case that does fall back is `linked: false`, which is not a
 * failure at all: it is the server saying this person has connected nothing,
 * and the app's own data is then the honest thing to show.
 */

import { demoService } from './demoAdapter';
import { isLinked } from './linkState';
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
 * deliberately short: a demo being reloaded on stage must still show the
 * account's current state, not a minute-old one.
 */
const CACHE_MS = 20_000;
let cache: { at: number; promise: Promise<Loadable<ConnectedAccountsResult>> } | null = null;

/**
 * One shared read of the connected accounts, briefly cached, so the several
 * screens that ask within the same moment cost one upstream call rather than
 * one each.
 */
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

/**
 * Drops the cache so the next read goes back to SnapTrade — used the moment a
 * connection is created or revoked, where serving the previous answer for the
 * next twenty seconds would show an account that has just been disconnected.
 */
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
 * A real connected account as a PortfolioSummary row, so it sits in the same
 * list as any other account and no screen needs to know where it came from.
 *
 * dayPct and allTimePct are 0 for the same reason manualPortfolioSummaries()
 * sets them to 0 (lib/holdings.ts): SnapTrade's positions carry no day-change
 * field and no priced history to derive one from. That 0 is a real "no data",
 * not a computed return — the connected-account demo screen is where the
 * per-field truth (including which numbers the brokerage did not report) is
 * shown, and it renders every unknown as "—".
 */
function toPortfolioSummary(account: ConnectedAccount, total: number): PortfolioSummary {
  return {
    id: account.id,
    kind: 'linked',
    name: account.institution ?? account.name ?? 'Connected account',
    broker: account.institution,
    logo: null,
    acct: account.numberMasked ?? '',
    syncedAgo: null,
    total,
    // null, not 0. The brokerage reports no day change and no priced history
    // through this integration, and PortfolioSummary now says so in the type
    // — the screens render null as "—" via pctOrDash, where a 0 rendered as
    // a measured flat day the app never measured.
    dayPct: null,
    allTimePct: null,
  };
}

/**
 * A real position as a Holding row.
 *
 * shares/avgCost/value fall back to 0 only where the Holding type has no way
 * to express "unknown"; the connected-account demo screen reads the
 * ConnectedPosition directly and shows those same fields as "—" when the
 * brokerage did not report them. plPct is derived only when both the open P&L
 * and the cost basis are known and the basis is non-zero.
 */
function toHolding(position: ConnectedAccount['positions'][number]): Holding {
  const units = position.units ?? 0;
  const avgCost = position.avgCost ?? 0;
  // Shared with the connected-account screen so the two can never disagree
  // about the same position — and so the short-position sign fix lives once.
  const plPct = positionReturnPct(position.openPnl, position.units, position.avgCost) ?? 0;
  return {
    ticker: position.ticker,
    shares: units,
    avgCost,
    // null, not 0: Holding.value is nullable now, and a position the
    // brokerage did not price renders as "—" rather than as worthless.
    value: position.marketValue,
    plPct,
    // The brokerage's own cost basis where it reported one, and units × avg
    // cost where it did not — both fall back to 0 above, so this is 0 exactly
    // when there is nothing to state, matching the rest of this mapping.
    costBasis: units * avgCost,
  };
}

/**
 * The portfolio list as the brokerage reports it, with the app's own data as
 * the fallback when nothing is connected — an unlinked user sees the demo
 * portfolios, not an error and not an empty screen.
 */
async function livePortfolios(): Promise<Loadable<PortfolioSummary[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  // The remembered link state was stale — this user has connected nothing
  // (or signed out). Not an error: fall back to the app's own portfolios,
  // which is what someone with no brokerage connection should see.
  if (!result.data.linked) return demoService.portfolios();
  // No account to show: a real, honest empty list. The screens render their
  // genuine empty state rather than an error or a placeholder account. Which
  // KIND of empty this is — nothing connected, or a connection reporting
  // nothing — is the connected-account demo screen's job to explain.
  if (result.data.accounts.length === 0) return ok([]);

  const rows: PortfolioSummary[] = [];
  for (const account of result.data.accounts) {
    const total = accountTotal(account);
    if (total === null) return unavailable(NO_TOTAL);
    rows.push(toPortfolioSummary(account, total));
  }
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

/**
 * The holdings under one portfolio, from the same source and with the same
 * fallback as the list it hangs under.
 */
async function liveHoldings(portfolioId: string): Promise<Loadable<Holding[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  // Same fallback as livePortfolios, and it must be the same: holdings that
  // came from a different source than the portfolio list they hang under
  // would be an empty account beside a full one.
  if (!result.data.linked) return demoService.holdings(portfolioId);
  const accounts =
    portfolioId === AGGREGATE_ID
      ? result.data.accounts
      : result.data.accounts.filter((a) => a.id === portfolioId);
  // An id this source does not know (a manual portfolio, say) gets an empty
  // list, exactly as the demo adapter does — its holdings come from elsewhere.
  return ok(accounts.flatMap((a) => a.positions.map(toHolding)));
}

/**
 * Spread first, then override: every method the flag does not touch stays
 * bound to the demo adapter, so adding a method to DataService cannot
 * accidentally leave it unimplemented here.
 */
export const appService: DataService = {
  ...demoService,
  portfolios: () => (isLinked() ? livePortfolios() : demoService.portfolios()),
  holdings: (portfolioId: string) =>
    isLinked() ? liveHoldings(portfolioId) : demoService.holdings(portfolioId),
};
