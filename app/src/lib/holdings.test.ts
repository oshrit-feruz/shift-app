import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dayMove,
  fetchPortfolioHoldings,
  fetchYourPositions,
  manualPortfolioSummaries,
  mergeManualTransactions,
  portfolioList,
  summarizeHoldings,
  sumTotals,
} from './holdings';
import type { Holding, PortfolioSummary, Quote } from '../data/types';
import { withDemoData } from '../data/demoFlagsStub';
import { demoService } from '../data/demoAdapter';
import { appService } from '../data/appService';
import { clearLinked, setLinked } from '../data/linkState';
import type { ManualPortfolio, ManualTransaction } from '../state/appState';

afterEach(() => {
  vi.unstubAllGlobals();
});

const manualPf: ManualPortfolio = { id: 'mine', name: 'My ideas' };

/**
 * With sample data off the accounts come from /api/snaptrade, so a test in
 * that state has to say what SnapTrade answers. This is the honest empty
 * answer: nothing linked. The quote route is answered empty too, so a logged
 * position is unpriced rather than the read failing.
 */
function withNoConnectedAccount(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.startsWith('/api/snaptrade') ? { accounts: [], connections: [] } : { quotes: {} };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}
const buy = (ticker: string, shares: number, price: number): ManualTransaction => ({
  id: `tx-${ticker}`,
  side: 'buy',
  ticker,
  shares,
  price,
  date: '2026-08-20',
});

describe('portfolioList', () => {
  // Guards a real crash: the Portfolio screen indexes this list with
  // Math.min(pfIndex, length - 1), which reads list[-1] when it is empty.
  it('is empty when there are no service rows and no manual ones', () => {
    expect(portfolioList([], [])).toEqual([]);
  });

  it('carries the user’s own portfolios when the service reports none', () => {
    const list = portfolioList([], [manualPf]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('mine');
    expect(list[0].kind).toBe('manual');
    // Not the starting cash: what a manual portfolio is worth is its own
    // positions valued at live prices, which this list has no access to, and
    // the cash it was opened with is not its value.
    expect(list[0].total).toBeNull();
  });
});

describe('manualPortfolioSummaries', () => {
  it('reports no day change rather than a computed zero', () => {
    const [row] = manualPortfolioSummaries([manualPf]);
    // null, not 0. A hand-kept ledger has no priced history behind it, and a
    // zero renders as a measured flat day the app never measured.
    expect(row.dayPct).toBeNull();
    expect(row.allTimePct).toBeNull();
    expect(row.broker).toBeNull();
  });
});

// The gate that matters: fabricated positions are the demo portfolios', and
// they must not reach the stock page with sample data off. Equally, the
// user's own logged transactions must survive it — they are their real data.
describe('fetchYourPositions respects the sample-data switch', () => {
  it('reports the demo positions when sample data is on', async () => {
    withDemoData(true);
    const res = await fetchYourPositions('NVDA', {}, []);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.length).toBeGreaterThan(0);
  });

  it('reports none when sample data is off and no account is connected', async () => {
    withDemoData(false);
    withNoConnectedAccount();
    const res = await fetchYourPositions('NVDA', {}, []);
    expect(res).toEqual({ status: 'ok', data: [] });
  });

  it('still reports the user’s own logged position with sample data off', async () => {
    withDemoData(false);
    withNoConnectedAccount();
    const res = await fetchYourPositions('NVDA', { mine: [buy('NVDA', 3, 100)] }, [manualPf]);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].portfolio.id).toBe('mine');
    expect(res.data[0].holding.shares).toBe(3);
    // Their own price, not a demo one.
    expect(res.data[0].holding.avgCost).toBe(100);
  });

  it('does not invent a position in a ticker the user never logged', async () => {
    withDemoData(false);
    withNoConnectedAccount();
    const res = await fetchYourPositions('AMD', { mine: [buy('NVDA', 3, 100)] }, [manualPf]);
    expect(res).toEqual({ status: 'ok', data: [] });
  });

  it('finds a SHORT position rather than treating it as no position', async () => {
    // The lookup used to require `shares > 0`, so a short — a real holding
    // with a negative share count — was invisible on its own stock page. The
    // first live brokerage account read held 77 ALB short.
    const portfoliosSpy = vi.spyOn(demoService, 'portfolios').mockResolvedValue({
      status: 'ok',
      data: [
        {
          id: 'ibkr',
          kind: 'linked',
          name: 'Interactive Brokers',
          broker: 'Interactive Brokers',
          logo: null,
          acct: '••6048',
          syncedAgo: null,
          total: 22064.94,
          dayPct: null,
          allTimePct: null,
        } as PortfolioSummary,
      ],
    });
    const holdingsSpy = vi.spyOn(demoService, 'holdings').mockResolvedValue({
      status: 'ok',
      data: [
        {
          ticker: 'ALB',
          shares: -77,
          avgCost: 129.53,
          price: 135.77,
          value: -10454.29,
          pl: -480.67,
          plPct: -4.82,
          dayChange: null,
          dayChangePct: null,
          costBasis: -9973.81,
        },
      ],
    });
    withDemoData(true);

    try {
      const res = await fetchYourPositions('ALB', {}, []);
      expect(res.status).toBe('ok');
      if (res.status !== 'ok') return;
      expect(res.data).toHaveLength(1);
      expect(res.data[0].holding.shares).toBe(-77);
    } finally {
      // This suite's afterEach only unstubs globals, so a spy left in place
      // would follow the module into the next test — which is exactly what
      // it did the first time this was written.
      portfoliosSpy.mockRestore();
      holdingsSpy.mockRestore();
    }
  });
});

