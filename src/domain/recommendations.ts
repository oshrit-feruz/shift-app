import type { RiskProfile } from './riskProfile';
import { MODEL_ALLOCATIONS, SATELLITE_CAP_PCT } from './allocations';

/**
 * Deterministic, client-side recommendation rules.
 *
 * Like the risk mapping, this is a pure function of real state only — the
 * confirmed profile and the live engine dashboard. No backend generates
 * these; nothing here is a market prediction, and none of them execute
 * anything. Confirming a recommendation records acknowledgement locally —
 * the copy on every path states explicitly that no account action occurs.
 */

export type RecommendationType = 'allocation' | 'referral' | 'insight';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  desc: string;
  rationale: string[];
  /** insight = informational only, no confirm flow */
  actionable: boolean;
}

export interface RecommendationInputs {
  profile: RiskProfile;
  /** Live engine state; null when the API is unavailable — rules that
   *  depend on live data are simply omitted rather than guessed. */
  openPositionsCount: number | null;
}

export function deriveRecommendations(inputs: RecommendationInputs): Recommendation[] {
  const { profile, openPositionsCount } = inputs;
  const alloc = MODEL_ALLOCATIONS[profile];
  const recs: Recommendation[] = [];

  if (alloc.satellitePct > 0) {
    recs.push({
      id: 'satellite-review',
      type: 'allocation',
      title: 'סקירת השכבה האלגוריתמית בתיק',
      desc: `פרופיל הסיכון שלך מאפשר שכבה אלגוריתמית של ${alloc.satellitePct}% מהתיק (עד תקרה של ${SATELLITE_CAP_PCT}%). מומלץ לוודא שההקצאה מוכרת ומובנת לפני ביצוע עתידי.`,
      rationale: [
        `יעד השכבה לפרופיל שלך: ${alloc.satellitePct}% · התקרה הקבועה: ${SATELLITE_CAP_PCT}% מהתיק.`,
        'השכבה מבוססת על אסטרטגיית ההתאוששות של מנוע האותות, על נתונים היסטוריים בלבד.',
      ],
      actionable: true,
    });
  }

  recs.push({
    id: 'standing-order',
    type: 'referral',
    title: 'הפעלת הוראת קבע חודשית',
    desc: 'הגדרת הפקדה חודשית קבועה מסייעת להשקיע בעקביות ולפזר את נקודות הכניסה לשוק לאורך זמן.',
    rationale: [],
    actionable: true,
  });

  if (openPositionsCount !== null) {
    recs.push(
      openPositionsCount === 0
        ? {
            id: 'engine-idle',
            type: 'insight',
            title: 'אין כרגע פוזיציות פתוחות בשכבה האלגוריתמית',
            desc: 'מנוע האותות נכנס לפוזיציה רק כשמתקיימים תנאי הכניסה של האסטרטגיה. היעדר פוזיציות הוא מצב תקין — לא תקלה.',
            rationale: [],
            actionable: false,
          }
        : {
            id: 'engine-active',
            type: 'insight',
            title: `${openPositionsCount} פוזיציות פתוחות בשכבה האלגוריתמית`,
            desc: 'הפוזיציות מנוהלות לפי כללי האסטרטגיה: החזקה של 252 ימי מסחר, ללא התאמות ידניות.',
            rationale: [],
            actionable: false,
          },
    );
  }

  return recs;
}
