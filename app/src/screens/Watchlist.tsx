import type { ReactNode } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Tag } from '../components/Tag';
import { ListRow } from '../components/ListRow';
import { WatchRowValues } from '../components/WatchRowValues';
import { TickerTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { Skeleton, SkeletonLine } from '../components/Skeleton';
import { useAppState, useDispatch, type SavedAlert } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT, type TFn } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { PRICE_REFRESH_MS } from '../data/quotes';
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
  const toast = useToast();
  const beg = mode === 'beginner';
  // Keyed on the list's contents, so adding or removing a stock refetches the
  // rows; the quote map behind it is cached, so this costs no extra request.
  const rows = useLoadable(
    () => demoService.watchRows(s.watchlist),
    [s.watchlist.join(',')],
    PRICE_REFRESH_MS,
  );

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 'var(--text-body)', flex: 1 }}>
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
                      {alertTags(s.savedAlerts, ticker, t).length > 0 && (
                        <Skeleton width={96} height={25} radius={999} />
                      )}
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
                <div style={{ fontSize: 'var(--text-row)' }}>{t('watch.empty')}</div>
                <p
                  className="text-muted"
                  style={{
                    fontSize: 'var(--text-caption)',
                    margin: '4px auto 12px',
                    maxWidth: 300,
                    lineHeight: 1.45,
                  }}
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
                  const alertTag = rowAlertTag(s.savedAlerts, x.ticker, t);
                  return (
                    <ListRow
                      key={x.ticker}
                      divider={i > 0}
                      leading={<TickerTile ticker={x.ticker} size={36} />}
                      title={x.ticker}
                      subtitle={
                        alertTag ? (
                          <span
                            style={{ display: 'flex', gap: 4, marginTop: 3, minWidth: 0 }}
                            aria-label={t('watch.alertsForAria', { n: alertTag.count, ticker: x.ticker })}
                          >
                            <Tag variant="accent" fontSize={14}>
                              {alertTag.label}
                            </Tag>
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
                            <Icon name="plus" size={16} strokeWidth={2} />
                          </RowIconButton>
                          <RowIconButton
                            label={t('watch.removeAria', { ticker: x.ticker })}
                            muted
                            onClick={() => {
                              dispatch({ type: 'removeWatch', ticker: x.ticker });
                              toast(t('toast.removed', { ticker: x.ticker }));
                            }}
                          >
                            <Icon name="close" size={16} strokeWidth={2} />
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
            <div style={{ fontSize: 'var(--text-row)' }}>{t('watch.noAlerts')}</div>
            <p
              className="text-muted"
              style={{
                fontSize: 'var(--text-caption)',
                margin: '4px auto 0',
                maxWidth: 300,
                lineHeight: 1.45,
              }}
            >
              {t('watch.noAlertsHelp')}
            </p>
          </EmptyState>
        ) : (
          // Grouped by stock rather than one flat list: the ticker is the one
          // thing every alert on a stock repeats, so it is said once, in a
          // header, and each alert below it is only what it watches for.
          groupByTicker(s.savedAlerts).map((group, gi) => (
            <div
              key={group.ticker}
              style={{
                paddingTop: 8,
                borderTop: gi > 0 ? '1px solid var(--color-divider)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TickerTile ticker={group.ticker} size={22} />
                <span style={{ fontSize: 'var(--text-row)' }}>{group.ticker}</span>
                <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
                  {group.alerts.length === 1
                    ? t('watch.oneAlert')
                    : t('watch.alertCount', { n: group.alerts.length })}
                </span>
              </div>
              {group.alerts.map((alert) => {
                const line = alertLine(alert, t);
                return (
                  <div
                    key={alert.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      paddingTop: 6,
                      // Aligned under the group's ticker name, so the column of
                      // alerts reads as belonging to it.
                      marginInlineStart: 30,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        flex: 'none',
                        borderRadius: 7,
                        background: 'var(--fill-selected)',
                        color: 'var(--color-accent-300)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 'var(--text-caption)',
                      }}
                    >
                      {line.glyph}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-row)' }}>{line.title}</div>
                      {line.detail && (
                        <div className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
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
              })}
            </div>
          ))
        )}
        {beg && s.savedAlerts.length > 0 && (
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: '4px 0 0' }}>
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="row-icon-btn"
      onClick={(e) => {
        // The whole row navigates to the stock page; these two do not.
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 34,
        height: 34,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-divider)',
        color: muted ? 'var(--muted)' : 'var(--color-accent)',
        cursor: 'pointer',
      }}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/**
 * One short label per alert the user has saved for that ticker. These used to
 * be a hard-coded table keyed by ticker, which meant NVDA always looked like
 * it had two alerts and anything the user actually created showed nothing.
 */
function alertTags(alerts: SavedAlert[], ticker: string, t: TFn): string[] {
  return alerts.filter((a) => a.ticker === ticker).map((a) => alertTag(a, t));
}

/**
 * A stored level as it should read on screen, with exactly one currency
 * symbol. The field accepts "$1,000" — `readLevel` strips the symbol and the
 * commas — and the value is stored as typed, so prepending another "$" here
 * would print "$$1,000".
 */
export function levelLabel(value: string): string {
  const level = value.trim();
  return level.startsWith('$') ? level : `$${level}`;
}

/** One alert as a pill: the level for a price rule, the kind's name for the others. */
function alertTag(a: SavedAlert, t: TFn): string {
  if (a.kind === 'price') return `${levelLabel(a.value)} ⇅`;
  return t(a.kind === 'news' ? 'alert.newsType' : 'alert.earnType');
}

/**
 * What a watchlist row says about the alerts on its stock: the alert itself
 * when there is one, and how many there are when there are more.
 *
 * A row is one line, and its subtitle is a single clipped line by design
 * (ListRow) — so printing every alert as its own pill did not make a taller
 * row, it made pills that ran under the price and off the edge, and the more
 * alerts a stock had the less of them could be read. One pill always fits,
 * whether the stock carries two alerts or twenty, and the card below is where
 * the full list lives.
 */
function rowAlertTag(alerts: SavedAlert[], ticker: string, t: TFn): { label: string; count: number } | null {
  const all = alertTags(alerts, ticker, t);
  if (all.length === 0) return null;
  return { label: all.length === 1 ? all[0] : t('watch.alertCount', { n: all.length }), count: all.length };
}

/**
 * The saved alerts, gathered under the stock they watch, in the order their
 * stocks first appear in the list.
 */
function groupByTicker(alerts: SavedAlert[]): Array<{ ticker: string; alerts: SavedAlert[] }> {
  const groups = new Map<string, SavedAlert[]>();
  for (const a of alerts) {
    const group = groups.get(a.ticker);
    if (group) group.push(a);
    else groups.set(a.ticker, [a]);
  }
  return [...groups].map(([ticker, list]) => ({ ticker, alerts: list }));
}

/**
 * One saved alert as the glyph + two lines the alert card renders. The ticker
 * is not repeated here — the group header above the line carries it.
 */
function alertLine(alert: SavedAlert, t: TFn): { glyph: string; title: string; detail: string } {
  // The sheet lets both channels be cleared, so this can legitimately be
  // empty — and an empty half must not leave a separator hanging off the end
  // of the line, or an alert with no detail at all rendering a blank row.
  const notify = [alert.notifyBy.push ? t('alert.push') : '', alert.notifyBy.email ? t('alert.email') : '']
    .filter(Boolean)
    .join(', ');
  if (alert.kind === 'price') {
    return {
      glyph: '⇅',
      title: `${t('alert.crosses')} ${levelLabel(alert.value)}`,
      detail: notify,
    };
  }
  if (alert.kind === 'news') {
    return {
      glyph: '◎',
      title: `${t('alert.newsType')} “${alert.value}”`,
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
    title: t('alert.earnType'),
    detail: [t(remindKey), notify].filter(Boolean).join(' · '),
  };
}