// The demo Sandbox is gone: it was a hard-coded 'manual' portfolio served the
// same invented six-position table as the brokers, so a user who had never
// recorded a trade still opened it on $9,840 of holdings that were not theirs.
// Manual portfolios are the user's own ledger and take nothing from that table.
describe('fetchPortfolioHoldings picks its source by switch, then by connection', () => {
  // Two rules in one place, and the order between them matters:
  //  - sample data on  → the demo adapter, connected or not. The switch is
  //    what makes the app safe to show to a room, so it wins.
  //  - sample data off → the connected account, whose positions used to be
  //    ignored here while the allocation ring beside them read appService.
  //    One card, one account, two sources.
  afterEach(() => {
    clearLinked();
    vi.restoreAllMocks();
  });

  const live = [
    {
      ticker: 'ORCL',
      name: 'Oracle',
      shares: 12,
      avgCost: 140,
      price: 150,
      value: 1800,
      pl: 120,
      plPct: 7.1,
      // The brokerage snapshot has no day of its own; the live quote supplies
      // it where these rows are merged.
      dayChange: null,
      dayChangePct: null,
      costBasis: 1680,
    },
  ];

  it('reads the linked account when sample data is off', async () => {
    withDemoData(false);
    setLinked(true, 'user-1');
    const spy = vi.spyOn(appService, 'holdings').mockResolvedValue({ status: 'ok', data: live });

    const res = await fetchPortfolioHoldings('acc-1', []);

    expect(spy).toHaveBeenCalledWith('acc-1');
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.rows.map((r) => r.ticker)).toEqual(['ORCL']);
  });

  it('leaves the connected account unread while sample data is on', async () => {
    // Not a privacy nicety — it is the whole point of the switch. Someone
    // presenting the app has flipped it precisely so their own positions do
    // not appear, and a connection they made earlier must not defeat that.
    withDemoData(true);
    setLinked(true, 'user-1');
    const liveSpy = vi.spyOn(appService, 'holdings');
    const demoSpy = vi.spyOn(demoService, 'holdings').mockResolvedValue({ status: 'ok', data: [] });

    await fetchPortfolioHoldings('blink', []);

    expect(liveSpy).not.toHaveBeenCalled();
    expect(demoSpy).toHaveBeenCalledWith('blink');
  });

  it('reads neither with sample data off and nothing connected', async () => {
    withDemoData(false);
    clearLinked();
    const demoSpy = vi.spyOn(demoService, 'holdings');

    const res = await fetchPortfolioHoldings('blink', []);

    expect(demoSpy).not.toHaveBeenCalled();
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.rows).toEqual([]);
  });
});

