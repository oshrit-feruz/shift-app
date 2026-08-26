import { useState } from 'react';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { Button } from '../components/Button';
import { DataState } from '../components/DataState';
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
        <DataState state={earnings.state} onRetry={earnings.retry}>
          {(rows) => (
            <Card padding="4px 0" gap={0}>
              {rows.map((e, i) => (
                <ListRow
                  key={i}
                  padding="10px 13px"
                  title={<button
                    type="button"
                    onClick={() => dispatch({ type: 'openStock', ticker: e.ticker })}
                    style={{
                      width: '100%',
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
                      padding: 0,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Num size={14} weight={600}>
                        {e.ticker}
                      </Num>
                      <Tag variant="outline" fontSize={11}>
                        {e.when}
                      </Tag>
                      <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
                        <Num>{e.date}</Num>
                      </span>
                    </span>
                    <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {t('earn.epsEst')} <Num>{e.epsEst}</Num> · {t('earn.implied')} <Num>{e.impliedMove}</Num>
                    </span>
                  </button>}
                  trailing={
                    <Button variant="secondary" fontSize={12.5} minHeight={34} onClick={openAlert}>
                      {t('earn.remind')}
                    </Button>
                  }
                />
              ))}
            </Card>
          )}
        </DataState>
      ) : (
        <DataState state={news.state} onRetry={news.retry}>
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
                        <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', flex: 1 }}>
                          {a.source} · <Num>{a.time} ET</Num>
                        </span>
                        <Num size={13} style={{ color: signalColor(a.changePct) }}>
                          {pct(a.changePct)}
                        </Num>
                      </span>
                      <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-md)', lineHeight: 1.3, whiteSpace: 'normal' }}>
                        {a.headline}
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--fs-sm)', opacity: 0.78 }}>{a.summary}</span>
                    </Card>
                  ))}
                </div>
              );
            }
            return (
              <Card padding="4px 0" gap={0}>
                {feed.map((a, i) => (
                  <ListRow
                    key={i}
                    align="start"
                    padding="9px 12px"
                    onClick={() => dispatch({ type: 'openStock', ticker: a.ticker })}
                    leading={
                      <span className="text-muted" style={{ width: 38, fontSize: 'var(--fs-xs)', paddingTop: 1 }}>
                        <Num>{a.time}</Num>
                      </span>
                    }
                    title={
                      <span style={{ display: 'block', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-regular)', lineHeight: 1.35, whiteSpace: 'normal' }}>
                        {a.headline}
                      </span>
                    }
                    subtitle={`${a.source} · ${a.tag}`}
                    right={
                      <>
                        <Num size={12.5} weight={600} block>
                          {a.ticker}
                        </Num>
                        <Num size={12.5} block style={{ color: signalColor(a.changePct) }}>
                          {pct(a.changePct)}
                        </Num>
                      </>
                    }
                  />
                ))}
              </Card>
            );
          }}
        </DataState>
      )}
    </div>
  );
}
