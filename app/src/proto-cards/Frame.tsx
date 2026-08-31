import type { ReactNode } from 'react';
import { AppBackground } from '../components/AppBackground';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';

/**
 * The context the card has to work in: the real ground, the real translucent
 * header and tab bar, a scroller of the real width. A surface that samples
 * what is behind it cannot be judged on a blank page.
 *
 * The chrome is identical across every variant on purpose — only the content
 * surfaces change, so the comparison stays clean.
 */
const TABS: { icon: IconName; label: string }[] = [
  { icon: 'home', label: 'Home' },
  { icon: 'watch', label: 'Watchlist' },
  { icon: 'news', label: 'News' },
  { icon: 'portfolio', label: 'Portfolio' },
  { icon: 'more', label: 'More' },
];

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="p-phone">
      <AppBackground />

      <div className="p-header glass-bar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="text-muted"
            style={{ fontSize: 'var(--text-micro)', letterSpacing: 'var(--track-micro)' }}
          >
            Sunday, 31 August
          </div>
          <div
            style={{
              fontSize: 'var(--text-heading)',
              fontWeight: 600,
              letterSpacing: 'var(--track-heading)',
            }}
          >
            Good morning, Oshrit
          </div>
        </div>
        <button className="p-icon-btn" type="button" aria-label="Search">
          <Icon name="search" size={18} />
        </button>
        <button className="p-icon-btn" type="button" aria-label="Notifications">
          <Icon name="bell" size={18} />
        </button>
      </div>

      <div className="scroll-y p-scroll">{children}</div>

      <nav className="p-tabbar glass-bar" aria-label="Sections">
        {TABS.map((tab, i) => (
          <button key={tab.label} type="button" className="p-tab" data-active={i === 0 ? '' : undefined}>
            <Icon name={tab.icon} size={20} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
