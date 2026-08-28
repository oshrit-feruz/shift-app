import { describe, expect, it } from 'vitest';
import { compactMoney, isoDate } from './format';

describe('compactMoney', () => {
  it('compacts at each scale, keeping one decimal', () => {
    // Real figures from the engine's fundamentals route.
    expect(compactMoney(215938000000)).toBe('$215.9B');
    expect(compactMoney(67357000000)).toBe('$67.4B');
    expect(compactMoney(5480717000)).toBe('$5.5B');
    expect(compactMoney(45183036000)).toBe('$45.2B');
    expect(compactMoney(2_400_000)).toBe('$2.4M');
    expect(compactMoney(812_000)).toBe('$812.0K');
    expect(compactMoney(1.4e12)).toBe('$1.4T');
  });

  it('keeps the decimal that distinguishes neighbouring figures', () => {
    // Rounding these to "$5B" would throw away a difference that matters at
    // this size, which is the whole reason for the fixed decimal.
    expect(compactMoney(5.4e9)).not.toBe(compactMoney(5.5e9));
  });

  it('promotes a mantissa that rounds up across a suffix boundary', () => {
    // 999,999 / 1e3 is 999.999, which .toFixed(1) renders as "1000.0" — so
    // this used to read "$1000.0K" instead of "$1.0M".
    expect(compactMoney(999_999)).toBe('$1.0M');
    expect(compactMoney(999_999_999)).toBe('$1.0B');
    expect(compactMoney(999_999_999_999)).toBe('$1.0T');
    // Values that do not cross the boundary are untouched.
    expect(compactMoney(999_949)).toBe('$999.9K');
    expect(compactMoney(1_000)).toBe('$1.0K');
    expect(compactMoney(-999_999)).toBe('−$1.0M');
  });

  it('returns the plain figure below 1,000', () => {
    expect(compactMoney(999)).toBe('$999');
    expect(compactMoney(0)).toBe('$0');
  });

  it('signs negatives with a real minus, and refuses non-finite values', () => {
    expect(compactMoney(-2.5e9)).toBe('−$2.5B');
    expect(compactMoney(NaN)).toBe('—');
    expect(compactMoney(Infinity)).toBe('—');
  });
});

describe('isoDate', () => {
  it('formats a bare date in UTC, so it does not shift a day west of UTC', () => {
    // Parsed locally, "2026-02-25" becomes the 24th for anyone behind UTC —
    // which would misreport when a filing was actually filed.
    expect(isoDate('2026-02-25', 'en')).toBe('Feb 25, 2026');
    expect(isoDate('2026-01-01', 'en')).toBe('Jan 1, 2026');
    expect(isoDate('2026-12-31', 'en')).toBe('Dec 31, 2026');
  });

  it('renders Hebrew in the Hebrew locale', () => {
    const he = isoDate('2026-02-25', 'he');
    expect(he).toBeTruthy();
    expect(he).not.toBe('2026-02-25');
  });

  it('returns an impossible date unchanged rather than rolling it forward', () => {
    // Date.UTC would silently turn this into 2 March and it would read as a
    // real filing date — the same trap snapshotAgeDays guards against.
    expect(isoDate('2026-02-31', 'en')).toBe('2026-02-31');
    expect(isoDate('2026-13-45', 'en')).toBe('2026-13-45');
    expect(isoDate('2026-00-10', 'en')).toBe('2026-00-10');
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(isoDate('2028-02-29', 'en')).toBe('Feb 29, 2028');
    expect(isoDate('2026-02-29', 'en')).toBe('2026-02-29');
  });

  it('passes through anything that is not a bare date, and dashes a null', () => {
    expect(isoDate(null, 'en')).toBe('—');
    expect(isoDate('', 'en')).toBe('—');
    expect(isoDate('sometime', 'en')).toBe('sometime');
  });
});
