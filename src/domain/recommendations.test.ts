import { describe, expect, it } from 'vitest';
import { deriveRecommendations } from './recommendations';

describe('deriveRecommendations', () => {
  it('is deterministic for identical inputs', () => {
    const a = deriveRecommendations({ profile: 'balanced', openPositionsCount: 0 });
    const b = deriveRecommendations({ profile: 'balanced', openPositionsCount: 0 });
    expect(a).toEqual(b);
  });

  it('omits the satellite recommendation for the conservative profile', () => {
    const recs = deriveRecommendations({ profile: 'conservative', openPositionsCount: 0 });
    expect(recs.find((r) => r.id === 'satellite-review')).toBeUndefined();
  });

  it('includes the satellite recommendation for balanced and growth', () => {
    for (const profile of ['balanced', 'growth'] as const) {
      const recs = deriveRecommendations({ profile, openPositionsCount: 0 });
      expect(recs.find((r) => r.id === 'satellite-review')).toBeDefined();
    }
  });

  it('omits live-data insights entirely when the API is unavailable', () => {
    const recs = deriveRecommendations({ profile: 'balanced', openPositionsCount: null });
    expect(recs.filter((r) => r.type === 'insight')).toHaveLength(0);
  });

  it('reflects the real engine state in the insight', () => {
    expect(
      deriveRecommendations({ profile: 'growth', openPositionsCount: 0 }).find((r) => r.type === 'insight')?.id,
    ).toBe('engine-idle');
    expect(
      deriveRecommendations({ profile: 'growth', openPositionsCount: 3 }).find((r) => r.type === 'insight')?.id,
    ).toBe('engine-active');
  });

  it('insights are never actionable (no confirm flow on information)', () => {
    const recs = deriveRecommendations({ profile: 'balanced', openPositionsCount: 2 });
    for (const r of recs.filter((x) => x.type === 'insight')) {
      expect(r.actionable).toBe(false);
    }
  });
});
