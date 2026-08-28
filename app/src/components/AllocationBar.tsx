import type { ReactNode } from 'react';
import { Num } from './Num';

/**
 * Named allocation row: label + pct, optional fund line, filled track bar.
 * `action` rides on the fund line rather than getting a row of its own, so a
 * row with a buy hand-off is exactly as tall as one without.
 */
export function AllocationBar({
  name,
  pct,
  fund,
  amount,
  colorVar,
  action,
}: {
  name: string;
  pct: number;
  fund?: string;
  amount?: string;
  colorVar: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'baseline' }}>
        <span style={{ flex: 1 }}>{name}</span>
        {amount != null && (
          <Num size={13} style={{ color: 'var(--muted)' }}>
            {amount}
          </Num>
        )}
        <Num>{pct}%</Num>
      </div>
      {(fund != null || action != null) && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
          {fund != null && <span style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)' }}>{fund}</span>}
          {action}
        </span>
      )}
      <span style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            borderRadius: 4,
            background: colorVar,
          }}
        />
      </span>
    </div>
  );
}

/** The rotating accent palette used for allocation series. */
export const ALLOC_COLORS = [
  'var(--color-accent)',
  'var(--acc-lite)',
  'var(--acc-dim)',
  'var(--color-accent-700)',
];
