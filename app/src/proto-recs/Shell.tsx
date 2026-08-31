import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppBackground } from '../components/AppBackground';
import { AppHeader } from '../components/AppHeader';
import { TabBar } from '../components/TabBar';
import { SHELL_ID } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { c } from './content';
import type { Screen } from '../state/appState';

/**
 * The app shell around the variant — header, the one scroll container, the
 * floating tab bar and the ground behind them, arranged exactly as App.tsx
 * arranges them.
 *
 * It is here because a home-page block cannot be judged in isolation: the
 * question is what it looks like under the greeting, above the fold, with the
 * tab bar cutting off the bottom of the screen.
 *
 * Every control in it is live. Tapping a tab the prototype does not cover
 * lands on a screen that says so and offers the way back, rather than being a
 * dead button — the same for search and notifications, which raise the app's
 * own toast.
 */
export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Screen>('home');

  // App.tsx's arrangement: the header floats over the scroll area rather than
  // taking a strip out of it, so the scroller carries its measured height as
  // top padding.
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="proto-phone" id={SHELL_ID}>
      <AppBackground />
      <div
        ref={headerRef}
        style={{ position: 'absolute', insetInline: 0, top: 0, zIndex: 40, pointerEvents: 'none' }}
      >
        <div aria-hidden className="glass-bar header-material" />
        <div style={{ position: 'relative', pointerEvents: 'auto' }}>
          <AppHeader
            kicker={t(tab === 'home' ? 'kicker.home' : 'nav.back')}
            title={tab === 'home' ? t('title.home', { name: 'נועה' }) : c('outOfScope', language)}
            unreadCount={2}
            onSearch={() => toast(c('outOfScope', language))}
            onNotifications={() => toast(c('outOfScope', language))}
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="scroll-y"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '6px 16px calc(90px + env(safe-area-inset-bottom))',
          paddingTop: headerH + 16,
        }}
      >
        {tab === 'home' ? (
          children
        ) : (
          <div
            className="anim-fade-up"
            style={{ display: 'grid', placeItems: 'center', gap: 10, paddingTop: 90, textAlign: 'center' }}
          >
            <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0 }}>
              {c('outOfScope', language)}
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTab('home')}
              style={{ fontSize: 16 }}
            >
              {c('backHome', language)}
            </button>
          </div>
        )}
      </div>
      <TabBar current={tab} onGo={setTab} />
    </div>
  );
}
