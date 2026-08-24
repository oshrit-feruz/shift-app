/**
 * Deterministic mapping from onboarding answers to a risk profile.
 *
 * Regulatory constraint: this is the ONLY place chat answers become a
 * profile. It is a pure, table-driven function — no API calls, no LLM, no
 * randomness — so the mapping is auditable and unit-testable. It decides
 * portfolio ALLOCATION only and never feeds anything back into the signal
 * engine's parameters.
 */

export type Horizon = 'under2y' | '2to5y' | '5to10y' | 'over10y';
export type VolatilityAttitude = 'stability' | 'mixed' | 'comfortable';
export type Goal = 'retirement' | 'specific' | 'growth';
export type SafetyNet = 'yes' | 'no';

export interface OnboardingAnswers {
  horizon: Horizon;
  volatility: VolatilityAttitude;
  goal: Goal;
  safetyNet: SafetyNet;
}

export type RiskProfile = 'conservative' | 'balanced' | 'growth';

export const RISK_LABELS: Record<RiskProfile, string> = {
  conservative: 'סולידי',
  balanced: 'מאוזן',
  growth: 'צמיחה',
};

const HORIZON_SCORE: Record<Horizon, number> = {
  under2y: 0,
  '2to5y': 1,
  '5to10y': 2,
  over10y: 3,
};

const VOLATILITY_SCORE: Record<VolatilityAttitude, number> = {
  stability: 0,
  mixed: 2,
  comfortable: 4,
};

const GOAL_SCORE: Record<Goal, number> = {
  specific: 0,
  growth: 1,
  retirement: 2,
};

/**
 * Hard caps first (either one alone forces Conservative):
 *  - horizon under 2 years: no room to ride out drawdowns;
 *  - no liquid safety net: this money cannot be exposed to equity risk.
 * Otherwise the summed score (0–9) buckets into the three profiles.
 */
export function mapAnswersToProfile(answers: OnboardingAnswers): RiskProfile {
  if (answers.horizon === 'under2y' || answers.safetyNet === 'no') {
    return 'conservative';
  }
  const score =
    HORIZON_SCORE[answers.horizon] +
    VOLATILITY_SCORE[answers.volatility] +
    GOAL_SCORE[answers.goal];
  if (score <= 3) return 'conservative';
  if (score <= 6) return 'balanced';
  return 'growth';
}
