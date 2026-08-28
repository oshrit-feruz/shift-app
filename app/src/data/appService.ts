/**
 * The DataService the screens actually read.
 *
 * By default it *is* the demo adapter — every method delegates straight
 * through, so with the founder-demo switch off the app behaves exactly as it
 * did before this file existed.
 *
 * With Settings → "הדגמה: חשבון מקושר אמיתי" on, two methods change source:
 * portfolios() and holdings() stop returning the demo adapter's invented
 * accounts and return the one REAL brokerage account read through SnapTrade
 * Personal instead (data/snaptradeAccount.ts). Everything else — symbols,
 * satellite signals, news, earnings, chart series — is untouched by the flag
 * and keeps its existing source.
 *
 * This is a founder-demo capability, not the architecture for end users: see
 * data/snaptradeAccount.ts and the README.
 *
 * DATA HONESTY: when the flag is on and the SnapTrade call fails, these
 * methods return 'unavailable'. They never silently fall back to the demo
 * numbers — a screen promising a real account must not quietly show an
 * invented one.
 */

import { demoService, DEMO_FLAGS } from './demoAdapter';
import { fetchConnectedAccounts } from './snaptradeAccount';
import type { DataService } from './service';
import {
  ok,
  unavailable,
  type ConnectedAccount,
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
let cache: { at: number; promise: Promise<Loadable<ConnectedAccount[]>> } | null = null;

function connectedAccounts(): Promise<Loadable<ConnectedAccount[]>> {
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

/** Drops the cache so the next read goes back to SnapTrade — used when the flag flips. */
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
    dayPct: 0,
    allTimePct: 0,
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
  const basis = units * avgCost;
  const plPct = position.openPnl !== null && basis !== 0 ? (position.openPnl / basis) * 100 : 0;
  return {
    ticker: position.ticker,
    shares: units,
    avgCost,
    value: position.marketValue ?? 0,
    plPct,
  };
}

async function livePortfolios(): Promise<Loadable<PortfolioSummary[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  // No brokerage linked yet: a real, honest empty list. The screens render
  // their genuine empty state rather than an error or a placeholder account.
  if (result.data.length === 0) return ok([]);

  const rows: PortfolioSummary[] = [];
  for (const account of result.data) {
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
    total: rows.reduce((sum, r) => sum + r.total, 0),
    dayPct: 0,
    allTimePct: 0,
  };
  return ok([aggregate, ...rows]);
}

async function liveHoldings(portfolioId: string): Promise<Loadable<Holding[]>> {
  const result = await connectedAccounts();
  if (result.status !== 'ok') return result;
  const accounts =
    portfolioId === AGGREGATE_ID ? result.data : result.data.filter((a) => a.id === portfolioId);
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
  portfolios: () => (DEMO_FLAGS.liveAccount ? livePortfolios() : demoService.portfolios()),
  holdings: (portfolioId: string) =>
    DEMO_FLAGS.liveAccount ? liveHoldings(portfolioId) : demoService.holdings(portfolioId),
};
