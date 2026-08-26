import { Icon, type IconName } from './Icon';
import type { Screen } from '../state/appState';
import { useT } from '../i18n/useT';
import type { StringKey } from '../i18n/strings';

const TABS: Array<{ screen: Screen; icon: IconName; label: StringKey }> = [
  { screen: 'home', icon: 'home', label: 'nav.home' },
  { screen: 'watch', icon: 'watch', label: 'nav.watch' },
  { screen: 'news', icon: 'news', label: 'nav.news' },
  { screen: 'pf', icon: 'portfolio', label: 'nav.pf' },
  { screen: 'more', icon: 'more', label: 'nav.more' },
];

/** Bottom tab bar — blurred header ground, centered icons. */
export function TabBar({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  const translate = useT();
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
            aria-label={translate(t.label)}
            onClick={() => onGo(t.screen)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minHeight: 52,
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
            <Icon name={t.icon} size={22} strokeWidth={1.7} />
            <span style={{ fontSize: 10.5, lineHeight: 1, fontWeight: active ? 600 : 400 }}>
              {translate(t.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
