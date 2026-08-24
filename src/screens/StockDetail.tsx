import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDashboard, useScreener } from '../api/hooks';
import { mapOpenPosition } from '../domain/positions';
import type { OpenPosition } from '../domain/positions';
import { formatDate, formatPct } from '../lib/format';
import TradingViewWidget from '../components/TradingViewWidget';

type Tab = 'overview' | 'reports' | 'news';

function BackHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header style={{ flex: 'none', padding: '18px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={() => navigate('/dashboard')}
        aria-label="חזרה"
        style={{ background: 'none', border: 'none', color: 'var(--color-text)', padding: 6, cursor: 'pointer', display: 'flex' }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          <span dir="ltr">{title}</span> · פוזיציה בשכבה האלגוריתמית
        </div>
      </div>
    </header>
  );
}

function Rationale({ ticker }: { ticker: string }) {
  const [screener, retry] = useScreener();

  if (screener.status === 'loading') {
    return (
      <div className="card elev-sm">
        <div className="card-kicker">מדוע נבחרה המניה</div>
        <p className="card-body">טוען נתונים חיים ממנוע האותות… (חישוב הדירוג יכול לקחת עד דקה-שתיים)</p>
      </div>
    );
  }
  if (screener.status === 'error') {
    return (
      <div className="card elev-sm">
        <div className="card-kicker">מדוע נבחרה המניה</div>
        <p className="card-body">נתוני הדירוג החיים אינם זמינים כרגע — לא נציג הסבר משוער במקומם.</p>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={retry}>נסה שוב</button>
      </div>
    );
  }
  const entry = screener.data.full_ranking.find((e) => e.ticker === ticker);
  if (!entry) {
    return (
      <div className="card elev-sm">
        <div className="card-kicker">מדוע נבחרה המניה</div>
        <p className="card-body">
          המניה אינה מופיעה בדירוג הנוכחי של מנוע האותות (הדירוג משקף את המצב היום, לא את יום הכניסה לפוזיציה).
        </p>
      </div>
    );
  }
  return (
    <div className="card elev-sm">
      <div className="card-kicker">נתוני מנוע האותות · נכון ל-{formatDate(screener.data.as_of)}</div>
      <p className="card-body">
        לפי הדירוג החי, <span dir="ltr">{entry.ticker}</span> נמצאת בירידה של {entry.drawdown_pct.toFixed(1)}% מהשיא
        של 52 השבועות האחרונים, עם ציון קומפוזיטי (עומק ירידה, מומנטום, נפח מסחר) של {entry.composite_score.toFixed(2)} מתוך
        1.00. סטטוס נוכחי במנוע: <span dir="ltr">{entry.signal}</span>.
      </p>
      <p className="card-body" style={{ opacity: 0.7 }}>
        האסטרטגיה מחזיקה 252 ימי מסחר ללא התאמות ידניות. נתונים היסטוריים אינם מבטיחים תוצאות עתידיות.
      </p>
    </div>
  );
}

export default function StockDetail() {
  const { ticker = '' } = useParams();
  const location = useLocation();
  const statePosition = (location.state as { position?: OpenPosition } | null)?.position;
  const [dashboard, retry] = useDashboard();
  const [tab, setTab] = useState<Tab>('overview');

  const position: OpenPosition | null =
    statePosition ??
    (dashboard.status === 'ready'
      ? dashboard.data.open_positions.map(mapOpenPosition).find((p) => p.ticker === ticker) ?? null
      : null);

  const holdTargetDays = dashboard.status === 'ready' ? dashboard.data.hold_target_days : 252;

  return (
    <div className="app-shell">
      <BackHeader title={ticker} />
      <main className="app-content">
        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {position ? (
            <div className="card elev-sm" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>כניסה ← נוכחי</div>
                <div dir="ltr" style={{ fontFamily: 'var(--font-heading)', fontSize: 16, marginTop: 2, textAlign: 'right' }}>
                  {position.entryPrice !== null ? `$${position.entryPrice.toFixed(2)}` : '—'} →{' '}
                  {position.currentPrice !== null ? `$${position.currentPrice.toFixed(2)}` : '—'}
                </div>
                {position.entryDate !== null && (
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 2 }}>
                    נקודת כניסה: <span dir="ltr">{formatDate(position.entryDate)}</span>
                  </div>
                )}
              </div>
              <div style={{ flex: 'none', textAlign: 'left' }}>
                <div
                  dir="ltr"
                  className={position.changePct !== null && position.changePct < 0 ? 'pct-loss' : 'pct-gain'}
                  style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}
                >
                  {position.changePct !== null ? formatPct(position.changePct) : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 2 }}>
                  {position.daysHeld !== null ? (
                    <>יום <span dir="ltr">{position.daysHeld} / {holdTargetDays}</span></>
                  ) : (
                    'ימי החזקה לא זמינים'
                  )}
                </div>
              </div>
            </div>
          ) : dashboard.status === 'loading' ? (
            <div className="skeleton" style={{ height: 64 }} />
          ) : (
            <div className="card elev-sm">
              <p className="card-body" style={{ margin: 0 }}>
                {dashboard.status === 'error'
                  ? 'נתוני הפוזיציה אינם זמינים כרגע — לא נציג נתונים משוערים.'
                  : 'הפוזיציה אינה מופיעה ברשימת הפוזיציות הפתוחות של מנוע האותות.'}
              </p>
              {dashboard.status === 'error' && (
                <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={retry}>נסה שוב</button>
              )}
            </div>
          )}

          <div className="seg" style={{ width: '100%' }}>
            {([['overview', 'סקירה'], ['reports', 'דוחות'], ['news', 'חדשות']] as const).map(([key, label]) => (
              <label key={key} className="seg-opt" style={{ flex: 1, justifyContent: 'center' }}>
                <input type="radio" name="stocktab" checked={tab === key} onChange={() => setTab(key)} />
                {label}
              </label>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <TradingViewWidget kind="advanced-chart" symbol={ticker} />
              {position?.entryPrice !== null && position?.entryDate != null && (
                <span className="card-meta">
                  נקודת הכניסה של האסטרטגיה: <span dir="ltr">${position.entryPrice.toFixed(2)} ({formatDate(position.entryDate)})</span> — הגרף מציג נתוני שוק מ-TradingView ואינו מסמן את נקודת הכניסה.
                </span>
              )}
              <Rationale ticker={ticker} />
            </>
          )}
          {tab === 'reports' && <TradingViewWidget kind="financials" symbol={ticker} />}
          {tab === 'news' && <TradingViewWidget kind="timeline" symbol={ticker} />}
        </div>
      </main>
    </div>
  );
}
