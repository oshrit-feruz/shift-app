import type { ReactNode } from 'react';

/**
 * A label-and-value row separated by a top divider — the reference-table
 * shape used inside cards (filed results, the engine's ranking figures).
 *
 * Lives here rather than being repeated inside each screen so the two stay
 * visually identical and neither drifts into its own spacing. `value` is a
 * ReactNode, not a string, because some rows need more than one element:
 * a Hebrew date must render as plain text while a Latin code beside it needs
 * its own LTR isolation, and joining them into one string makes bidi reorder
 * the pair (see screens/stock/ReportsTab.tsx).
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 15.5,
        padding: '5px 0',
        borderTop: '1px solid var(--color-divider)',
      }}
    >
      <span className="text-muted">{label}</span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>{value}</span>
    </div>
  );
}
