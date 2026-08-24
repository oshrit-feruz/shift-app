import { formatPct } from '../lib/format';

/**
 * The honest-drawdown disclosure. Always visible and prominent on the
 * dashboard: the static text is the strategy's approved disclosure copy;
 * the second line reports realized drawdown from the engine's own closed
 * trades — or says plainly that the live history is still insufficient.
 */
export default function DrawdownCard({
  worstRealizedPct,
  closedCount,
  apiAvailable,
}: {
  worstRealizedPct: number | null;
  closedCount: number | null;
  apiAvailable: boolean;
}) {
  let liveLine: string;
  if (!apiAvailable) {
    liveLine = 'נתוני העסקאות ההיסטוריות אינם זמינים כרגע.';
  } else if (worstRealizedPct === null) {
    liveLine = 'אין עדיין מספיק היסטוריית עסקאות סגורות במערכת כדי להציג ירידה בפועל.';
  } else {
    liveLine = `הירידה הממומשת הגרועה ביותר עד כה בעסקאות שנסגרו (${closedCount ?? '?'} עסקאות): ${formatPct(worstRealizedPct)}.`;
  }
  return (
    <div
      className="card elev-sm"
      style={{ border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 'none', color: 'var(--color-accent-300)', marginTop: 2 }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M12 4l9 15H3L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M12 10v4M12 16.7v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 15 }}>ירידה אפשרית מנקודת הכניסה</div>
          <p className="card-body" style={{ marginTop: 4 }}>
            באופן היסטורי, פוזיציות באסטרטגיה הזו יורדות בממוצע כ-15% מנקודת הכניסה לפני שהן
            מתאוששות. זו התנהגות צפויה במסגרת האסטרטגיה — לא סימן לתקלה. המדגם ההיסטורי קטן
            והיתרון הסטטיסטי צנוע; תוצאות עבר אינן מבטיחות תוצאות עתידיות.
          </p>
          <p className="card-body" style={{ marginTop: 6, opacity: 0.7 }}>{liveLine}</p>
        </div>
      </div>
    </div>
  );
}
