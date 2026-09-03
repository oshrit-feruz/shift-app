import { describe, expect, it } from 'vitest';
import { priceHint } from './AlertSheet';

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
