import { describe, expect, it } from 'vitest';
import { positionReturnPct } from './format';

/**
 * These numbers are the first real brokerage payload this app ever read
 * (Interactive Brokers, 30 Aug 2026). They are here because the short
 * position in it broke the original formula in a way no synthetic fixture
 * had caught: every test position until then was long.
 */
const ALB_SHORT = { units: -77, avgCost: 129.52753247, openPnl: -480.6699998099999 };
const ORCL_LONG = { units: 33, avgCost: 183.07575758, openPnl: -1027.48 };

describe('positionReturnPct', () => {
  it('reports a losing SHORT as a loss', () => {
    // The bug: units are negative, so units × avgCost is negative, and a
    // negative P&L divided by it comes out POSITIVE. This position is down
    // $480.67 and used to render as +4.82%.
    const pct = positionReturnPct(ALB_SHORT.openPnl, ALB_SHORT.units, ALB_SHORT.avgCost);
    expect(pct).toBeLessThan(0);
    expect(pct).toBeCloseTo(-4.82, 2);
  });

  it('reports a winning short as a gain', () => {
    // Short 77 at 129.53, price falls, P&L positive.
    expect(positionReturnPct(500, -77, 129.52753247)).toBeGreaterThan(0);
  });

  it('is unchanged for long positions', () => {
    expect(positionReturnPct(ORCL_LONG.openPnl, ORCL_LONG.units, ORCL_LONG.avgCost)).toBeCloseTo(-17.01, 2);
    expect(positionReturnPct(500, 33, 183.07575758)).toBeCloseTo(8.28, 2);
  });

  it('returns null rather than 0% when anything needed is missing', () => {
    expect(positionReturnPct(null, 10, 5)).toBeNull();
    expect(positionReturnPct(100, null, 5)).toBeNull();
    expect(positionReturnPct(100, 10, null)).toBeNull();
  });

  it('returns null on a zero cost basis instead of dividing by zero', () => {
    expect(positionReturnPct(100, 0, 5)).toBeNull();
    expect(positionReturnPct(100, 10, 0)).toBeNull();
  });
});
