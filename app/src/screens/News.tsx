import { useState } from 'react';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { Button } from '../components/Button';
import { DataState, EmptyState } from '../components/DataState';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { pct, signalColor } from '../lib/format';
import { ArticleSheet } from '../sheets/ArticleSheet';
import type { NewsItem } from '../data/types';
import type { StringKey } from '../i18n/strings';
import type { ScreenProps } from '../App';

const TABS: Array<[string, StringKey]> = [
  ['All', 'news.all'],
  ['My watchlist', 'news.myWatchlist'],
  ['Markets', 'news.markets'],
  ['Calendar', 'news.calendar'],
  ['Analyst', 'news.analyst'],
];

/** News feed with the earnings calendar folded in as a tab (per design). */
export function NewsScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tab, setTab] = useState('All');
  const [calFilter, setCalFilter] = useState<'all' | 'watchlist' | 'highMove'>('all');
  const [calDay, setCalDay] = useState<string | null>(null);
  const [article, setArticle] = useState<NewsItem | null>(null);
  const news = useLoadable(() => demoService.news(), []);
  const earnings = useLoadable(() => demoService.earnings(), []);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <ChipRail>
        {TABS.map(([k, key]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {k === 'Calendar' && <Icon name="calendar" size={14} strokeWidth={1.9} />}
            {t(key)}
          </Chip>
        ))}
      </ChipRail>

      {tab === 'Calendar' ? (
        <DataState
          state={earnings.state}
          onRetry={earnings.retry}
          skeleton={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Card padding={13} gap={7}>
                <Skeleton width={140} height={13} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <Skeleton width={92} height={26} radius={999} />
                  <Skeleton width={92} height={26} radius={999} />
                </div>
              </Card>
              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} width={68} height={62} radius="var(--radius-md)" />
                ))}
              </div>
              {Array.from({ length: 3 }, (_, i) => (
                <Card key={i} padding="4px 0" gap={0}>
                  <div style={{ padding: '9px 13px 6px' }}>
                    <Skeleton width={90} height={11} />
                  </div>
                  {Array.from({ length: 2 }, (_, j) => (
                    <div
                      key={j}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 13px',
                        borderTop: '1px solid var(--color-divider)',
                      }}
                    >
                      <Skeleton width={40} height={40} radius="var(--radius-md)" />
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Skeleton width="38%" height={11} />
                        <Skeleton width="62%" height={9} />
                      </span>
                      <Skeleton width={62} height={22} radius={999} />
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          }
        >
          {(rows) => {
            // Filter first, then group — a filter that emptied a day should
            // drop that day's header too, not leave a heading with nothing
            // under it.
            const filtered = rows.filter((e) => {
              if (calFilter === 'watchlist') return s.watchlist.includes(e.ticker);
              if (calFilter === 'highMove') return parseFloat(e.impliedMove.replace(/[±%]/g, '')) >= 7;
              return true;
            });

            // One group per date, the way a calendar groups a day's events
            // under its own header rather than repeating the date on every
            // row. EARNINGS is already date-sorted; grouping preserves that
            // order rather than re-sorting, so nothing here invents an order
            // the data doesn't already have.
            const byDate: Array<[string, typeof rows]> = [];
            for (const e of filtered) {
              const last = byDate[byDate.length - 1];
              if (last && last[0] === e.date) last[1].push(e);
              else byDate.push([e.date, [e]]);
            }
            const shown = calDay ? byDate.filter(([date]) => date === calDay) : byDate;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <Card padding={13} gap={7}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{t('title.earnings')}</span>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>
                      {t('earn.weekOf', { n: rows.length })}
                    </span>
                  </div>
                  <ChipRail>
                    <Chip active={calFilter === 'all'} onClick={() => setCalFilter('all')}>
                      {t('earn.allCompanies')}
                    </Chip>
                    <Chip active={calFilter === 'watchlist'} onClick={() => setCalFilter('watchlist')}>
                      {t('earn.myWatchlist')}
                    </Chip>
                    <Chip active={calFilter === 'highMove'} onClick={() => setCalFilter('highMove')}>
                      {t('earn.highMove')}
                    </Chip>
                  </ChipRail>
                </Card>

                {/* Week-at-a-glance day strip. Tapping a day filters the
                    cards below to it; tapping the active day again clears
                    the filter, since a calendar's day picker toggles rather
                    than getting stuck selected. */}
                <ChipRail>
                  {byDate.map(([date, events]) => {
                    const [weekday, day] = date.split(' ');
                    const active = calDay === date;
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setCalDay(active ? null : date)}
                        style={{
                          flex: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                          width: 68,
                          padding: '8px 6px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                          background: active ? 'var(--color-accent-900)' : 'var(--color-surface)',
                          color: 'inherit',
                          font: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          className="text-muted"
                          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}
                        >
                          {weekday}
                        </span>
                        <Num size={17} weight={700}>
                          {day}
                        </Num>
                        <span className="text-muted" style={{ fontSize: 10 }}>
                          {t('earn.reports', { n: events.length })}
                        </span>
                      </button>
                    );
                  })}
                </ChipRail>

                {shown.length === 0 ? (
                  <EmptyState>{t('earn.noneMatch')}</EmptyState>
                ) : (
                  shown.map(([date, events]) => {
                    // "Mon 25" -> weekday + day number, read onto a torn-page
                    // calendar tile (small weekday over a large day number).
                    const [weekday, day] = date.split(' ');
                    return (
                      <Card key={date} padding="4px 0" gap={0}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px 7px' }}>
                          <Icon name="calendar" size={14} strokeWidth={1.9} />
                          <span
                            className="text-muted"
                            style={{ fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}
                          >
                            <Num>{date}</Num>
                          </span>
                        </div>
                        {events.map((e, i) => {
                          const surprise = parseFloat(e.lastSurprise);
                          return (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                gap: 10,
                                padding: '10px 13px',
                                borderTop: '1px solid var(--color-divider)',
                              }}
                            >
                              {/* The calendar-page tile: weekday strip over a
                                  big day number, same date this card's header
                                  carries. */}
                              <span
                                aria-hidden
                                style={{
                                  flex: 'none',
                                  width: 40,
                                  height: 40,
                                  borderRadius: 'var(--radius-md)',
                                  overflow: 'hidden',
                                  border: '1px solid var(--color-divider)',
                                  textAlign: 'center',
                                }}
                              >
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: '.04em',
                                    textTransform: 'uppercase',
                                    color: '#fff',
                                    background: 'var(--down)',
                                    padding: '2px 0',
                                  }}
                                >
                                  {weekday}
                                </span>
                                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, padding: '3px 0' }}>
                                  <Num>{day}</Num>
                                </span>
                              </span>
                              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'openStock', ticker: e.ticker })}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: 2,
                                    border: 0,
                                    background: 'transparent',
                                    color: 'inherit',
                                    font: 'inherit',
                                    cursor: 'pointer',
                                    textAlign: 'start',
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <Num size={14} weight={600}>
                                      {e.ticker}
                                    </Num>
                                    <Tag variant="outline" fontSize={11}>
                                      {e.when}
                                    </Tag>
                                    <span className="text-muted" style={{ fontSize: 12.5 }}>
                                      {e.name}
                                    </span>
                                  </span>
                                </button>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    columnGap: 12,
                                    rowGap: 2,
                                    fontSize: 11.5,
                                  }}
                                >
                                  <Stat label={t('earn.mktCap')} value={e.mktCap} />
                                  <Stat label={t('earn.epsEst')} value={e.epsEst} />
                                  <Stat label={t('earn.revEst')} value={e.revEst} />
                                  <Stat label={t('earn.implied')} value={e.impliedMove} />
                                  <Stat
                                    label={t('earn.lastSurprise')}
                                    value={e.lastSurprise}
                                    color={Number.isNaN(surprise) ? undefined : signalColor(surprise)}
                                  />
                                </div>
                                <Button
                                  variant="secondary"
                                  fontSize={12.5}
                                  minHeight={32}
                                  alignSelf="flex-start"
                                  onClick={openAlert}
                                >
                                  {t('earn.remind')}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </Card>
                    );
                  })
                )}
              </div>
            );
          }}
        </DataState>
      ) : (
        <DataState
          state={news.state}
          onRetry={news.retry}
          skeleton={
            beg ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {/* Card count and height measured off the loaded feed. */}
                {Array.from({ length: 7 }, (_, i) => (
                  <SkeletonCard key={i} height={141} padding={14} />
                ))}
              </div>
            ) : (
              <Card padding="4px 13px" gap={0}>
                <SkeletonList count={6} leading={false} minHeight={62} firstDivider />
              </Card>
            )
          }
        >
          {(items) => {
            const feed = items.filter(
              (a) =>
                tab === 'All' ||
                (tab === 'My watchlist'
                  ? s.watchlist.includes(a.ticker)
                  : tab === 'Analyst'
                    ? a.tag === 'Analyst'
                    : true),
            );
            if (beg) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {feed.map((a, i) => (
                    <Card key={i} padding={14} gap={5} onClick={() => setArticle(a)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Tag variant="accent" fontSize={12}>
                          {a.ticker}
                        </Tag>
                        <span className="text-muted" style={{ fontSize: 12.5, flex: 1 }}>
                          {a.source} · <Num>{a.time} ET</Num>
                        </span>
                        <Num size={13} style={{ color: signalColor(a.changePct) }}>
                          {pct(a.changePct)}
                        </Num>
                      </span>
                      <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 14.5, lineHeight: 1.3, whiteSpace: 'normal' }}>
                        {a.headline}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, opacity: 0.78 }}>{a.summary}</span>
                    </Card>
                  ))}
                </div>
              );
            }
            return (
              <Card padding="4px 0" gap={0}>
                {feed.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setArticle(a)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 9,
                      width: '100%',
                      padding: '9px 12px',
                      border: 0,
                      borderTop: '1px solid var(--color-divider)',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'start',
                    }}
                  >
                    <span className="text-muted" style={{ width: 38, fontSize: 12.5, paddingTop: 1 }}>
                      <Num>{a.time}</Num>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.35, whiteSpace: 'normal' }}>{a.headline}</span>
                      <span className="text-muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
                        {a.source} · {a.tag}
                      </span>
                    </span>
                    <span style={{ textAlign: 'end' }}>
                      <Num size={12.5} weight={600} block>
                        {a.ticker}
                      </Num>
                      <Num size={12.5} block style={{ color: signalColor(a.changePct) }}>
                        {pct(a.changePct)}
                      </Num>
                    </span>
                  </button>
                ))}
              </Card>
            );
          }}
        </DataState>
      )}
      <ArticleSheet item={article} onClose={() => setArticle(null)} />
    </div>
  );
}

/** One label:value pair in an earnings row's stats line. */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <span className="text-muted">{label}</span>
      <Num weight={600} style={{ color }}>
        {value}
      </Num>
    </span>
  );
}
