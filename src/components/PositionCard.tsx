import type { OpenPosition } from '../domain/positions';
import { formatDate, formatPct } from '../lib/format';

export default function PositionCard({
  position,
  holdTargetDays,
}: {
  position: OpenPosition;
  holdTargetDays: number;
}) {
  const p = position;
  const daysPct =
    p.daysHeld !== null ? Math.min(100, (p.daysHeld / holdTargetDays) * 100) : 0;
  return (
    <div className="card elev-sm position-card">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 500 }} dir="ltr">{p.ticker}</span>
          {p.entryPrice !== null && p.currentPrice !== null && (
            <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }} dir="ltr">
              ${p.entryPrice.toFixed(2)} → ${p.currentPrice.toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', marginTop: 3 }}>
          {p.entryDate !== null ? (
            <>כניסה <span dir="ltr">{formatDate(p.entryDate)}</span></>
          ) : (
            'תאריך כניסה לא זמין'
          )}
          {' · '}
          {p.daysHeld !== null ? (
            <>יום <span dir="ltr">{p.daysHeld} מתוך {holdTargetDays}</span></>
          ) : (
            'ימי החזקה לא זמינים'
          )}
        </div>
        <div className="days-track">
          <div className="days-fill" style={{ width: `${daysPct.toFixed(0)}%` }} />
        </div>
      </div>
      <div
        dir="ltr"
        className={p.changePct !== null && p.changePct < 0 ? 'pct-loss' : 'pct-gain'}
        style={{ flex: 'none', textAlign: 'left', fontFamily: 'var(--font-heading)', fontSize: 15 }}
      >
        {p.changePct !== null ? formatPct(p.changePct) : '—'}
      </div>
    </div>
  );
}
