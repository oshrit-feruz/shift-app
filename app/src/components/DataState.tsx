import type { ReactNode } from 'react';
import type { Loadable } from '../data/types';
import { useT } from '../i18n/useT';
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
        style={{ textAlign: 'center', padding: '16px 0', fontSize: 13 }}
      >
        {t('data.loading')}
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div style={{ textAlign: 'center', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{t('data.unavailable')}</span>
        <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          {t('data.unavailableHelp')}
        </span>
        {onRetry && (
          <Button variant="ghost" onClick={onRetry} alignSelf="center" fontSize={13}>
            {t('data.retry')}
          </Button>
        )}
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/** Honest empty state for ok-but-empty lists (e.g. no open satellite positions). */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 14 }}>{children}</div>
  );
}
