import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, ChipRail } from '../components/Chip';
import { useAppState } from '../state/appState';
import { useT } from '../i18n/useT';
import type { StringKey } from '../i18n/strings';
import { CalendarTab } from './news/CalendarTab';
import { MarketFeed, WatchlistFeed } from './news/LiveFeed';
import type { ScreenProps } from '../App';

const TABS: Array<[string, StringKey]> = [
  ['All', 'news.all'],
  ['My watchlist', 'news.myWatchlist'],
  ['Markets', 'news.markets'],
  ['Calendar', 'news.calendar'],
  ['Analyst', 'news.analyst'],
];

/** News feed with the earnings calendar folded in as a tab (per design). */
export function NewsScreen(_props: ScreenProps) {
  const s = useAppState();
  const t = useT();
  const [tab, setTab] = useState('All');

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
        <CalendarTab watchlist={s.watchlist} />
      ) : tab === 'My watchlist' ? (
        <WatchlistFeed tickers={s.watchlist} />
      ) : (
        /* All / Markets / Analyst all read the one general market feed.
           Upstream has no topic filter this app can trust to be exhaustive,
           and inventing a client-side split of a real feed would present a
           guess as a category — so they share the feed rather than pretending
           to filter it. */
        <MarketFeed />
      )}
    </div>
  );
}
