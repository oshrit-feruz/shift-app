import type { RiskProfile } from './riskProfile';

/** The satellite (algorithmic layer) is capped at 15% of the portfolio for
 *  every profile, and is available only above the conservative profile. */
export const SATELLITE_CAP_PCT = 15;

export interface CoreSegment {
  label: string;
  pct: number;
}

export interface ModelAllocation {
  core: CoreSegment[];
  satellitePct: number; // 0 = no satellite for this profile
}

export const MODEL_ALLOCATIONS: Record<RiskProfile, ModelAllocation> = {
  conservative: {
    core: [
      { label: 'מניות עולם', pct: 60 },
      { label: 'אג"ח ממשלתי', pct: 22 },
      { label: 'מניות ישראל', pct: 11 },
      { label: 'שווקים מתעוררים', pct: 7 },
    ],
    satellitePct: 0,
  },
  balanced: {
    core: [
      { label: 'מניות עולם', pct: 55 },
      { label: 'אג"ח ממשלתי', pct: 20 },
      { label: 'מניות ישראל', pct: 10 },
      { label: 'שווקים מתעוררים', pct: 7 },
    ],
    satellitePct: 8,
  },
  growth: {
    core: [
      { label: 'מניות עולם', pct: 58 },
      { label: 'אג"ח ממשלתי', pct: 12 },
      { label: 'מניות ישראל', pct: 10 },
      { label: 'שווקים מתעוררים', pct: 8 },
    ],
    satellitePct: 12,
  },
};
