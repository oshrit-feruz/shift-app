import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useDashboard } from '../api/hooks';
import { deriveRecommendations } from '../domain/recommendations';
import { SATELLITE_CAP_PCT } from '../domain/allocations';
import { useProfile } from '../state/profileStore';
import { useCompletedActions } from '../state/actionsStore';

export default function ActionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { state: profileState } = useProfile();
  const [dashboard] = useDashboard();
  const [, complete] = useCompletedActions();
  const [mode, setMode] = useState<'detail' | 'disclosure'>('detail');

  if (!profileState) return null;

  const rec = deriveRecommendations({
    profile: profileState.profile,
    openPositionsCount: dashboard.status === 'ready' ? dashboard.data.summary.open : null,
  }).find((r) => r.id === id && r.actionable);

  if (!rec) return <Navigate to="/actions" replace />;

  const finish = () => {
    complete(rec.id);
    navigate('/actions', { replace: true });
  };

  return (
    <div className="app-shell">
      <header style={{ flex: 'none', padding: '18px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => navigate('/actions')}
          aria-label="חזרה"
          style={{ background: 'none', border: 'none', color: 'var(--color-text)', padding: 6, cursor: 'pointer', display: 'flex' }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 500 }}>פרטי פעולה</div>
      </header>
      <main className="app-content">
        <div style={{ padding: '6px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'detail' ? (
            <>
              <div>
                <span className="tag tag-accent">{rec.type === 'referral' ? 'הוראת קבע' : 'שינוי הרכב תיק'}</span>
                <h3 style={{ margin: '10px 0 6px' }}>{rec.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-300)', margin: 0 }}>{rec.desc}</p>
              </div>

              {rec.rationale.length > 0 && (
                <div className="card elev-sm">
                  <div className="card-kicker">רציונל</div>
                  <ul style={{ margin: 0, paddingRight: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--color-neutral-300)' }}>
                    {rec.rationale.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rec.type === 'referral' ? (
                <>
                  <div className="card elev-sm">
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                      פעולה זו מוגדרת ומבוצעת אצל הבנק או הברוקר שלך. לא תתבצע שום פעולה בחשבון דרך האפליקציה הזו.
                    </p>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={finish}>הבנתי, אמשיך אצל הבנק שלי</button>
                </>
              ) : (
                <>
                  <div className="card elev-sm">
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                      לא תתבצע פעולה בחשבון. אישור יוביל אותך למסך גילוי נאות לפני כל ביצוע עתידי.
                    </p>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={() => setMode('disclosure')}>המשך לגילוי נאות</button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="tag tag-outline">גילוי נאות · טרם בוצעה פעולה</span>
              <h3 style={{ margin: '10px 0 6px' }}>גילוי נאות לפני ביצוע</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-neutral-300)', margin: 0 }}>
                שינוי הרכב התיק, כולל היקף השכבה האלגוריתמית, נשען על ביצועים היסטוריים בלבד ואינו מבטיח תוצאה עתידית.
                השכבה האלגוריתמית תמשיך להיות מוגבלת ל-{SATELLITE_CAP_PCT}% מהתיק. אישור זה אינו מבצע את הפעולה בפועל —
                הוא מסמן שקראת והבנת את השינוי המוצע.
              </p>
              <button className="btn btn-primary btn-block" onClick={finish}>הבנתי, סיים</button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
