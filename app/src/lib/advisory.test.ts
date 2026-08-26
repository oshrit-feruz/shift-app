import { describe, expect, it } from 'vitest';
import { hardRule, mapProfile, PROFILES, type Answer } from './advisory';
import { money, pct, signedMoney } from './format';

const all: Answer[] = [1, 2, 3];

describe('advisory profile mapping', () => {
  it('is incomplete until all four answers are given', () => {
    expect(mapProfile([])).toBeNull();
    expect(mapProfile([3, 3, 3])).toBeNull();
  });

  it('same answers always give the same profile (deterministic)', () => {
    for (const a of all)
      for (const b of all)
        for (const c of all)
          for (const d of all) {
            const ans: Answer[] = [a, b, c, d];
            expect(mapProfile(ans)).toBe(mapProfile([...ans]));
          }
  });

  it('HARD RULE: horizon under 2 years always maps to Conservative', () => {
    for (const b of all)
      for (const c of all)
        for (const d of all) {
          expect(mapProfile([1, b, c, d])).toBe('cons');
        }
  });

  it('HARD RULE: no safety net always maps to Conservative', () => {
    for (const a of all)
      for (const b of all)
        for (const c of all) {
          expect(mapProfile([a, b, c, 1])).toBe('cons');
        }
  });

  it('score bands: <=7 cons, 8-10 bal, >=11 growth (outside hard rule)', () => {
    // sums avoid the hard rule (no 1 in q1/q4)
    expect(mapProfile([2, 1, 2, 2])).toBe('cons'); // 7
    expect(mapProfile([2, 2, 2, 2])).toBe('bal'); // 8
    expect(mapProfile([2, 3, 3, 2])).toBe('bal'); // 10
    expect(mapProfile([3, 3, 2, 3])).toBe('growth'); // 11
    expect(mapProfile([3, 3, 3, 3])).toBe('growth'); // 12
  });

  it('hardRule flags exactly q1=1 or q4=1', () => {
    expect(hardRule([1, 3, 3, 3])).toBe(true);
    expect(hardRule([3, 3, 3, 1])).toBe(true);
    expect(hardRule([2, 1, 1, 2])).toBe(false);
    expect(hardRule([2, 3, 3])).toBe(false); // incomplete
  });

  it('satellite sleeve stays within the published 15% cap', () => {
    for (const p of Object.values(PROFILES)) {
      expect(p.satellitePct).toBeGreaterThanOrEqual(0);
      expect(p.satellitePct).toBeLessThanOrEqual(15);
      const coreSum = p.core.reduce((a, c) => a + c.pct, 0);
      expect(coreSum + p.satellitePct).toBeLessThanOrEqual(100);
    }
  });

  it('Conservative has no satellite sleeve', () => {
    expect(PROFILES.cons.satellitePct).toBe(0);
  });
});

describe('formatters', () => {
  it('money', () => {
    expect(money(48214.6)).toBe('$48,214.60');
    expect(money(1000, 0)).toBe('$1,000');
  });
  it('pct is signed', () => {
    expect(pct(0.86)).toBe('+0.86%');
    expect(pct(-1.24)).toBe('-1.24%');
  });
  it('signedMoney', () => {
    expect(signedMoney(412.18)).toBe('+412.18');
    expect(signedMoney(-3.5)).toBe('-3.50');
  });
});
