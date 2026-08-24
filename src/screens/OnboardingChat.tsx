import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  mapAnswersToProfile,
  RISK_LABELS,
} from '../domain/riskProfile';
import type {
  Goal,
  Horizon,
  OnboardingAnswers,
  RiskProfile,
  SafetyNet,
  VolatilityAttitude,
} from '../domain/riskProfile';
import { MODEL_ALLOCATIONS, SATELLITE_CAP_PCT } from '../domain/allocations';
import { formatILS } from '../lib/format';

interface ChatOption {
  label: string;
  value: string;
}

interface ChatStep {
  key: keyof OnboardingAnswers | 'amount';
  ai: string;
  options: ChatOption[];
}

const STEPS: ChatStep[] = [
  {
    key: 'horizon',
    ai: 'שלום! אני העוזר הדיגיטלי של shift. לפני שנבנה לך תיק השקעות מותאם, בואי נכיר את המטרות שלך. תוך כמה זמן את חושבת להשתמש בכסף הזה?',
    options: [
      { label: 'פחות משנתיים', value: 'under2y' },
      { label: '2–5 שנים', value: '2to5y' },
      { label: '5–10 שנים', value: '5to10y' },
      { label: 'מעל 10 שנים', value: 'over10y' },
    ],
  },
  {
    key: 'volatility',
    ai: 'תודה, זה עוזר לי להבין את אופק ההשקעה. איך היית מתארת את היחס שלך לתנודות בשוק?',
    options: [
      { label: 'אני מעדיפה יציבות, גם על חשבון תשואה', value: 'stability' },
      { label: 'אני בסדר עם עליות ומורדות בתמורה לתשואה גבוהה יותר בטווח הארוך', value: 'comfortable' },
      { label: 'קצת משני העולמות', value: 'mixed' },
    ],
  },
  {
    key: 'goal',
    ai: 'מובן. ומה המטרה המרכזית של ההשקעה הזו?',
    options: [
      { label: 'חיסכון לפרישה', value: 'retirement' },
      { label: "מטרה ספציפית (דירה, לימודים וכו')", value: 'specific' },
      { label: 'הגדלת הון כללית', value: 'growth' },
    ],
  },
  {
    key: 'safetyNet',
    ai: 'עוד שאלה אחת — יש לך כרית ביטחון נזילה מחוץ להשקעה הזו, למקרה הצורך?',
    options: [
      { label: 'כן, יש לי רשת ביטחון', value: 'yes' },
      { label: 'לא, זה החיסכון היחיד שלי', value: 'no' },
    ],
  },
  {
    key: 'amount',
    ai: 'ולסיום — בכמה כסף בערך מדובר? הסכום משמש להמחשת התיק בלבד, ולא נפתח שום חשבון.',
    options: [
      { label: '₪10,000', value: '10000' },
      { label: '₪50,000', value: '50000' },
      { label: '₪100,000', value: '100000' },
      { label: '₪250,000', value: '250000' },
    ],
  },
];

const PROFILE_SUMMARY: Record<RiskProfile, { body: string; bullets: string[] }> = {
  conservative: {
    body: 'דגש על יציבות ושמירה על הקרן: התיק כולו בקרנות מחקות מפוזרות לפי סוגי נכסים, עם משקל גבוה יותר לאג"ח, וללא השכבה האלגוריתמית.',
    bullets: [
      'ליבה: מניות עולם, אג"ח ממשלתי, מניות ישראל ושווקים מתעוררים',
      'ללא שכבה אלגוריתמית — פרופיל זה אינו כולל אותה',
      'מתאים לאופק קצר או להעדפת יציבות מובהקת',
    ],
  },
  balanced: {
    body: 'שילוב של יציבות וצמיחה: רוב התיק בקרנות מחקות מפוזרות לפי סוגי נכסים, עם שכבה אלגוריתמית קטנה ואופציונלית שמוגבלת ל-15% מהתיק.',
    bullets: [
      'ליבה: מניות עולם, אג"ח ממשלתי, מניות ישראל ושווקים מתעוררים',
      'שכבה אלגוריתמית: עד 15% מהתיק, בהתאם לפרופיל הסיכון',
      'אופק השקעה בינוני-ארוך, ללא צורך במעקב יומי',
    ],
  },
  growth: {
    body: 'דגש על צמיחה לטווח ארוך: משקל גבוה למניות בקרנות מחקות מפוזרות, עם שכבה אלגוריתמית אופציונלית שמוגבלת ל-15% מהתיק.',
    bullets: [
      'ליבה: מניות עולם, אג"ח ממשלתי, מניות ישראל ושווקים מתעוררים',
      'שכבה אלגוריתמית: עד 15% מהתיק, בהתאם לפרופיל הסיכון',
      'אופק השקעה ארוך וסבילות לתנודות בדרך',
    ],
  },
};

