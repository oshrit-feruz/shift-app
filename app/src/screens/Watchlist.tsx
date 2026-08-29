import { Card, CardTitle } from '../components/Card';
import { DemoDataNote } from '../components/DemoDataNote';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { ListRow } from '../components/ListRow';
import { WatchRowValues } from '../components/WatchRowValues';
import { TickerTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { Skeleton, SkeletonLine } from '../components/Skeleton';
import { useAppState, useDispatch, type SavedAlert } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT, type TFn } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import type { ScreenProps } from '../App';

/**
 * The user's own watchlist and the alerts they have created.
 *
 * Nothing on this screen is seeded. A new account arrives here with an empty
 * list and an empty alert card, both saying so and both offering the action
 * that fills them — a screen that opened with eight stocks nobody chose, and
 * four alerts nobody created, taught the user that adding a stock does
 * nothing, because the list looked the same before and after.
 *
 * Rows are driven by `s.watchlist`, not by an intersection with the sample
 * symbol table: the user can add any symbol, and one the table does not cover
 * renders with its real price and no invented company details rather than
 * silently vanishing from the list they just added it to.
 */
export function WatchlistScreen({ openAlert, openSearch }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  // Keyed on the list's contents, so adding or removing a stock refetches the
  // rows; the quote map behind it is cached, so this costs no extra request.
  const rows = useLoadable(() => demoService.watchRows(s.watchlist), [s.watchlist.join(',')]);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DemoDataNote />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 16, flex: 1 }}>
          {`${t('watch.alertsCount', { n: s.savedAlerts.length })} · ${t('watch.trackedCount', {
            n: s.watchlist.length,
          })}`}
        </span>
        <Button variant="secondary" fontSize={16} minHeight={36} onClick={openSearch}>
          ＋ {t('watch.addStock')}
        </Button>
      </div>

      <Card padding="12px 13px 4px" gap={4}>
        <CardTitle>{t('watch.tracking')}</CardTitle>
        <DataState
          state={rows.state}
          onRetry={rows.retry}
          skeleton={
            <>
              {/* One row per watched ticker, and rows whose ticker carries
                  alert tags get the taller subtitle the tags will occupy —
                  a flat row height would leave the tagged ones short. */}
              {s.watchlist.map((ticker, i) => (
                <ListRow
                  key={ticker}
                  divider={i > 0}
                  minHeight={52}
                  leading={<Skeleton width={26} height={26} radius="var(--radius-sm)" />}
                  title={<SkeletonLine width="38%" fontSize={18} />}
                  subtitle={
                    <span style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      {alertTags(s.savedAlerts, ticker, t).map((_, j) => (
                        <Skeleton key={j} width={j === 0 ? 58 : 44} height={25} radius={999} />
                      ))}
                    </span>
                  }
                  right={
                    <>
                      <SkeletonLine width={56} fontSize={17} />
                      <SkeletonLine width={38} fontSize={15.5} bar={9} />
                    </>
                  }
                  trailing={<Skeleton width={34} height={34} radius="var(--radius-sm)" />}
                />
              ))}
            </>
          }
        >
          {(list) =>
            list.length === 0 ? (
              <div style={{ padding: '10px 0 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 17 }}>{t('watch.empty')}</div>
                <p
                  className="text-muted"
                  style={{ fontSize: 15.5, margin: '4px auto 12px', maxWidth: 300, lineHeight: 1.45 }}
                >
                  {t('watch.emptyHelp')}
                </p>
                <Button fontSize={16} minHeight={38} alignSelf="center" onClick={openSearch}>
                  ＋ {t('watch.addStock')}
                </Button>
              </div>
            ) : (
              <>
                {list.map((x, i) => {
                  const tags = alertTags(s.savedAlerts, x.ticker, t);
                  return (
                    <ListRow
                      key={x.ticker}
                      divider={i > 0}
                      leading={<TickerTile ticker={x.ticker} size={26} />}
                      title={x.ticker}
                      subtitle={
                        tags.length > 0 ? (
                          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                            {tags.map((tag, j) => (
                              <Tag key={j} variant="accent" fontSize={14}>
                                {tag}
                              </Tag>
                            ))}
                          </span>
                        ) : (
                          // A symbol the sample table does not cover has no
                          // company name to show, and is not given one.
                          (x.name ?? t('watch.symbolOnly'))
                        )
                      }
                      right={<WatchRowValues row={x} />}
                      trailing={
                        <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                          <RowIconButton
                            label={t('watch.alertAria', { ticker: x.ticker })}
                            onClick={() => openAlert(x.ticker)}
                          >
                            ＋
                          </RowIconButton>
                          <RowIconButton
                            label={t('watch.removeAria', { ticker: x.ticker })}
                            muted
                            onClick={() => dispatch({ type: 'removeWatch', ticker: x.ticker })}
                          >
                            ✕
                          </RowIconButton>
                        </span>
                      }
                      minHeight={50}
                      onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                    />
                  );
                })}
              </>
            )
          }
        </DataState>
      </Card>

      <Card padding={13} gap={8}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('watch.activeAlerts')}</CardTitle>
          <div style={{ flex: 1 }} />
          {s.watchlist.length > 0 && (
            <Button variant="ghost" fontSize={16} onClick={() => openAlert()}>
              ＋ {t('watch.newAlert')}
            </Button>
          )}
        </div>
        {s.savedAlerts.length === 0 ? (
          <EmptyState>
            <div style={{ fontSize: 17 }}>{t('watch.noAlerts')}</div>
            <p
              className="text-muted"
              style={{ fontSize: 15.5, margin: '4px auto 0', maxWidth: 300, lineHeight: 1.45 }}
            >
              {t('watch.noAlertsHelp')}
            </p>
          </EmptyState>
        ) : (
          s.savedAlerts.map((alert) => {
            const line = alertLine(alert, t);
            return (
              <div
                key={alert.id}
                style={{
                  display: 'flex',
                  gap: 9,
                  paddingTop: 8,
                  borderTop: '1px solid var(--color-divider)',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    flex: 'none',
                    borderRadius: 7,
                    background: 'var(--color-accent-900)',
                    color: 'var(--color-accent-300)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 15,
                  }}
                >
                  {line.glyph}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17 }}>{line.title}</div>
                  {line.detail && (
                    <div className="text-muted" style={{ fontSize: 15.5 }}>
                      {line.detail}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  fontSize={15.5}
                  style={{ opacity: 0.7, padding: 0 }}
                  onClick={() => dispatch({ type: 'removeAlert', id: alert.id })}
                >
                  {t('watch.remove')}
                </Button>
              </div>
            );
          })
        )}
        {beg && s.savedAlerts.length > 0 && (
          <p className="text-muted" style={{ fontSize: 15.5, margin: '4px 0 0' }}>
            {t('watch.alertNudge')}
          </p>
        )}
      </Card>
    </div>
  );
}

