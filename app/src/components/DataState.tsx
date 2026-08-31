import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { Loadable } from '../data/types';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

/**
 * Honest-state wrapper: renders loading and unavailable states for a Loadable,
 * and delegates to children only when real data exists. Screens must route
 * every Loadable through this (or EmptyState for ok-but-empty lists) — never
 * substitute placeholder numbers.
 *
 * Pass `skeleton` with a placeholder shaped like the real content so the swap
 * on load is in-place rather than a jump. Skeletons are decorative and
 * aria-hidden; the announcement stays on the role="status" wrapper here, which
 * carries the loading text for assistive tech either way.
 *
 * The swap itself fades. Everything above exists to stop the layout moving on
 * load, and then the content arrived in a single frame anyway — the one place
 * left where a screen still blinked. The class goes onto each top-level child
 * rather than a wrapper around them, for the same reason the loading branch
 * has no wrapper: one would become a flex item and swallow the parent's row
 * gaps, which is the layout shift this component is built to avoid.
 */
export function DataState<T>({
  state,
  onRetry,
  skeleton,
  children,
}: {
  state: Loadable<T>;
  onRetry?: () => void;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  const { language } = useTheme();
  /** Adds the entrance class to each child that can carry one. A child that
   *  is a component ignoring `className` simply arrives without the fade,
   *  which is the old behaviour and costs nothing. */
  const faded = (node: ReactNode) =>
    Children.map(node, (child) =>
      isValidElement<{ className?: string }>(child)
        ? cloneElement(child, {
            className: [child.props.className, 'anim-data-in'].filter(Boolean).join(' '),
          })
        : child,
    );
  if (state.status === 'loading') {
    if (skeleton) {
      // No wrapper element: a wrapper would collapse the skeleton into a
      // single flex item and swallow the parent's row gaps, so the layout
      // would still shift on load. The announcement rides on an out-of-flow
      // sibling instead, which costs no layout at all.
      return (
        <>
          <span role="status" className="sr-only">
            {t('data.loading')}
          </span>
          {skeleton}
        </>
      );
    }
    return (
      <div
        role="status"
        className="text-muted"
        style={{ textAlign: 'center', padding: '16px 0', fontSize: 'var(--text-body)' }}
      >
        {t('data.loading')}
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div
        style={{ textAlign: 'center', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <span style={{ fontSize: 'var(--text-row)' }}>{t('data.unavailable')}</span>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
          {/* A specific reason from the data layer beats the generic copy:
              "the snapshot is 9 days old" tells the user something true and
              actionable, where "try again later" would imply a transient
              glitch that retrying could fix. */}
          {state.reason ? state.reason[language] : t('data.unavailableHelp')}
        </span>
        {onRetry && (
          <Button variant="ghost" onClick={onRetry} alignSelf="center" fontSize={16}>
            {t('data.retry')}
          </Button>
        )}
      </div>
    );
  }
  return <>{faded(children(state.data))}</>;
}

/** Honest empty state for ok-but-empty lists (e.g. no open satellite positions). */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 'var(--text-row)' }}
    >
      {children}
    </div>
  );
}
