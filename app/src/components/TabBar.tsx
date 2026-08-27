import { useLayoutEffect, useRef, useState } from 'react';
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

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Bottom tab bar — a floating blurred pill above the content.
 * It sits out of flow, so the scroll area under it carries the matching
 * bottom padding (see App.tsx) to keep the last row clear of the bar.
 *
 * The active indicator hugs the icon+label content of the active tab and
 * slides to it, rather than filling the whole equal-width slot — the tab
 * slots stay flex:1 for a stable, even tap target, but the pill is measured
 * off the actual rendered content box, so a short label like "עוד" gets a
 * narrower pill than "ווטצ׳ליסט". Measuring real DOM rects (rather than
 * hand-computing offsets) is also what makes this correct under RTL for
 * free: getBoundingClientRect returns physical coordinates regardless of
 * text direction.
 */
export function TabBar({ current, onGo }: { current: Screen; onGo: (s: Screen) => void }) {
  const translate = useT();
  const barRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [indicator, setIndicator] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const bar = barRef.current;
      const idx = TABS.findIndex((x) => x.screen === current);
      // Plenty of screens are reachable without being one of the five tabs
      // (settings, connections, a stock page...). None of them should light a
      // tab up, so drop the indicator instead of leaving it parked on whichever
      // tab happened to be active last.
      if (idx === -1) {
        setIndicator(null);
        return;
      }
      const el = itemRefs.current[idx];
      if (!bar || !el) return;
      const barRect = bar.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({
        left: elRect.left - barRect.left,
        top: elRect.top - barRect.top,
        width: elRect.width,
        height: elRect.height,
      });
    };
    measure();
    // Switching language relabels the tabs *and* flips the writing direction,
    // which reverses the physical order of the row — so the active tab can end
    // up at the opposite edge of the bar. ThemeProvider writes the new `dir`
    // onto the root element from a passive effect, and a parent's passive
    // effect runs after this child's layout effect, so the synchronous pass
    // above still sees the old direction. Watching the attribute is what makes
    // the correction deterministic: the callback runs once the flip has
    // actually landed in the DOM, whereas a rAF can fire before it and
    // re-measure the stale layout.
    const dirWatch = new MutationObserver(measure);
    dirWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    // Labels can reflow on rotation or a text-size change; re-measure rather
    // than trusting a value computed for a different layout.
    window.addEventListener('resize', measure);
    return () => {
      dirWatch.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `translate` is a new reference whenever the language changes, which is
    // what re-runs this effect for the relabelled bar.
  }, [current, translate]);

  return (
    <div
      ref={barRef}
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
      {/* Painted before the buttons, so their (transparent-background)
          content naturally layers on top without needing z-index. Left/width
          animate directly (not transform): this element has no descendant
          and is not an ancestor of any glass card, so it carries none of the
          backdrop-filter-detachment risk the app-wide transform rule guards
          against (see base.css's Motion note) — a plain layout transition is
          fine here. */}
      {indicator && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: indicator.left,
            top: indicator.top,
            width: indicator.width,
            height: indicator.height,
            borderRadius: 999,
            background: 'var(--color-accent-900)',
            transition: 'left .32s cubic-bezier(.34, 1.1, .4, 1), width .32s cubic-bezier(.34, 1.1, .4, 1)',
            pointerEvents: 'none',
          }}
        />
      )}
      {TABS.map((t, i) => {
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
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 52,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <span
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '7px 13px',
                borderRadius: 999,
                transition: 'color .2s ease',
                color: active
                  ? 'var(--color-accent-200)'
                  : 'color-mix(in srgb, var(--color-text) 45%, transparent)',
              }}
            >
              <Icon name={t.icon} size={22} strokeWidth={1.7} />
              <span style={{ fontSize: 10.5, lineHeight: 1, fontWeight: active ? 600 : 400 }}>
                {translate(t.label)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
