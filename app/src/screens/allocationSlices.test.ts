import { describe, expect, it } from 'vitest';
import { allocationSlices } from './Portfolio';
import type { Holding } from '../data/types';

const hold = (ticker: string, value: number): Holding => ({
  ticker,
  shares: 1,
  avgCost: value,
  price: value,
  value,
  pl: 0,
  plPct: 0,
  dayChange: null,
  dayChangePct: null,
  costBasis: value,
});

const PALETTE = ['c1', 'c2', 'c3'];
const sum = (slices: Array<{ pct: number }>) => slices.reduce((n, s) => n + s.pct, 0);

describe('allocationSlices', () => {
  it('names every holding when the palette is wide enough', () => {
    const priced = [hold('A', 50), hold('B', 30), hold('C', 20)];
    const { slices, grouped } = allocationSlices(priced, 100, PALETTE, 'Other');
    expect(slices.map((s) => s.label)).toEqual(['A', 'B', 'C']);
    expect(grouped).toBe(0);
    expect(sum(slices)).toBeCloseTo(100, 9);
  });

  // The bug: the tail was sliced off the ring but left in `total`, so the
  // percentages quietly stopped adding up and holdings vanished unannounced.
  it('still accounts for a hundred percent when the palette runs out', () => {
    const priced = [hold('A', 40), hold('B', 30), hold('C', 20), hold('D', 6), hold('E', 4)];
    const { slices, grouped } = allocationSlices(priced, 100, PALETTE, 'Other');
    expect(sum(slices)).toBeCloseTo(100, 9);
    expect(grouped).toBe(3);
  });

  it('gathers the smallest holdings, keeping the largest named', () => {
    const priced = [hold('A', 40), hold('B', 30), hold('C', 20), hold('D', 6), hold('E', 4)];
    const { slices } = allocationSlices(priced, 100, PALETTE, 'Other');
    expect(slices.map((s) => s.label)).toEqual(['A', 'B', 'Other']);
    // C + D + E = 30, not just the one that happened to fit.
    expect(slices[2].pct).toBeCloseTo(30, 9);
  });

  it('sorts biggest first regardless of the order it is given', () => {
    const { slices } = allocationSlices([hold('S', 10), hold('L', 90)], 100, PALETTE, 'Other');
    expect(slices.map((s) => s.label)).toEqual(['L', 'S']);
  });

  it('gives the gathered slice its own colour, never one already used', () => {
    const priced = [hold('A', 40), hold('B', 30), hold('C', 20), hold('D', 10)];
    const { slices } = allocationSlices(priced, 100, PALETTE, 'Other');
    const colours = slices.map((s) => s.colorVar);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
