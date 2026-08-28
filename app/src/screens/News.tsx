import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, ChipRail } from '../components/Chip';
import { useAppState } from '../state/appState';
import { useT } from '../i18n/useT';
import type { StringKey } from '../i18n/strings';
import { CalendarTab } from './news/CalendarTab';
import { MarketFeed, WatchlistFeed } from './news/LiveFeed';
import { TabPanel } from '../components/TabPanel';
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
  // The earnings calendar is a tab on this screen, but it is also a
  // destination of its own — "all earnings" on the home screen navigates to
  // `earnings`. Landing on the news feed instead would quietly answer a
  // different question than the one asked.
  const [tab, setTab] = useState(s.screen === 'earnings' ? 'Calendar' : 'All');
  // Both routes render this same component, so navigating between them does
  // not remount it and the initial state above would not run again.
  useEffect(() => {
    if (s.screen === 'earnings') setTab('Calendar');
  }, [s.screen]);

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

      <TabBody tab={tab} watchlist={s.watchlist} />
    </div>
  );
}

/**
 * Which feed a tab shows.
 *
 * All / Markets / Analyst share the one general market feed: upstream has no
 * topic filter this app can trust to be exhaustive, and splitting a real feed
 * client-side would present a guess as a category. They read the same data
 * rather than pretending to filter it.
 *
 * Each feed sits in a keep-alive TabPanel: switching tabs hides it instead
 * of unmounting it, so coming back shows the loaded feed immediately —
 * which matters most for the watchlist feed, whose load fans out one
 * request per watched ticker.
 */
function TabBody({ tab, watchlist }: { tab: string; watchlist: string[] }) {
  const market = tab !== 'Calendar' && tab !== 'My watchlist';
  return (
    <>
      <TabPanel gap={11} active={market}>
        <MarketFeed />
      </TabPanel>
      <TabPanel gap={11} active={tab === 'My watchlist'}>
        <WatchlistFeed tickers={watchlist} />
      </TabPanel>
      <TabPanel gap={11} active={tab === 'Calendar'}>
        <CalendarTab watchlist={watchlist} />
      </TabPanel>
    </>
  );
}
