import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { RISK_LABELS } from '../domain/riskProfile';
import type { OnboardingAnswers, RiskProfile } from '../domain/riskProfile';
import { SATELLITE_CAP_PCT } from '../domain/allocations';
import { useProfile } from '../state/profileStore';

interface DisclosureState {
  answers: OnboardingAnswers;
  profile: RiskProfile;
  intendedAmount: number;
}

export default function Disclosure() {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useProfile();
  const pending = location.state as DisclosureState | null;

  if (!pending?.profile) {
    return <Navigate to="/onboarding" replace />;
  }

  const finish = () => {
    confirm(pending);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" style={{ fontSize: 17 }}>גילוי נאות</div>
      </header>
      <main className="app-content">
        <div style={{ padding: '18px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="tag tag-outline" style={{ alignSelf: 'flex-start' }}>
            לפני ביצוע — טרם נפתח חשבון או בוצעה פעולה
          </span>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            אישור הפרופיל "{RISK_LABELS[pending.profile]}" הוא שלב הבנה בלבד. שום כספים לא הועברו
            ושום פעולה לא בוצעה בחשבון עד כה.
          </p>
          <div className="hr" />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--color-neutral-300)',
            }}
          >
            <p style={{ margin: 0 }}>
              רמת הסיכון שבחרת קובעת את אופן הצגת המידע וגובה השכבה האלגוריתמית המותרת — היא אינה
              משנה את איכות הנתונים או את אופן חישוב האותות.
            </p>
            <p style={{ margin: 0 }}>
              השכבה האלגוריתמית מוגבלת ל-{SATELLITE_CAP_PCT}% מהתיק ומבוססת על ביצועים היסטוריים
              בלבד; תוצאות עבר אינן מבטיחות תוצאות עתידיות.
            </p>
            <p style={{ margin: 0 }}>
              בהמשך יוצג לך מסך גילוי נאות מלא לפני כל ביצוע בפועל בחשבון.
            </p>
          </div>
          <button className="btn btn-primary btn-block" onClick={finish}>
            הבנתי, המשך לתיק שלי
          </button>
        </div>
      </main>
    </div>
  );
}
