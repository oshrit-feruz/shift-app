import { describe, expect, it } from 'vitest';
import { didCross, sideFor } from './priceAlerts';

describe('sideFor', () => {
  it('is "above" at or above the threshold, "below" under it', () => {
    expect(sideFor(100, 100)).toBe('above');
    expect(sideFor(100.01, 100)).toBe('above');
    expect(sideFor(99.99, 100)).toBe('below');
  });
});

describe('didCross', () => {
  it('never fires on the first price seen (prevSide null)', () => {
    expect(didCross(null, 'above', 'rise')).toBe(false);
    expect(didCross(null, 'below', 'fall')).toBe(false);
  });

  it('never fires while the side is unchanged', () => {
    expect(didCross('above', 'above', 'rise')).toBe(false);
    expect(didCross('below', 'below', 'fall')).toBe(false);
  });

  it('fires a rise alert only on below -> above', () => {
    expect(didCross('below', 'above', 'rise')).toBe(true);
    expect(didCross('above', 'below', 'rise')).toBe(false);
  });

  it('fires a fall alert only on above -> below', () => {
    expect(didCross('above', 'below', 'fall')).toBe(true);
    expect(didCross('below', 'above', 'fall')).toBe(false);
  });

  it('does not re-fire on every tick while the price stays past the threshold', () => {
    // Simulates: price crosses once, then keeps ticking on the same side.
    let side: 'above' | 'below' | null = null;
    let fires = 0;
    for (const s of ['below', 'below', 'above', 'above', 'above'] as const) {
      if (didCross(side, s, 'rise')) fires++;
      side = s;
    }
    expect(fires).toBe(1);
  });

  it('catches a below -> above -> below sequence even when only processed in order (regression: a coalesced "latest price only" snapshot would collapse this to a single "below" and miss the rise crossing entirely)', () => {
    let side: 'above' | 'below' | null = null;
    let riseFires = 0;
    for (const s of ['below', 'above', 'below'] as const) {
      if (didCross(side, s, 'rise')) riseFires++;
      side = s;
    }
    expect(riseFires).toBe(1);
  });
});
