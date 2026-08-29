import { afterEach, describe, expect, it, vi } from 'vitest';
import { showcaseHistory, showcaseWeek } from './showcase';
import { fetchTickerEarnings, fetchWeekEarnings } from './earnings';
import { withDemoData } from './demoFlagsStub';

const NOW = new Date('2026-08-28T09:00:00Z'); // a Friday

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('showcaseWeek', () => {
  it('is deterministic — the same figures on every call', () => {
    expect(showcaseWeek(NOW)).toEqual(showcaseWeek(NOW));
  });

  // The whole point of the mode: days already past carry results, which is
  // exactly what the free plan cannot provide.
  it('reports the days already past and leaves the days ahead scheduled', () => {
    const rows = showcaseWeek(NOW).rows;
    const today = '2026-08-28';
    expect(rows.some((r) => r.reportDate < today)).toBe(true);
    for (const r of rows) {
      if (r.reportDate < today) {
        expect(r.actual, r.reportDate).not.toBeNull();
        expect(r.surprisePct, r.reportDate).not.toBeNull();
      } else {
        expect(r.actual, r.reportDate).toBeNull();
      }
    }
  });

  it('covers a Monday-to-Friday spread, sorted by date', () => {
    const dates = showcaseWeek(NOW).rows.map((r) => r.reportDate);
    expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates);
    expect(new Set(dates).size).toBeGreaterThanOrEqual(5);
  });
});

describe('showcaseHistory', () => {
  it('gives twelve reported quarters plus one scheduled', () => {
    const rows = showcaseHistory('NVDA', NOW).rows;
    expect(rows.filter((r) => r.actual !== null)).toHaveLength(12);
    expect(rows.filter((r) => r.actual === null)).toHaveLength(1);
  });

  it('is deterministic and ticker-specific', () => {
    expect(showcaseHistory('NVDA', NOW)).toEqual(showcaseHistory('nvda', NOW));
    expect(showcaseHistory('NVDA', NOW).rows[0].surprisePct).not.toBe(
      showcaseHistory('AAPL', NOW).rows[0].surprisePct,
    );
  });
});

describe('demo mode never leaks into live data', () => {
  it('does not touch the network when the mode is on', async () => {
    withDemoData(true);
    const spy = vi.fn();
    const week = await fetchWeekEarnings(spy as unknown as typeof fetch, NOW);
    const hist = await fetchTickerEarnings('NVDA', spy as unknown as typeof fetch, NOW);
    expect(spy).not.toHaveBeenCalled();
    expect(week.status).toBe('ok');
    expect(hist.status).toBe('ok');
  });

  // The property that matters most: illustrative figures are a deliberate
  // mode, never a soft landing for a failure. An outage stays an outage.
  it('is NOT used as a fallback when the mode is off and the request fails', async () => {
    withDemoData(false);
    const failing = (async () => new Response('nope', { status: 502 })) as unknown as typeof fetch;
    expect((await fetchWeekEarnings(failing, NOW)).status).toBe('unavailable');
    expect((await fetchTickerEarnings('NVDA', failing, NOW)).status).toBe('unavailable');
  });

  it('reads live data when the mode is off', async () => {
    withDemoData(false);
    const spy = vi.fn(async () => new Response(JSON.stringify({ earnings: [] }), { status: 200 }));
    await fetchWeekEarnings(spy as unknown as typeof fetch, NOW);
    expect(spy).toHaveBeenCalledOnce();
  });
});
