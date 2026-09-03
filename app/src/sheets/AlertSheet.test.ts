import { describe, expect, it } from 'vitest';
import { defaultLevel, priceHint, readableLevel } from './AlertSheet';

/**
 * The line under the price field used to say "about 9.6% above today's
 * price" no matter what was typed. Now it is computed from the live quote,
 * and disappears when there is no quote to compute from.
 */
describe('priceHint', () => {
  it('measures the typed level against the live price', () => {
    expect(priceHint('220', 200)).toEqual({ above: true, pct: '10.0' });
    expect(priceHint('$1,900', 2000)).toEqual({ above: false, pct: '5.0' });
    expect(priceHint('200', 200)).toEqual({ above: true, pct: '0.0' });
  });

  it('shows nothing without a price or a readable level', () => {
    expect(priceHint('220', null)).toBeNull();
    expect(priceHint('220', 0)).toBeNull();
    expect(priceHint('', 200)).toBeNull();
    expect(priceHint('soon', 200)).toBeNull();
  });
});

describe('defaultLevel', () => {
  it('opens the field at the live price, to the cent, and empty without one', () => {
    expect(defaultLevel(166.431)).toBe('166.43');
    expect(defaultLevel(30)).toBe('30.00');
    expect(defaultLevel(null)).toBe('');
    expect(defaultLevel(0)).toBe('');
  });
});

describe('readableLevel', () => {
  it('accepts what the engine reads and refuses the rest', () => {
    expect(readableLevel('200')).toBe(true);
    expect(readableLevel('$1,250.50')).toBe(true);
    expect(readableLevel('')).toBe(false);
    expect(readableLevel('0')).toBe(false);
    expect(readableLevel('soon')).toBe(false);
  });
});
