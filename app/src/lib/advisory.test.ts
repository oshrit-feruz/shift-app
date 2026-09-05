import { describe, expect, it } from 'vitest';
import {
  CORE_FUNDS,
  decisiveAnswer,
  hardRule,
  mapProfile,
  PROFILES,
  sizeRadar,
  type Answer,
} from './advisory';
import { money, pct, signedMoney } from './format';

const all: Answer[] = [1, 2, 3];

describe('sizeRadar — the engine’s slice per name, the rest in the core', () => {
  const policy = { sleevePctOfBudget: 10, maxSleeves: 10 };

  it('gives each actionable name a fixed slice and parks the remainder', () => {
    expect(sizeRadar(10_000, 2, policy)).toEqual({
      perName: 1_000,
      names: 2,
      overflow: 0,
      inStocks: 2_000,
      parked: 8_000,
    });
  });

  it('one name does NOT get the whole sleeve (the old even split did that)', () => {
    expect(sizeRadar(10_000, 1, policy)?.perName).toBe(1_000);
    expect(sizeRadar(10_000, 1, policy)?.parked).toBe(9_000);
  });

  it('with no actionable name everything stays in the core', () => {
    expect(sizeRadar(10_000, 0, policy)).toEqual({
      perName: 1_000,
      names: 0,
      overflow: 0,
      inStocks: 0,
      parked: 10_000,
    });
  });

  it('caps the number of names and never exceeds the budget', () => {
    const s = sizeRadar(10_000, 14, policy)!;
    expect(s.names).toBe(10);
    expect(s.overflow).toBe(4);
    expect(s.inStocks).toBe(10_000);
    expect(s.parked).toBe(0);
  });

  it('is null without a policy or a positive budget — nothing is sized from a guess', () => {
    expect(sizeRadar(10_000, 2, null)).toBeNull();
    expect(sizeRadar(0, 2, policy)).toBeNull();
    expect(sizeRadar(Number.NaN, 2, policy)).toBeNull();
  });
});

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

  it('does not recommend an unapproved fund for global government bonds', () => {
    expect(CORE_FUNDS.globalGovBonds).toBeUndefined();
    expect(Object.values(CORE_FUNDS).join(' ')).not.toContain('VEA');
  });
});

describe('why this profile — which answer the screen is allowed to blame', () => {
  it('names the horizon when it is under two years', () => {
    for (const b of all)
      for (const c of all) for (const d of all) expect(decisiveAnswer([1, b, c, d])).toBe(0);
  });

  it('names the safety net when there is none', () => {
    // Only where the horizon did not already decide it — see the tie case.
    for (const a of [2, 3] as Answer[])
      for (const b of all) for (const c of all) expect(decisiveAnswer([a, b, c, 1])).toBe(3);
  });

  it('names the horizon when both hard conditions hold at once', () => {
    expect(decisiveAnswer([1, 2, 2, 1])).toBe(0);
  });

  it('names NOTHING whenever the sum decided it', () => {
    // The property that matters. Every combination that is not the hard rule
    // is a sum of four against two thresholds, and no single answer caused it
    // — so the screen must list all four rather than pick one to blame.
    for (const a of [2, 3] as Answer[])
      for (const b of all)
        for (const c of all)
          for (const d of [2, 3] as Answer[]) {
            expect(decisiveAnswer([a, b, c, d])).toBeNull();
            expect(hardRule([a, b, c, d])).toBe(false);
          }
  });

  it('agrees with hardRule on every one of the 81 combinations', () => {
    // Stated as an equivalence rather than trusted: if these ever drift, the
    // screen explains one rule while the allocation follows another, and both
    // look correct on their own.
    for (const a of all)
      for (const b of all)
        for (const c of all)
          for (const d of all) {
            const ans: Answer[] = [a, b, c, d];
            expect(decisiveAnswer(ans) !== null).toBe(hardRule(ans));
          }
  });

  it('has nothing to say before four answers exist', () => {
    expect(decisiveAnswer([])).toBeNull();
    expect(decisiveAnswer([1])).toBeNull();
    expect(decisiveAnswer([1, 1, 1])).toBeNull();
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
