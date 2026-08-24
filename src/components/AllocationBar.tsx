import type { ModelAllocation } from '../domain/allocations';
import { SATELLITE_CAP_PCT } from '../domain/allocations';

const CORE_COLORS = [
  'var(--color-accent-700)',
  'var(--color-accent-600)',
  'var(--color-accent-500)',
  'var(--color-accent-400)',
];
const SATELLITE_COLOR = 'var(--color-neutral-400)';

export default function AllocationBar({ allocation }: { allocation: ModelAllocation }) {
  const showSatellite = allocation.satellitePct > 0;
  return (
    <div className="card elev-sm">
      <div className="card-title" style={{ fontSize: 15 }}>הרכב התיק</div>
      <div className="alloc-bar">
        {allocation.core.map((seg, i) => (
          <div key={seg.label} style={{ height: '100%', background: CORE_COLORS[i], width: `${seg.pct}%` }} />
        ))}
        {showSatellite && (
          <div style={{ height: '100%', background: SATELLITE_COLOR, width: `${allocation.satellitePct}%` }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {allocation.core.map((seg, i) => (
          <div key={seg.label} className="alloc-row">
            <span className="alloc-dot" style={{ background: CORE_COLORS[i] }} />
            <span style={{ flex: 1 }}>{seg.label} · ליבה</span>
            <span style={{ color: 'var(--color-neutral-400)' }}>{seg.pct}%</span>
          </div>
        ))}
        {showSatellite && (
          <>
            <div className="alloc-row">
              <span className="alloc-dot" style={{ background: SATELLITE_COLOR }} />
              <span style={{ flex: 1 }}>שכבה אלגוריתמית (Satellite)</span>
              <span style={{ color: 'var(--color-neutral-400)' }}>{allocation.satellitePct}%</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', marginTop: 2 }}>
              מוגבלת ל-{SATELLITE_CAP_PCT}% מהתיק · זמינה לפרופילי סיכון בינוני ומעלה
            </div>
          </>
        )}
      </div>
    </div>
  );
}
