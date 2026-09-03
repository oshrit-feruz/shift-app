import { describe, expect, it } from 'vitest';
import { liveAccountIndex } from './appService';

/**
 * The ordering rule livePortfolios() applies, asserted where the screens
 * depend on it: tapping an account has to open THAT account, and the only
 * thing standing between the two is this index.
 */
describe('liveAccountIndex', () => {
  it('is 0 for a lone account — one account gets no aggregate above it', () => {
    expect(liveAccountIndex(['a'], 'a')).toBe(0);
  });

  it('leaves room for the aggregate once there is more than one account', () => {
    expect(liveAccountIndex(['a', 'b', 'c'], 'a')).toBe(1);
    expect(liveAccountIndex(['a', 'b', 'c'], 'c')).toBe(3);
  });

  // -1 rather than 0: a caller that cannot place an account should leave the
  // selection where it is, not move it to whichever portfolio is first.
  it('is -1 for an account that is not in the list', () => {
    expect(liveAccountIndex(['a', 'b'], 'zz')).toBe(-1);
    expect(liveAccountIndex([], 'a')).toBe(-1);
  });
});
