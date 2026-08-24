import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../api/hooks';
import { MODEL_ALLOCATIONS } from '../domain/allocations';
import { mapOpenPosition, worstRealizedReturnPct } from '../domain/positions';
import { deriveRecommendations } from '../domain/recommendations';
import { RISK_LABELS } from '../domain/riskProfile';
import { formatDate, formatILS } from '../lib/format';
import { useProfile } from '../state/profileStore';
import { useCompletedActions } from '../state/actionsStore';
import AllocationBar from '../components/AllocationBar';
import ApiErrorCard from '../components/ApiErrorCard';
import DrawdownCard from '../components/DrawdownCard';
import PositionCard from '../components/PositionCard';
import TabBar from '../components/TabBar';

export default function Dashboard() {
  const navigate = useNavigate();
  const { state: profileState } = useProfile();
  const [api, retry] = useDashboard();
  const [completed] = useCompletedActions();

  // The route guard guarantees a confirmed profile before rendering.
  if (!profileState) return null;
  const { profile, intendedAmount } = profileState;
  const allocation = MODEL_ALLOCATIONS[profile];

  const data = api.status === 'ready' ? api.data : null;
  const openPositions = data ? data.open_positions.map(mapOpenPosition) : [];
  const worstRealized = data ? worstRealizedReturnPct(data.closed_positions) : null;

  const openRecs = deriveRecommendations({
    profile,
    openPositionsCount: data ? data.summary.open : null,
  }).filter((r) => r.actionable && !completed[r.id]);
  const bannerText =
    openRecs.length === 0
      ? 'כל הפעולות המומלצות טופלו'
      : openRecs.length === 1
        ? 'פעולה מומלצת אחת מחכה לך'
        : `${openRecs.length} פעולות מומלצות מחכות לך`;

  return (
    <div className="app-shell">
      <header className="app-header app-header--split">
        <div className="brand">shift</div>
        <div className="context">תיק ההשקעות שלי · פרופיל {RISK_LABELS[profile]}</div>
      </header>
      <main className="app-content">
        <div className="dash">
          <div className="card elev-sm">
            <span className="card-kicker">שווי נכון להערכה (Mark-to-Market)</span>
            <div className="total-value" dir="ltr">{formatILS(intendedAmount)}</div>
            <span className="card-meta">
              {data
                ? `מחיר נכון ל-${formatDate(data.as_of_date)}, לא עלות רכישה`
                : 'תאריך תמחור לא זמין כרגע'}
            </span>
            <span className="card-meta">
              המחשה לפי הסכום שציינת בשיחת ההיכרות — טרם נפתח חשבון וטרם הושקע כסף בפועל.
            </span>
          </div>

          <DrawdownCard
            worstRealizedPct={worstRealized}
            closedCount={data ? data.summary.closed : null}
            apiAvailable={api.status === 'ready'}
          />

          <AllocationBar allocation={allocation} />

          <div className="card elev-sm" style={{ cursor: 'pointer' }} onClick={() => navigate('/actions')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  flex: 'none', width: 34, height: 34, borderRadius: 9999,
                  background: 'var(--color-accent-800)', color: 'var(--color-accent-100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path d="M4 6h9M4 12h9M4 18h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M17.3 5.3l1.3 1.3L21 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>{bannerText}</div>
              </div>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style={{ color: 'var(--color-neutral-400)' }}>
                <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div>
            <div className="card-title" style={{ fontSize: 15, marginBottom: 8 }}>
              פוזיציות פתוחות
              {allocation.satellitePct > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', fontWeight: 400 }}>
                  {' '}· השכבה האלגוריתמית, נתונים חיים ממנוע האותות
                </span>
              )}
            </div>
            {api.status === 'loading' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="skeleton" style={{ height: 64 }} />
                <div className="skeleton" style={{ height: 64 }} />
              </div>
            )}
            {api.status === 'error' && <ApiErrorCard onRetry={retry} />}
            {api.status === 'ready' && openPositions.length === 0 && (
              <div className="card elev-sm">
                <p className="card-body" style={{ margin: 0 }}>
                  אין פוזיציות פתוחות כרגע במנוע האותות. האסטרטגיה נכנסת לפוזיציה רק כשמתקיימים
                  תנאי הכניסה — היעדר פוזיציות הוא מצב תקין.
                </p>
              </div>
            )}
            {api.status === 'ready' && openPositions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {openPositions.map((p, i) => (
                  <PositionCard
                    key={`${p.ticker}-${i}`}
                    position={p}
                    holdTargetDays={data?.hold_target_days ?? 252}
                    onClick={() => navigate(`/position/${encodeURIComponent(p.ticker)}`, { state: { position: p } })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <TabBar />
    </div>
  );
}
