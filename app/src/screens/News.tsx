import { useState } from 'react';
import { Card } from '../components/Card';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { Button } from '../components/Button';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonCard, SkeletonList } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { pct, signalColor } from '../lib/format';
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
  const news = useLoadable(() => demoService.news(), []);
  const earnings = useLoadable(() => demoService.earnings(), []);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <ChipRail>
        {TABS.map(([k, key]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(key)}
          </Chip>
        ))}
      </ChipRail>

      {tab === 'Calendar' ? (
        <DataState
          state={earnings.state}
          onRetry={earnings.retry}
          skeleton={
            <Card padding="4px 0" gap={0}>
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
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
          }
        >
          {(rows) => (
            <Card padding="4px 0" gap={0}>
              {rows.map((e, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderTop: '1px solid var(--color-divider)' }}
                >
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'openStock', ticker: e.ticker })}
                    style={{
                      flex: 1,
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
                      <span className="text-muted" style={{ fontSize: 13 }}>
                        <Num>{e.date}</Num>
                      </span>
                    </span>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>
                      {t('earn.epsEst')} <Num>{e.epsEst}</Num> · {t('earn.implied')} <Num>{e.impliedMove}</Num>
                    </span>
                  </button>
                  <Button variant="secondary" fontSize={12.5} minHeight={34} onClick={openAlert}>
                    {t('earn.remind')}
                  </Button>
                </div>
              ))}
            </Card>
          )}
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
                    <Card key={i} padding={14} gap={5} onClick={() => dispatch({ type: 'openStock', ticker: a.ticker })}>
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
                    onClick={() => dispatch({ type: 'openStock', ticker: a.ticker })}
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
    </div>
  );
}
