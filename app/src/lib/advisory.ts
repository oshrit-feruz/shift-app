/**
 * The advisory track's deterministic risk-profile mapping.
 *
 * Product rules (regulatory-sensitive — do not "improve" without sign-off):
 * - Four questions (horizon, risk reaction, goal, safety net), each answered
 *   1..3. The same answers ALWAYS produce the same profile — no discretion,
 *   no per-user tuning.
 * - HARD RULE: a horizon under 2 years (q1 = 1) OR no cash safety net
 *   (q4 = 1) maps to Conservative regardless of the other answers.
 * - Otherwise the answer sum maps: <= 7 Conservative, 8..10 Balanced,
 *   >= 11 Growth.
 * - Satellite sleeve: Conservative 0%, Balanced 10%, Growth 15% (capped at
 *   15% by the published rule set).
 */

export type Answer = 1 | 2 | 3;
export type ProfileKey = 'cons' | 'bal' | 'growth';

export interface CoreAllocation {
  /** i18n key of the category name (see strings.ts, core.*) */
  category: CoreCategory;
  pct: number;
}

export type CoreCategory =
  | 'globalGovBonds'
  | 'developedIndex'
  | 'corporateBonds'
  | 'cashEquivalents'
  | 'sp500'
  | 'emergingIndex';

export interface Profile {
  key: ProfileKey;
  satellitePct: number;
  core: CoreAllocation[];
}

/**
 * PLACEHOLDER FUND NAMES — realistic but NOT signed off. Which specific
 * ETFs/funds the product recommends is a material product decision; these
 * must be reviewed before anything ships. (Flagged in README as well.)
 */
export const CORE_FUNDS: Partial<Record<CoreCategory, string>> = {
  developedIndex: 'iShares Core MSCI EAFE ETF · IEFA',
  sp500: 'Vanguard S&P 500 ETF · VOO',
  corporateBonds: 'iShares Investment Grade Corporate Bond ETF · LQD',
  cashEquivalents: 'Money Market Fund · VMFXX',
  emergingIndex: 'iShares MSCI Emerging Markets ETF · EEM',
};

export const PROFILES: Record<ProfileKey, Profile> = {
  cons: {
    key: 'cons',
    satellitePct: 0,
    core: [
      { category: 'globalGovBonds', pct: 45 },
      { category: 'developedIndex', pct: 30 },
      { category: 'corporateBonds', pct: 15 },
      { category: 'cashEquivalents', pct: 10 },
    ],
  },
  bal: {
    key: 'bal',
    satellitePct: 10,
    core: [
      { category: 'developedIndex', pct: 40 },
      { category: 'sp500', pct: 25 },
      { category: 'globalGovBonds', pct: 25 },
    ],
  },
  growth: {
    key: 'growth',
    satellitePct: 15,
    core: [
      { category: 'sp500', pct: 40 },
      { category: 'developedIndex', pct: 25 },
      { category: 'emergingIndex', pct: 10 },
      { category: 'globalGovBonds', pct: 10 },
    ],
  },
};

/** True when the hard Conservative override applies. */
export function hardRule(answers: Answer[]): boolean {
  return answers.length >= 4 && (answers[0] === 1 || answers[3] === 1);
}

/** Deterministic mapping of four answers to a profile. Null until all four answered. */
export function mapProfile(answers: Answer[]): ProfileKey | null {
  if (answers.length < 4) return null;
  if (hardRule(answers)) return 'cons';
  const score = answers.reduce<number>((a, b) => a + b, 0);
  return score <= 7 ? 'cons' : score <= 10 ? 'bal' : 'growth';
}
