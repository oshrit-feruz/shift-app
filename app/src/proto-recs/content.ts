/**
 * Prototype content and copy.
 *
 * Copy that already exists in the product comes from i18n/strings.ts through
 * the real `useT` — the questions, the "informational only" tags, the profile
 * and category names are all live product strings, so what the variants are
 * being judged on is the design and not a rewrite of the wording.
 *
 * What is here is the copy the variants *invent*, in the same {en, he} shape
 * strings.ts uses, and the figures they show. The figures are the demo
 * adapter's own (data/demoAdapter.ts: Blink's total, the symbol table's
 * prices), so the pages read like the app with sample data on rather than
 * like a mock.
 */

import type { Language } from '../theme/ThemeProvider';

export interface Copy {
  en: string;
  he: string;
}

const p = (en: string, he: string): Copy => ({ en, he });

export const COPY = {
  /** Beacon */
  beaconStart: p('Start', 'להתחיל'),
  beaconYours: p('Your recommendation', 'ההמלצה שלך'),
  beaconPassed: p('{n} passed today', '{n} עברו היום'),

  /** Inline */
  inlineQuestionOf: p('Question {n} of 4', 'שאלה {n} מתוך 4'),
  inlineResume: p('Back to the questions', 'לחזור לשאלות'),
  inlineProfileIs: p('Your profile: {name}', 'הפרופיל שלך: {name}'),
  inlineSeeFull: p('See the full recommendation', 'לראות את ההמלצה המלאה'),

  /** Briefing */
  briefTitle: p("Today's check", 'הבדיקה של היום'),
  /** Rendered after the count itself, which is a <Num> of its own so the
   *  headline figure stays LTR inside the Hebrew sentence. */
  briefCount: p('of {checked} stocks passed every check', 'מתוך {checked} מניות עברו את כל הבדיקות'),
  briefSameForAll: p(
    'The list is the same for everyone. What your profile decides is how much of the portfolio — if any — goes to individual stocks.',
    'הרשימה זהה לכולן. מה שהפרופיל שלך קובע הוא כמה מהתיק — אם בכלל — מוקצה למניות בודדות.',
  ),
  briefSleeve: p('Individual stocks: {pct}% of the portfolio', 'מניות בודדות: {pct}% מהתיק'),
  briefOpen: p('Open the recommendation', 'לפתוח את ההמלצה'),

  /** Legend labels — the category names are long enough to wrap a phone twice
   *  (core.developedIndex is "מדד שווקים מפותחים"), and a legend is read at a
   *  glance, so the bands get short forms of their own. */
  shortDeveloped: p('Developed', 'מפותחים'),
  shortSp500: p('S&P 500', 'S&P 500'),
  shortBonds: p('Gov bonds', 'אג״ח ממשלתי'),
  shortSingles: p('Individual', 'מניות בודדות'),

  /** Harness */
  outOfScope: p('Not part of this prototype', 'לא חלק מהאב-טיפוס הזה'),
  backHome: p('Back to home', 'חזרה לבית'),
} satisfies Record<string, Copy>;

export type CopyKey = keyof typeof COPY;

/** Which state of the user's journey the home page is being judged in: before
 *  the advisory flow has ever been run, or after it produced a profile. Both
 *  matter — a block that only works for one of them is not shippable. */
export type Phase = 'new' | 'done';

export interface VariantProps {
  phase: Phase;
  setPhase: (p: Phase) => void;
}

/** The prototype's own translator, alongside — never instead of — `useT`. */
export function c(key: CopyKey, language: Language, vars?: Record<string, string | number>): string {
  let s = COPY[key][language];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** The Balanced profile's core sleeve — lib/advisory.ts PROFILES.bal, with the
 *  fund names it carries and one colour per band. */
export const CORE = [
  { category: 'developedIndex', pct: 40, fund: 'IEFA', color: 'var(--color-accent)' },
  { category: 'sp500', pct: 25, fund: 'VOO', color: 'var(--acc-lite)' },
  { category: 'globalGovBonds', pct: 25, fund: null, color: 'var(--acc-dim)' },
] as const;

/** The satellite sleeve for Balanced (lib/advisory.ts): 10%, capped at 15%. */
export const SATELLITE_PCT = 10;

/** What "passed today's checks" is showing — the demo table's tickers and its
 *  frozen prices (data/demoAdapter.ts SYMS). */
export const CANDIDATES = [
  { ticker: 'NVDA', price: 182.44 },
  { ticker: 'JPM', price: 291.04 },
  { ticker: 'LLY', price: 742.18 },
];

/** How many symbols the daily screen covers. Not a round number picked to
 *  sound impressive: it is what rec.updatedDaily already tells the reader on
 *  the recommendation screen — "100 large S&P 500 companies go through the
 *  same checks every trading day". A prototype that says 500 while the card
 *  under it says 100 has invented a figure. */
export const UNIVERSE = 100;

/** Blink's demo account, as the Portfolio tab shows it. */
export const ACCOUNT = { total: '$48,214.60', dayLine: '+$412.18 · +0.86%', dayPct: 0.86 };
