import { describe, expect, it } from 'vitest';
import { mapAnswersToProfile } from './riskProfile';
import type { OnboardingAnswers } from './riskProfile';
import { MODEL_ALLOCATIONS, SATELLITE_CAP_PCT } from './allocations';

const base: OnboardingAnswers = {
  horizon: '5to10y',
  volatility: 'mixed',
  goal: 'growth',
  safetyNet: 'yes',
};

describe('mapAnswersToProfile', () => {
  it('forces conservative when horizon is under 2 years, regardless of other answers', () => {
    expect(
      mapAnswersToProfile({ ...base, horizon: 'under2y', volatility: 'comfortable', goal: 'retirement' }),
    ).toBe('conservative');
  });

  it('forces conservative when there is no liquid safety net', () => {
    expect(
      mapAnswersToProfile({ ...base, safetyNet: 'no', horizon: 'over10y', volatility: 'comfortable' }),
    ).toBe('conservative');
  });

  it('maps a stability-seeking short-horizon saver to conservative', () => {
    // score = 1 (2-5y) + 0 (stability) + 0 (specific) = 1
    expect(
      mapAnswersToProfile({ horizon: '2to5y', volatility: 'stability', goal: 'specific', safetyNet: 'yes' }),
    ).toBe('conservative');
  });

  it('boundary: score 3 is still conservative', () => {
    // 3 (over10y) + 0 (stability) + 0 (specific) = 3
    expect(
      mapAnswersToProfile({ horizon: 'over10y', volatility: 'stability', goal: 'specific', safetyNet: 'yes' }),
    ).toBe('conservative');
  });

  it('boundary: score 4 becomes balanced', () => {
    // 2 (5-10y) + 2 (mixed) + 0 (specific) = 4
    expect(
      mapAnswersToProfile({ horizon: '5to10y', volatility: 'mixed', goal: 'specific', safetyNet: 'yes' }),
    ).toBe('balanced');
  });

  it('boundary: score 6 is still balanced', () => {
    // 3 (over10y) + 2 (mixed) + 1 (growth) = 6
    expect(
      mapAnswersToProfile({ horizon: 'over10y', volatility: 'mixed', goal: 'growth', safetyNet: 'yes' }),
    ).toBe('balanced');
  });

  it('boundary: score 7 becomes growth', () => {
    // 1 (2-5y) + 4 (comfortable) + 2 (retirement) = 7
    expect(
      mapAnswersToProfile({ horizon: '2to5y', volatility: 'comfortable', goal: 'retirement', safetyNet: 'yes' }),
    ).toBe('growth');
  });

  it('maps a long-horizon volatility-comfortable investor to growth', () => {
    expect(
      mapAnswersToProfile({ horizon: 'over10y', volatility: 'comfortable', goal: 'retirement', safetyNet: 'yes' }),
    ).toBe('growth');
  });

  it('is deterministic: same answers, same profile', () => {
    const a: OnboardingAnswers = { horizon: '5to10y', volatility: 'comfortable', goal: 'growth', safetyNet: 'yes' };
    expect(mapAnswersToProfile(a)).toBe(mapAnswersToProfile({ ...a }));
  });
});

describe('model allocations', () => {
  it('every profile sums to exactly 100%', () => {
    for (const alloc of Object.values(MODEL_ALLOCATIONS)) {
      const total = alloc.core.reduce((s, c) => s + c.pct, 0) + alloc.satellitePct;
      expect(total).toBe(100);
    }
  });

  it('the satellite never exceeds the 15% cap and is absent for conservative', () => {
    for (const alloc of Object.values(MODEL_ALLOCATIONS)) {
      expect(alloc.satellitePct).toBeLessThanOrEqual(SATELLITE_CAP_PCT);
    }
    expect(MODEL_ALLOCATIONS.conservative.satellitePct).toBe(0);
    expect(MODEL_ALLOCATIONS.balanced.satellitePct).toBeGreaterThan(0);
    expect(MODEL_ALLOCATIONS.growth.satellitePct).toBeGreaterThan(0);
  });
});
