import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import type { AppNotification } from '../data/types';

/**
 * Notification center. Entries derive ONLY from alert rules the user actually
 * configured (personal thresholds, created alerts) — never from placeholder
 * events — and each demo-fired entry is labeled as a demo trigger. Threshold
 * alerts are informational-only: they carry the fixed "alert only — no action
 * taken" disclaimer at equal prominence, and the only affordance is
 * mark-as-read. Never a confirm/execute button.
 */
export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();

  const notifs: AppNotification[] = [];
  if (s.alertUpThreshold) {
    notifs.push({
      glyph: '▲',
      title: {
        en: `NVDA crossed your +${s.alertUpThreshold}% alert`,
        he: `NVDA חצתה את ההתראה שלך של +${s.alertUpThreshold}%`,
      },
      detail: { en: 'Personal threshold alert', he: 'התראת סף אישית' },
      ago: { en: 'demo', he: 'הדגמה' },
      ticker: 'NVDA',
      unread: true,
      isThresholdAlert: true,
    });
  }
  for (const a of s.alerts) {
    notifs.push({
      glyph: a.kind === 'price' ? (a.direction === 'fall' ? '▾' : '▲') : a.kind === 'earn' ? '◫' : '✎',
      title: {
        en:
          a.kind === 'price'
            ? `${a.ticker} ${a.direction === 'fall' ? 'fell below' : 'rose above'} $${a.level ?? '—'}`
            : a.kind === 'earn'
              ? `${a.ticker} reports soon`
              : `${a.ticker} news alert matched`,
        he:
          a.kind === 'price'
            ? `${a.ticker} ${a.direction === 'fall' ? 'ירד מתחת ל-' : 'עלה מעל '}$${a.level ?? '—'}`
            : a.kind === 'earn'
              ? `${a.ticker} מפרסמת דוח בקרוב`
              : `התראת החדשות על ${a.ticker} הופעלה`,
      },
      detail: { en: 'From your alert rule', he: 'מכלל ההתראה שלך' },
      ago: { en: 'demo', he: 'הדגמה' },
      ticker: a.ticker,
      unread: false,
    });
  }
  const NOTIFS = notifs;
  const unread = s.notificationsRead ? 0 : NOTIFS.filter((n) => n.unread).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('notif.title')}
      meta={unread ? t('notif.new', { n: unread }) : t('notif.caughtUp')}
      maxHeight="80%"
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Tag variant="neutral" fontSize={11}>
          {t('data.demo')}
        </Tag>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'markNotificationsRead' })}>
          {t('notif.markAll')}
        </Button>
      </div>
      {NOTIFS.length === 0 && (
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, textAlign: 'center', padding: '10px 0' }}>
          {t('notif.caughtUp')}
        </p>
      )}
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
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-accent-900)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 'var(--fs-sm)',
              }}
            >
              {n.glyph}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--fs-md)', whiteSpace: 'normal' }}>{n.title[language]}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', marginTop: 1 }}>
                {n.detail[language]}
              </span>
            </span>
            <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
              {n.ago[language]}
            </span>
          </button>
          {n.isThresholdAlert && (
            <>
              {/* Equal-prominence disclaimer: same size as the title, not fine print. */}
              <p style={{ fontSize: 'var(--fs-md)', lineHeight: 1.5, margin: 0, whiteSpace: 'normal' }}>{t('thresh.disclaimer')}</p>
              <Button
                variant="secondary"
                fontSize={13}
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
        fontSize={13}
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
