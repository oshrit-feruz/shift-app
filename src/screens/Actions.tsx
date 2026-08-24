import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../api/hooks';
import { deriveRecommendations } from '../domain/recommendations';
import { useProfile } from '../state/profileStore';
import { useCompletedActions } from '../state/actionsStore';
import TabBar from '../components/TabBar';

const ICONS: Record<string, React.ReactNode> = {
  allocation: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="6" r="1.8" fill="currentColor" />
      <circle cx="16" cy="12" r="1.8" fill="currentColor" />
      <circle cx="11" cy="18" r="1.8" fill="currentColor" />
    </svg>
  ),
  referral: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M4 10l8-5 8 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  insight: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function Actions() {
  const navigate = useNavigate();
  const { state: profileState } = useProfile();
  const [dashboard] = useDashboard();
  const [completed] = useCompletedActions();

  if (!profileState) return null;

  const recs = deriveRecommendations({
    profile: profileState.profile,
    openPositionsCount: dashboard.status === 'ready' ? dashboard.data.summary.open : null,
  });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" style={{ fontSize: 19 }}>פעולות מומלצות</div>
        <div className="subtitle">המלצות נגזרות מהפרופיל שלך וממצב המנוע — שום פעולה לא מתבצעת בלי אישור מפורש</div>
      </header>
      <main className="app-content">
        <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recs.map((rec) => {
            const isCompleted = !!completed[rec.id];
            const isInsight = rec.type === 'insight';
            return (
              <div key={rec.id} className="card elev-sm" style={isCompleted ? { opacity: 0.5 } : undefined}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div
                    style={{
                      flex: 'none', width: 32, height: 32, borderRadius: 9999,
                      background: isInsight ? 'var(--color-neutral-800)' : 'var(--color-accent-800)',
                      color: isInsight ? 'var(--color-neutral-200)' : 'var(--color-accent-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {ICONS[rec.type]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="card-title" style={{ fontSize: 15 }}>{rec.title}</span>
                      {isCompleted && (
                        <span className="tag tag-neutral" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
                            <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          בוצע
                        </span>
                      )}
                    </div>
                    <p className="card-body">{rec.desc}</p>
                    {rec.actionable && !isCompleted && (
                      <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={() => navigate(`/actions/${rec.id}`)}>
                        פרטים ואישור
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {dashboard.status !== 'ready' && (
            <span className="card-meta">
              {dashboard.status === 'loading'
                ? 'תובנות המבוססות על נתוני המנוע החיים ייטענו כשיתקבלו הנתונים…'
                : 'תובנות המבוססות על נתוני המנוע החיים אינן מוצגות כרגע — הנתונים אינם זמינים.'}
            </span>
          )}
        </div>
      </main>
      <TabBar />
    </div>
  );
}
