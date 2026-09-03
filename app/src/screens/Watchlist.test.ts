import { describe, expect, it } from 'vitest';
import { levelLabel } from './Watchlist';

/**
 * The price field accepts a level the way a person writes one — `readLevel`
 * strips a leading "$" and the commas — and stores it as typed. Both places
 * the watchlist prints a rule used to prepend their own "$", so a level
 * entered as "$1,000" read back as "$$1,000".
 */
describe('levelLabel', () => {
  it('adds the symbol when the stored level has none', () => {
    expect(levelLabel('200')).toBe('$200');
    expect(levelLabel('1,000.50')).toBe('$1,000.50');
  });

  it('does not add a second one when the level was typed with it', () => {
    expect(levelLabel('$1,000')).toBe('$1,000');
    expect(levelLabel('  $200  ')).toBe('$200');
  });
});
