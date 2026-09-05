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
  'globalGovBonds' | 'developedIndex' | 'corporateBonds' | 'cashEquivalents' | 'sp500' | 'emergingIndex';

export interface Profile {
  key: ProfileKey;
  satellitePct: number;
  core: CoreAllocation[];
}

/**
 * PLACEHOLDER FUND NAMES — realistic but NOT signed off. Which specific
 * ETFs/funds the product recommends is a material product decision; these
 * must be reviewed before anything ships. (Flagged in README as well.)
 *
 * DOMICILE / TAX: every ticker here is a US-domiciled ETF. For Israeli
 * investors that carries US dividend withholding and US estate-tax exposure
 * on US-situs assets, which Irish-domiciled (UCITS) equivalents are commonly
 * used to mitigate. Deliberately not switched here: the licensed execution
 * partner determines the actual available fund universe, so this is decided
 * once that partner is finalized — not in this file. Confirm the tax
 * treatment with a qualified adviser rather than treating this note as the
 * analysis.
 *
 * `globalGovBonds` intentionally has no entry: the placeholder it carried
 * (VEA) is a developed-markets equity fund, not a government-bond one.
 * The record is Partial so the gap is explicit rather than mislabelled.
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

/**
 * How a Stock Radar budget is split on a given day, per the engine's policy.
 *
 * Each actionable name gets a fixed slice of the budget (the policy's
 * percent), up to the policy's cap on names; whatever the names do not take
 * stays in the S&P 500 core fund. With a $10,000 budget, a 10% slice and two
 * names, $2,000 goes into stocks and $8,000 stays in the core. The share in
 * stocks moves with how many names are actionable; the slice per name never
 * does. This replaces dividing the whole budget by whatever passed today,
 * which made concentration depend on the day's count.
 */
export interface RadarSizing {
  /** Dollars per actionable name. */
  perName: number;
  /** Names that receive a slice: the actionable count, capped by the policy. */
  names: number;
  /** Actionable names beyond the cap, which receive nothing. */
  overflow: number;
  /** Dollars in individual stocks in total. */
  inStocks: number;
  /** Dollars that stay in the core fund. */
  parked: number;
}

export function sizeRadar(
  budget: number,
  actionableCount: number,
  policy: { sleevePctOfBudget: number; maxSleeves: number } | null,
): RadarSizing | null {
  if (policy === null || !Number.isFinite(budget) || budget <= 0) return null;
  const count = Math.max(0, Math.floor(actionableCount));
  const names = Math.min(count, policy.maxSleeves);
  const perName = (budget * policy.sleevePctOfBudget) / 100;
  const inStocks = Math.min(budget, perName * names);
  return { perName, names, overflow: count - names, inStocks, parked: budget - inStocks };
}

/**
 * True when the hard Conservative override applies.
 *
 * EXACTLY four, like `mapProfile`. The two are read together — Chat.tsx shows
 * the hard-rule note beside the profile — so a length one accepts and the
 * other rejects would explain a rule that did not fire.
 */
export function hardRule(answers: Answer[]): boolean {
  return answers.length === 4 && (answers[0] === 1 || answers[3] === 1);
}

/**
 * WHICH answer produced the profile, when a single one did — the index of the
 * decisive answer, or null when the sum decided it.
 *
 * Exists so the result screen can say why without inventing a reason. The
 * mapping has two distinct shapes and they explain themselves differently:
 *
 *   - the HARD RULE is genuinely one answer. A horizon under two years, or no
 *     cash set aside, produces Conservative on its own and the other three are
 *     not consulted. Naming that answer is exact.
 *   - otherwise it is the SUM of all four against two thresholds. No pair
 *     explains it. A sentence citing horizon and risk-reaction would read as
 *     the reason while being, for most combinations, not the reason — a
 *     plausible-looking explanation of a number, which is the one thing a
 *     screen full of real figures must never carry.
 *
 * So null does not mean "no reason". It means the reason is all four, and the
 * caller should name all four rather than pick.
 *
 * Both hard conditions can hold at once; q1 is named because it is tested
 * first in `hardRule` and because between the two it is the one the reader
 * chose about this money rather than about the rest of their life.
 */
export function decisiveAnswer(answers: Answer[]): 0 | 3 | null {
  // Rendered only beside a profile, and a profile needs exactly four answers,
  // so any other count has no decisive answer for the same reason it has no
  // profile. Kept identical to mapProfile's guard on purpose: if these drift,
  // the screen explains one rule while the allocation follows another.
  if (answers.length !== 4) return null;
  if (answers[0] === 1) return 0;
  if (answers[3] === 1) return 3;
  return null;
}

/**
 * Deterministic mapping of four answers to a profile. Null unless there are
 * exactly four.
 *
 * THE CEILING MATTERS AS MUCH AS THE FLOOR, and it is the quieter of the two.
 * The thresholds (<= 7, <= 10) are calibrated for four answers each in 1..3.
 * A five-element array sums five values against them and returns a profile
 * that looks entirely ordinary — no error, no symptom, just a reader holding
 * an allocation built for a risk appetite they did not describe. The same
 * array crashed the explanation line, which is the only reason the gap was
 * found at all; here it would never announce itself.
 *
 * `advAnswers` is persisted and rehydrated, so the length is not the
 * component's to guarantee — see readPersisted in state/appState.tsx, which
 * now drops a bag that cannot be trusted. This is the second line of defence
 * rather than the first: a caller that builds an array by hand still cannot
 * get a profile out of the wrong number of answers.
 */
export function mapProfile(answers: Answer[]): ProfileKey | null {
  if (answers.length !== 4) return null;
  if (hardRule(answers)) return 'cons';
  const score = answers.reduce<number>((a, b) => a + b, 0);
  return score <= 7 ? 'cons' : score <= 10 ? 'bal' : 'growth';
}
