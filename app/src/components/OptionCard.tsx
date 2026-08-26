import type { ReactNode } from 'react';

/**
 * The selectable option card — mode pickers, alert types, account kinds.
 * One treatment everywhere: accent border + accent tint when active,
 * divider border otherwise. Never hand-roll this in a screen.
 */
export function OptionCard({
  active,
  onClick,
  children,
  padding = 12,
  minHeight,
  filled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  padding?: number | string;
  minHeight?: number;
  /** true: rests on the card surface when idle (full-page pickers). */
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'start',
        padding,
        minHeight,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-divider)'}`,
        background: active
          ? 'var(--color-accent-tint)'
          : filled
            ? 'var(--color-surface)'
            : 'transparent',
      }}
    >
      {children}
    </button>
  );
}
