import { useCallback, useEffect, useState } from 'react';
import { fetchDashboard } from '../api/client';
import type { DashboardResponse } from '../api/types';
import { MODEL_ALLOCATIONS } from '../domain/allocations';
import { mapOpenPosition, worstRealizedReturnPct } from '../domain/positions';
import { RISK_LABELS } from '../domain/riskProfile';
import { formatDate, formatILS } from '../lib/format';
import { useProfile } from '../state/profileStore';
import AllocationBar from '../components/AllocationBar';
import ApiErrorCard from '../components/ApiErrorCard';
import DrawdownCard from '../components/DrawdownCard';
import PositionCard from '../components/PositionCard';

type ApiState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DashboardResponse };

export default function Dashboard() {
  const { state: profileState } = useProfile();
  const [api, setApi] = useState<ApiState>({ status: 'loading' });

  const load = useCallback(() => {
    fetchDashboard()
      .then((data) => setApi({ status: 'ready', data }))
      .catch(() => setApi({ status: 'error' }));
  }, []);

  useEffect(load, [load]);

  const retry = () => {
    setApi({ status: 'loading' });
    load();
  };

  // The route guard guarantees a confirmed profile before rendering.
  if (!profileState) return null;
  const { profile, intendedAmount } = profileState;
  const allocation = MODEL_ALLOCATIONS[profile];

  const data = api.status === 'ready' ? api.data : null;
  const openPositions = data ? data.open_positions.map(mapOpenPosition) : [];
  const worstRealized = data ? worstRealizedReturnPct(data.closed_positions) : null;

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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
