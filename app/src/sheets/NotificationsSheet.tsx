import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { DataState } from '../components/DataState';
import { SkeletonLine } from '../components/Skeleton';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { agoLabel, type AppNotification } from '../data/notifications';
import type { NotificationCentre } from '../data/useNotifications';

/**
 * Notification centre: what the alert engine fired for this user, newest
 * first, read from the `notifications` table (data/notifications.ts).
 *
 * Threshold alerts are informational-only: they carry the fixed "alert only
 * — no action taken" disclaimer at equal prominence, and the only affordance
 * is mark-as-read. Never a confirm/execute button. Every other kind opens
 * the stock it is about.
 *
 * Signed out, the sheet says so rather than showing an empty list: there are
 * no notifications for nobody, and "all caught up" would claim a state that
 * was never checked.
 */
export function NotificationsSheet({
  open,
  onClose,
  centre,
}: {
  open: boolean;
  onClose: () => void;
  centre: NotificationCentre;
}) {
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const { list, unread, markOne, markAll, retry, signedIn } = centre;
  const now = new Date();

  const openStock = (n: AppNotification) => {
    markOne(n.id);
    dispatch({ type: 'openStock', ticker: n.ticker });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('notif.title')}
      meta={signedIn ? (unread ? t('notif.new', { n: unread }) : t('notif.caughtUp')) : undefined}
      maxHeight="80%"
    >
      {!signedIn ? (
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.45 }}>
          {t('notif.signIn')}
        </p>
      ) : (
        <DataState
          state={list}
          onRetry={retry}
          skeleton={
            <>
              <SkeletonLine width="90%" />
              <SkeletonLine width="70%" />
            </>
          }
        >
          {(rows) =>
            rows.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.45 }}>
                {t('notif.empty')}
              </p>
            ) : (
              <>
                {unread > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="ghost" fontSize={16} onClick={markAll}>
                      {t('notif.markAll')}
                    </Button>
                  </div>
                )}
                {rows.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 9,
                      borderRadius: 'var(--radius-sm)',
                      background: n.unread ? 'var(--sunk)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.isThresholdAlert) openStock(n);
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
                        {GLYPH[n.kind]}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-row)', whiteSpace: 'normal' }}>
                          {n.title[language]}
                        </span>
                        <span
                          className="text-muted"
                          style={{ display: 'block', fontSize: 'var(--text-caption)', marginTop: 1 }}
                        >
                          {n.detail[language]}
                        </span>
                      </span>
                      <span
                        className="text-muted"
                        style={{ fontSize: 'var(--text-caption)', whiteSpace: 'nowrap' }}
                      >
                        {agoLabel(n.createdAt, now, language)}
                      </span>
                    </button>
                    {n.isThresholdAlert && (
                      <>
                        {/* Equal-prominence disclaimer: same size as the title, not fine print. */}
                        <p
                          style={{
                            fontSize: 'var(--text-row)',
                            lineHeight: 1.5,
                            margin: 0,
                            whiteSpace: 'normal',
                          }}
                        >
                          {t('thresh.disclaimer')}
                        </p>
                        {n.unread && (
                          <Button
                            variant="secondary"
                            fontSize={16}
                            minHeight={36}
                            alignSelf="flex-start"
                            onClick={() => markOne(n.id)}
                          >
                            {t('thresh.markRead')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </>
            )
          }
        </DataState>
      )}
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

/** The same glyphs the alert sheet and the watchlist card use for each kind. */
const GLYPH: Record<AppNotification['kind'], string> = {
  price: '▲',
  threshold: '▲',
  news: '◎',
  earn: '📅',
};
