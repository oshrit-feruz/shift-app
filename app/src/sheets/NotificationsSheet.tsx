import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import type { AppNotification } from '../data/types';

/**
 * Notification center. Threshold alerts are informational-only: they carry the
 * fixed "alert only — no action taken" disclaimer at equal prominence, and the
 * only affordance is mark-as-read. Never a confirm/execute button.
 */
const NOTIFS: AppNotification[] = [
  {
    glyph: '▲',
    title: {
      en: 'NVDA crossed your +25% alert (currently +27% from entry)',
      he: 'NVDA חצתה את ההתראה שלך של +25% (כרגע +27% מנקודת הכניסה)',
    },
    detail: { en: 'Personal threshold alert', he: 'התראת סף אישית' },
    ago: { en: '4m', he: 'לפני 4 ד׳' },
    ticker: 'NVDA',
    unread: true,
    isThresholdAlert: true,
  },
  {
    glyph: '✎',
    title: { en: 'Reuters: NVIDIA lifts data-centre outlook', he: 'רויטרס: NVIDIA מעלה תחזית למרכזי נתונים' },
    detail: { en: 'News alert · 1 of 3 sources matched', he: 'התראת חדשות · 1 מ-3 מקורות' },
    ago: { en: '22m', he: 'לפני 22 ד׳' },
    ticker: 'NVDA',
    unread: true,
  },
  {
    glyph: '▾',
    title: { en: 'AMD fell below $150.00', he: 'AMD ירד מתחת ל-$150.00' },
    detail: { en: 'Price alert · repeating', he: 'התראת מחיר · חוזרת' },
    ago: { en: '1h', he: 'לפני שעה' },
    ticker: 'AMD',
    unread: false,
  },
  {
    glyph: '◫',
    title: { en: 'LLY reports tomorrow after the close', he: 'LLY מפרסמת מחר אחרי הנעילה' },
    detail: { en: 'Earnings reminder · Q3 results', he: 'תזכורת דוח · תוצאות רבעון 3' },
    ago: { en: '3h', he: 'לפני 3 ש׳' },
    ticker: 'LLY',
    unread: false,
  },
];

export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const unread = s.notificationsRead ? 0 : NOTIFS.filter((n) => n.unread).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('notif.title')}
      meta={unread ? t('notif.new', { n: unread }) : t('notif.caughtUp')}
      maxHeight="80%"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" fontSize={16} onClick={() => dispatch({ type: 'markNotificationsRead' })}>
          {t('notif.markAll')}
        </Button>
      </div>
      {NOTIFS.map((n, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 9,
            borderRadius: 'var(--radius-sm)',
            background: n.unread && !s.notificationsRead ? 'var(--sunk)' : 'transparent',
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!n.isThresholdAlert) {
                dispatch({ type: 'openStock', ticker: n.ticker });
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              minHeight: 40,
              border: 0,
              textAlign: 'start',
              font: 'inherit',
              color: 'inherit',
              cursor: n.isThresholdAlert ? 'default' : 'pointer',
              background: 'transparent',
              padding: 0,
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                flex: 'none',
                borderRadius: 8,
                background: 'var(--fill-selected)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 'var(--text-body)',
              }}
            >
              {n.glyph}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>
                {n.title[language]}
              </span>
              <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)', marginTop: 1 }}>
                {n.detail[language]}
              </span>
            </span>
            <span className="text-muted" style={{ fontSize: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
              {n.ago[language]}
            </span>
          </button>
          {n.isThresholdAlert && (
            <>
              {/* Equal-prominence disclaimer: same size as the title, not fine print. */}
              <p style={{ fontSize: 'var(--text-row)', lineHeight: 1.5, margin: 0 }}>
                {t('thresh.disclaimer')}
              </p>
              <Button
                variant="secondary"
                fontSize={16}
                minHeight={36}
                alignSelf="flex-start"
                onClick={() => dispatch({ type: 'markNotificationsRead' })}
              >
                {t('thresh.markRead')}
              </Button>
            </>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        block
        minHeight={42}
        fontSize={16}
        onClick={() => {
          dispatch({ type: 'go', screen: 'watch' });
          onClose();
        }}
      >
        {t('notif.manageRules')}
      </Button>
    </Sheet>
  );
}
