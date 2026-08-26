import { Icon, type IconName } from './Icon';
import type { Screen } from '../state/appState';

const TABS: Array<{ screen: Screen; icon: IconName }> = [
  { screen: 'home', icon: 'home' },
  { screen: 'watch', icon: 'watch' },
  { screen: 'news', icon: 'news' },
  { screen: 'pf', icon: 'portfolio' },
  { screen: 'more', icon: 'more' },
];

/** Bottom tab bar — blurred header ground, centered icons. */
export function TabBar({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  return (
    <div
      style={{
        flex: 'none',
        padding: '6px 8px calc(14px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--color-divider)',
        background: 'var(--hdr)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
      }}
    >
      {TABS.map((t) => {
        const active = current === t.screen;
        return (
          <button
            key={t.screen}
            type="button"
            onClick={() => onGo(t.screen)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minHeight: 48,
              padding: '7px 0',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              color: active
                ? 'var(--color-accent-200)'
                : 'color-mix(in srgb, var(--color-text) 45%, transparent)',
            }}
          >
            <Icon name={t.icon} size={24} strokeWidth={1.7} />
          </button>
        );
      })}
    </div>
  );
}