interface ChatMessage {
  who: 'ai' | 'user';
  text: string;
}

export default function OnboardingChat() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Record<string, ChatOption>>({});

  const done = step >= STEPS.length;

  const answers: OnboardingAnswers | null = useMemo(() => {
    if (!done) return null;
    return {
      horizon: picked.horizon.value as Horizon,
      volatility: picked.volatility.value as VolatilityAttitude,
      goal: picked.goal.value as Goal,
      safetyNet: picked.safetyNet.value as SafetyNet,
    };
  }, [done, picked]);

  const profile = answers ? mapAnswersToProfile(answers) : null;
  const intendedAmount = done ? Number(picked.amount.value) : null;

  const messages: ChatMessage[] = [];
  for (let i = 0; i <= Math.min(step, STEPS.length - 1); i++) {
    messages.push({ who: 'ai', text: STEPS[i].ai });
    const answer = picked[STEPS[i].key];
    if (answer) messages.push({ who: 'user', text: answer.label });
  }
  if (profile) {
    messages.push({
      who: 'ai',
      text: `תודה ששיתפת. על בסיס התשובות שלך — הפרופיל שמתאים לך הוא "${RISK_LABELS[profile]}".`,
    });
  }

  const pick = (option: ChatOption) => {
    setPicked((prev) => ({ ...prev, [STEPS[step].key]: option }));
    setStep((s) => s + 1);
  };

  const confirmProfile = () => {
    if (!answers || !profile || intendedAmount === null) return;
    navigate('/disclosure', { state: { answers, profile, intendedAmount } });
  };

  const summary = profile ? PROFILE_SUMMARY[profile] : null;
  const allocation = profile ? MODEL_ALLOCATIONS[profile] : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">shift</div>
        <div className="subtitle">היועץ הדיגיטלי שלך</div>
      </header>
      <main className="app-content">
        <div className="chat-flow">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.who === 'ai' ? 'bubble-ai' : 'bubble-user'}`}>
              {m.text}
            </div>
          ))}

          {!done && (
            <div className="chat-options">
              {STEPS[step].options.map((opt) => (
                <button key={opt.value} className="btn btn-secondary" onClick={() => pick(opt)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {profile && summary && allocation && intendedAmount !== null && (
            <div className="card elev-sm" style={{ marginTop: 8 }}>
              <span className="tag tag-outline" style={{ alignSelf: 'flex-start' }}>
                טרם בוצעה פעולה בחשבון
              </span>
              <div className="card-title">הפרופיל המומלץ: {RISK_LABELS[profile]}</div>
              <p className="card-body">{summary.body}</p>
              <ul className="profile-bullets">
                {summary.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <span className="card-meta">
                סכום להמחשה: {formatILS(intendedAmount)}
                {allocation.satellitePct > 0 &&
                  ` · שכבה אלגוריתמית ${allocation.satellitePct}% (תקרה ${SATELLITE_CAP_PCT}%)`}
              </span>
              <button className="btn btn-primary btn-block" onClick={confirmProfile}>
                אשר פרופיל
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