describe('the fabricated holdings table is the demo brokers’ alone', () => {
  it('reports no demo Sandbox portfolio, even with sample data on', async () => {
    withDemoData(true);
    const res = await demoService.portfolios();
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.some((pf) => pf.id === 'sandbox')).toBe(false);
    expect(res.data.every((pf) => pf.kind !== 'manual')).toBe(true);
  });

  it('serves no holdings for a manual portfolio, even with sample data on', async () => {
    withDemoData(true);
    await expect(demoService.holdings('mine')).resolves.toEqual({ status: 'ok', data: [] });
  });

  it('still serves the demo brokers their positions', async () => {
    withDemoData(true);
    const res = await demoService.holdings('blink');
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.length).toBeGreaterThan(0);
  });

  // With sample data on, the user's own portfolio must still show only what
  // they logged — the demo table must not leak in beside it.
  it('gives a manual portfolio only the user’s own transactions in demo mode', async () => {
    withDemoData(true);
    const res = await fetchYourPositions('NVDA', { mine: [buy('NVDA', 3, 100)] }, [manualPf]);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    const mine = res.data.filter((x) => x.portfolio.id === 'mine');
    expect(mine).toHaveLength(1);
    expect(mine[0].holding.shares).toBe(3);
    expect(mine[0].holding.avgCost).toBe(100);
  });
});

const summary = (id: string, total: number | null): PortfolioSummary => ({
  id,
  kind: 'linked',
  name: id,
  broker: id,
  logo: null,
  acct: '',
  syncedAgo: null,
  total,
  dayPct: 0,
  allTimePct: 0,
});

describe('sumTotals', () => {
  it('adds the accounts it was given', () => {
    expect(sumTotals([summary('a', 100), summary('b', 50)])).toBe(150);
  });

  it('is null when any account’s own total is unknown', () => {
    // Not 100. A sum that drops the account it could not read is not a
    // smaller total, it is a wrong one — and wrong low, which flatters.
    expect(sumTotals([summary('a', 100), summary('b', null)])).toBeNull();
  });

  it('is 0 for no accounts at all, which is a real answer', () => {
    expect(sumTotals([])).toBe(0);
  });
});

describe('mergeManualTransactions', () => {
  const quote = (price: number): Quote => ({
    price,
    change: 0,
    changePct: 0,
    prevClose: price,
    dayHigh: price,
    dayLow: price,
    open: price,
    asOf: '2026-08-31T13:00:00.000Z',
  });

  it('values the user’s own position at the live price, not at cost', () => {
    const [row] = mergeManualTransactions([], [buy('NVDA', 10, 100)], { NVDA: quote(150) });
    expect(row.value).toBe(1500);
    expect(row.avgCost).toBe(100);
    expect(row.plPct).toBeCloseTo(50, 6);
  });

  it('reports "no value" rather than the old green +0.00% when unpriced', () => {
    const [row] = mergeManualTransactions([], [buy('NVDA', 10, 100)], {});
    expect(row.value).toBeNull();
    expect(row.plPct).toBeNull();
  });

  const service: Holding = {
    ticker: 'AAPL',
    shares: 5,
    avgCost: 100,
    price: 180,
    value: 900,
    pl: 400,
    plPct: 80,
    dayChange: null,
    dayChangePct: null,
    costBasis: 500,
  };

  it('leaves a service-reported holding the user never logged untouched', () => {
    const rows = mergeManualTransactions([service], [buy('NVDA', 1, 10)], { NVDA: quote(10) });
    expect(rows.find((r) => r.ticker === 'AAPL')).toEqual(service);
  });

  it('attaches today’s move to a service-reported holding from the live quote', () => {
    // The brokerage values the row; the quote says what it did today. The
    // valuation is left alone — only the one figure neither source carried.
    const rows = mergeManualTransactions([service], [], {
      AAPL: { ...quote(182), change: 2, changePct: 1.1 },
    });
    const aapl = rows.find((r) => r.ticker === 'AAPL')!;
    expect(aapl.value).toBe(900);
    expect(aapl.dayChange).toBe(10);
    // Against the previous close (5 × 182), not the brokerage value.
    expect(aapl.dayChangePct).toBeCloseTo((10 / 910) * 100, 6);
  });

  it('carries the return in currency beside the percentage, on the same terms', () => {
    const [row] = mergeManualTransactions([], [buy('NVDA', 10, 100)], { NVDA: quote(150) });
    expect(row.pl).toBe(500);
    expect(row.price).toBe(150);
  });

  it('keeps a sold-out position, with no shares left', () => {
    const rows = mergeManualTransactions(
      [],
      [buy('NVDA', 10, 100), { ...buy('NVDA', 10, 130), id: 'tx-sell', side: 'sell' }],
      { NVDA: quote(150) },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].shares).toBe(0);
  });
});

