import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchYourPositions,
  manualPortfolioSummaries,
  mergeManualTransactions,
  portfolioList,
  sumTotals,
} from './holdings';
import type { PortfolioSummary, Quote } from '../data/types';
import { withDemoData } from '../data/demoFlagsStub';
import { demoService } from '../data/demoAdapter';
import type { ManualPortfolio, ManualTransaction } from '../state/appState';

afterEach(() => {
  vi.unstubAllGlobals();
});

const manualPf: ManualPortfolio = { id: 'mine', name: 'My ideas' };
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

  it('reports none when sample data is off', async () => {
    withDemoData(false);
    const res = await fetchYourPositions('NVDA', {}, []);
    expect(res).toEqual({ status: 'ok', data: [] });
  });

  it('still reports the user’s own logged position with sample data off', async () => {
    withDemoData(false);
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
        { ticker: 'ALB', shares: -77, avgCost: 129.53, value: -10454.29, plPct: -4.82, costBasis: -9973.81 },
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

  it('leaves a service-reported holding the user never logged untouched', () => {
    const service = { ticker: 'AAPL', shares: 5, avgCost: 100, value: 900, plPct: -10, costBasis: 500 };
    const rows = mergeManualTransactions([service], [buy('NVDA', 1, 10)], { NVDA: quote(10) });
    expect(rows.find((r) => r.ticker === 'AAPL')).toEqual(service);
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
