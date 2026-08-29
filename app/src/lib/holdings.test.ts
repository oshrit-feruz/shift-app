import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYourPositions, manualPortfolioSummaries, portfolioList } from './holdings';
import { withDemoData } from '../data/demoFlagsStub';
import type { ManualPortfolio, ManualTransaction } from '../state/appState';

afterEach(() => {
  vi.unstubAllGlobals();
});

const manualPf: ManualPortfolio = { id: 'mine', name: 'My ideas', startingCash: 5000 };
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
    expect(list[0].total).toBe(5000);
  });
});

describe('manualPortfolioSummaries', () => {
  it('reports no day change rather than a computed zero', () => {
    const [row] = manualPortfolioSummaries([manualPf]);
    expect(row.dayPct).toBe(0);
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
});