/** The small square action button at the end of a watchlist row. */
function RowIconButton({
  label,
  muted,
  onClick,
  children,
}: {
  label: string;
  muted?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // The whole row navigates to the stock page; these two do not.
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 34,
        height: 34,
        flex: 'none',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-divider)',
        background: 'transparent',
        color: muted ? 'var(--muted)' : 'var(--color-accent)',
        fontSize: 18,
        cursor: 'pointer',
      }}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/**
 * The tags shown under a watchlist row: one per alert the user has saved for
 * that ticker. These used to be a hard-coded table keyed by ticker, which
 * meant NVDA always looked like it had two alerts and anything the user
 * actually created showed nothing.
 */
function alertTags(alerts: SavedAlert[], ticker: string, t: TFn): string[] {
  return alerts
    .filter((a) => a.ticker === ticker)
    .map((a) =>
      a.kind === 'price'
        ? `$${a.value} ${a.condition === 'rise' ? '▲' : '▼'}`
        : a.kind === 'news'
          ? t('alert.newsType')
          : t('alert.earnType'),
    );
}

/** One saved alert as the glyph + two lines the alert card renders. */
function alertLine(alert: SavedAlert, t: TFn): { glyph: string; title: string; detail: string } {
  // The sheet lets both channels be cleared, so this can legitimately be
  // empty — and an empty half must not leave a separator hanging off the end
  // of the line, or an alert with no detail at all rendering a blank row.
  const notify = [alert.notifyBy.push ? t('alert.push') : '', alert.notifyBy.email ? t('alert.email') : '']
    .filter(Boolean)
    .join(', ');
  if (alert.kind === 'price') {
    return {
      glyph: alert.condition === 'rise' ? '▲' : '▼',
      title: `${alert.ticker} ${t(alert.condition === 'rise' ? 'alert.rises' : 'alert.falls')} $${alert.value}`,
      detail: notify,
    };
  }
  if (alert.kind === 'news') {
    return {
      glyph: '◎',
      title: `${alert.ticker} ${t('alert.newsType')} “${alert.value}”`,
      detail: notify,
    };
  }
  const remindKey =
    alert.remind === 'day'
      ? 'alert.dayBefore'
      : alert.remind === 'morning'
        ? 'alert.morningOf'
        : 'alert.whenLands';
  return {
    glyph: '📅',
    title: `${alert.ticker} ${t('alert.earnType')}`,
    detail: [t(remindKey), notify].filter(Boolean).join(' · '),
  };
}
