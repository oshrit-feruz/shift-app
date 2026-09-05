import { describe, expect, it } from 'vitest';
import { whyThisProfileLine } from './whyThisProfile';
import { STRINGS, type StringKey } from '../../i18n/strings';
import { mapProfile, type Answer } from '../../lib/advisory';
import type { TFn } from '../../i18n/useT';

/**
 * The line that tells a reader why they got this profile.
 *
 * Three ways it can be wrong, none of which throws or shows on a screenshot:
 *
 *  - a templated string key that does not exist, so the sentence renders with
 *    a hole in it on the screen the whole flow leads to;
 *  - a sentence naming a profile other than the one rendered beneath it;
 *  - a sentence blaming answers that did not decide anything, which is a
 *    plausible-looking explanation of a real number.
 *
 * All 81 combinations are covered, because the rule has a hard-coded branch
 * and a summed one and the boundary between them is exactly where a wrong
 * claim would hide.
 */

const all: Answer[] = [1, 2, 3];

/** The real translator, minus React — same lookup and same interpolation. */
function tFor(lang: 'en' | 'he'): TFn {
  return ((key: StringKey, vars?: Record<string, string | number>) => {
    let s: string = STRINGS[key][lang];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }) as TFn;
}

/** The line as the screen would render it, for one set of answers. */
function lineFor(answers: Answer[], lang: 'en' | 'he'): string {
  const t = tFor(lang);
  const profile = t(`profile.${mapProfile(answers)}` as StringKey);
  const line = whyThisProfileLine(answers, profile, t);
  if (line === null) throw new Error('expected a line for four answers');
  return line;
}

/** Runs an assertion over all 81 four-answer combinations. */
function everyCombination(fn: (answers: Answer[]) => void) {
  for (const a of all) for (const b of all) for (const c of all) for (const d of all) fn([a, b, c, d]);
}

describe('the keys it builds by template', () => {
  it('all twelve answer strings exist, in both languages', () => {
    for (let q = 1; q <= 4; q += 1)
      for (const a of all) {
        const key = `adv.q${q}a${a}` as StringKey;
        expect(STRINGS[key], key).toBeDefined();
        expect(STRINGS[key].en.length).toBeGreaterThan(0);
        expect(STRINGS[key].he.length).toBeGreaterThan(0);
      }
  });

  it('never leaves a placeholder unfilled, in any of the 81 combinations', () => {
    everyCombination((answers) => {
      for (const lang of ['en', 'he'] as const) {
        expect(lineFor(answers, lang), `${answers.join('')}/${lang}`).not.toMatch(/\{[a-z]+\}/i);
      }
    });
  });
});

describe('what it claims', () => {
  it('always names the profile the allocation actually uses', () => {
    // The worst failure available here: a sentence explaining one profile
    // while a different one is rendered underneath it.
    everyCombination((answers) => {
      const profile = STRINGS[`profile.${mapProfile(answers)}` as StringKey];
      expect(lineFor(answers, 'he')).toContain(profile.he);
      expect(lineFor(answers, 'en')).toContain(profile.en);
    });
  });

  it('quotes all four answers wherever the sum decided', () => {
    everyCombination((answers) => {
      if (answers[0] === 1 || answers[3] === 1) return; // hard rule, checked below
      const s = lineFor(answers, 'he');
      for (let i = 0; i < 4; i += 1) {
        expect(s, answers.join('')).toContain(STRINGS[`adv.q${i + 1}a${answers[i]}` as StringKey].he);
      }
    });
  });

  it('reads as one sentence a person would recognise', () => {
    expect(lineFor([3, 2, 2, 2], 'he')).toBe(
      'בחרת: יותר מ-7 שנים · להחזיק ולהפסיק להסתכל · לצמוח בקצב השוק · חודש-חודשיים של הוצאות. יחד זה ממופה למאוזן.',
    );
    expect(lineFor([3, 2, 2, 2], 'en')).toBe(
      'You chose: More than seven years · I would hold and stop looking · Growing at the pace of the market · A month or two of expenses. Together, that maps to Balanced.',
    );
  });
});

describe('where one answer genuinely decided it', () => {
  it('quotes that answer alone, and says the rest did not matter', () => {
    expect(lineFor([1, 3, 3, 3], 'he')).toBe(
      'בחרת “פחות משנתיים”. זה לבדו ממפה לסולידי, לא משנה מה שלוש התשובות האחרות.',
    );
  });

  it('names the safety net when that is what fired', () => {
    expect(lineFor([3, 3, 3, 1], 'he')).toContain('זה כל הכסף שיש לי');
  });

  it('does NOT quote the answers that had no effect', () => {
    // [1, 3, 3, 3] sums to 10, which would be Balanced — the hard rule
    // overrode it. Listing the three growth-leaning answers would suggest they
    // contributed to a Conservative result, which is backwards.
    const s = lineFor([1, 3, 3, 3], 'he');
    expect(s).not.toContain('לקנות עוד');
    expect(s).not.toContain('להשיג יותר מהשוק');
    expect(s).not.toContain('כמה חודשים');
  });
});

describe('before there is anything to explain', () => {
  it('renders nothing with fewer than four answers', () => {
    const t = tFor('he');
    expect(whyThisProfileLine([], 'סולידי', t)).toBeNull();
    expect(whyThisProfileLine([3, 3, 3], 'סולידי', t)).toBeNull();
  });

  it('renders nothing with MORE than four, rather than crashing on adv.q5', () => {
    // `Answer[]` permits any length and `advAnswers` is rehydrated from
    // localStorage and the synced user_state row without validation —
    // readPersisted heals watchlist and savedAlerts and passes this through
    // verbatim. Five answers would build `adv.q5a2`, which does not exist, and
    // take down the screen the whole flow leads to.
    const t = tFor('he');
    expect(whyThisProfileLine([2, 2, 2, 2, 2], 'מאוזן', t)).toBeNull();
    expect(whyThisProfileLine([1, 2, 2, 2, 2, 2], 'סולידי', t)).toBeNull();
  });
});
