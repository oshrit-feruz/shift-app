import type { ReactNode } from 'react';
import type { Loadable } from '../data/types';
import { useT } from '../i18n/useT';
import { Button } from './Button';

/**
 * Honest-state wrapper: renders loading and unavailable states for a Loadable,
 * and delegates to children only when real data exists. Screens must route
 * every Loadable through this (or EmptyState for ok-but-empty lists) — never
 * substitute placeholder numbers.
 */
export function DataState<T>({
  state,
  onRetry,
  children,
}: {
  state: Loadable<T>;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  if (state.status === 'loading') {
    return (
      <div
        role="status"
        className="text-muted"
        style={{ textAlign: 'center', padding: '16px 0', fontSize: 'var(--fs-sm)' }}
      >
        {t('data.loading')}
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div style={{ textAlign: 'center', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 'var(--fs-md)' }}>{t('data.unavailable')}</span>
        <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
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
    <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 'var(--fs-md)' }}>{children}</div>
  );
}