describe('dayMove', () => {
  const q: Quote = {
    price: 102,
    change: 2,
    changePct: 2,
    prevClose: 100,
    dayHigh: 103,
    dayLow: 99,
    open: 100,
    asOf: '2026-09-03T14:00:00.000Z',
  };

  it('is shares × change, as a percent of the previous close’s worth', () => {
    expect(dayMove(10, q)).toEqual({ dayChange: 20, dayChangePct: 2 });
  });

  it('keeps the sign right for a short: a rising price is a loss', () => {
    // −10 × +2 = −20 on a base of |−10 × 100| = 1000. Dividing by the signed
    // base would flip it back to a gain.
    expect(dayMove(-10, q)).toEqual({ dayChange: -20, dayChangePct: -2 });
  });

  it('is unknown, not flat, without a quote or without shares', () => {
    expect(dayMove(10, undefined)).toEqual({ dayChange: null, dayChangePct: null });
    expect(dayMove(0, q)).toEqual({ dayChange: null, dayChangePct: null });
  });
});

describe('summarizeHoldings', () => {
  const row = (over: Partial<Holding>): Holding => ({
    ticker: 'X',
    shares: 10,
    avgCost: 100,
    price: 110,
    value: 1100,
    pl: 100,
    plPct: 10,
    dayChange: 10,
    dayChangePct: 1,
    costBasis: 1000,
    ...over,
  });

  it('adds up the open positions', () => {
    const s = summarizeHoldings([
      row({ ticker: 'A' }),
      row({ ticker: 'B', value: 2200, pl: 200, plPct: 20, dayChange: 22, dayChangePct: 1 }),
    ]);
    expect(s.value).toBe(3300);
    expect(s.cost).toBe(2000);
    expect(s.pl).toBe(300);
    expect(s.plPct).toBeCloseTo(15, 6);
    expect(s.dayChange).toBe(32);
    // Yesterday's worth leg by leg: 10/0.01 + 22/0.01 = 3200.
    expect(s.dayChangePct).toBeCloseTo(1, 6);
  });

  it('is unknown the moment one open leg is unpriced — never a smaller total', () => {
    const s = summarizeHoldings([
      row({ ticker: 'A' }),
      row({ ticker: 'B', value: null, pl: null, plPct: null, dayChange: null, dayChangePct: null }),
    ]);
    expect(s.value).toBeNull();
    expect(s.pl).toBeNull();
    expect(s.dayChange).toBeNull();
    expect(s.dayChangePct).toBeNull();
    // What was paid is never unknown.
    expect(s.cost).toBe(2000);
  });

  it('counts what a closed position booked, and nothing else from it', () => {
    const closed = row({
      ticker: 'C',
      shares: 0,
      value: 0,
      pl: 50,
      plPct: 5,
      dayChange: null,
      dayChangePct: null,
      costBasis: 0,
    });
    const s = summarizeHoldings([row({ ticker: 'A' }), closed]);
    expect(s.pl).toBe(150);
    expect(s.value).toBe(1100);
    expect(s.dayChange).toBe(10);
  });

  // A short's cost basis is negative — money received — so a signed sum nets
  // it against the longs. That left a short-only portfolio with a negative
  // denominator (plPct null, though the return is known) and a mixed one with
  // a base smaller than what was committed, overstating the percentage.
  it('measures the return against an absolute cost base, so a short-only portfolio has one', () => {
    const s = summarizeHoldings([
      row({ ticker: 'ALB', shares: -10, avgCost: 100, price: 90, value: -900, costBasis: -1000, pl: 100 }),
    ]);
    expect(s.cost).toBe(1000);
    expect(s.plPct).toBeCloseTo(10, 6);
  });

  it('does not let a short cancel a long out of the denominator', () => {
    const s = summarizeHoldings([
      row({ ticker: 'A', costBasis: 1000, pl: 100 }),
      row({ ticker: 'B', shares: -10, avgCost: 100, price: 90, value: -900, costBasis: -1000, pl: 100 }),
    ]);
    // Signed, the base would have been 0 and the percentage unreportable on
    // 2,000 of committed money.
    expect(s.cost).toBe(2000);
    expect(s.plPct).toBeCloseTo(10, 6);
  });

  it('has no percentages over nothing', () => {
    const s = summarizeHoldings([]);
    expect(s).toEqual({ value: 0, cost: 0, pl: 0, plPct: null, dayChange: 0, dayChangePct: null });
  });
});
