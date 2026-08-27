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

/**
 * Bottom tab bar — a floating blurred pill above the content.
 * It sits out of flow, so the scroll area under it carries the matching
 * bottom padding (see App.tsx) to keep the last row clear of the bar.
 */
export function TabBar({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  const translate = useT();
  return (
    <div
      style={{
        position: 'absolute',
        insetInline: 12,
        bottom: 'calc(10px + env(safe-area-inset-bottom))',
        zIndex: 50,
        padding: '6px 6px',
        borderRadius: 999,
        background: 'var(--hdr)',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
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
              borderRadius: 999,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              position: 'relative',
              transition: 'color .2s ease',
              color: active
                ? 'var(--color-accent-200)'
                : 'color-mix(in srgb, var(--color-text) 45%, transparent)',
            }}
          >
            {/* The pill sits behind the icon and fades in on the active tab.
                Background/opacity only — the bar contains no glass, but the
                app-wide rule against transforms near backdrop-filter makes an
                opacity crossfade the safer idiom to keep everywhere. */}
            <span
              aria-hidden
              style={{
                // Stretched top-to-bottom rather than given a fixed height:
                // a 30px pill covered the icon and left the label hanging
                // outside it, so the selected tab read as half-highlighted.
                position: 'absolute',
                insetInline: 6,
                top: 3,
                bottom: 3,
                borderRadius: 999,
                background: 'var(--color-accent-900)',
                opacity: active ? 1 : 0,
                transition: 'opacity .2s ease',
              }}
            />
            <span style={{ position: 'relative', display: 'flex' }}>
              <Icon name={t.icon} size={22} strokeWidth={1.7} />
            </span>
            <span
              style={{
                position: 'relative',
                fontSize: 10.5,
                lineHeight: 1,
                fontWeight: active ? 600 : 400,
              }}
            >
              {translate(t.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
