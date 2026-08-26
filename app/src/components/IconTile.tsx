import type { ReactNode } from 'react';

/**
 * The leading icon square used by list rows, track headers, alert types and
 * checklists — one component, one radius (--radius-sm per the design system
 * doc). Never hand-roll this tile in a screen.
 */
export function IconTile({
  children,
  size = 28,
  variant = 'sunk',
  circle = false,
  fontSize,
}: {
  children: ReactNode;
  size?: number;
  /** sunk: neutral well · accent: accent-800 fill · tint: 14%-alpha accent fill ·
   *  solid: full-accent fill · outline: hollow ring (undone checklist steps) */
  variant?: 'sunk' | 'accent' | 'tint' | 'solid' | 'outline';
  circle?: boolean;
  fontSize?: number | string;
}) {
  const looks = {
    sunk: { background: 'var(--sunk)', color: 'var(--color-accent-200)' },
    accent: { background: 'var(--color-accent-800)', color: 'var(--color-accent-200)' },
    tint: { background: 'var(--color-accent-900)', color: 'var(--color-accent-300)' },
    solid: { background: 'var(--color-accent)', color: 'var(--g2)' },
    outline: { border: '1px solid var(--color-divider)', color: 'inherit' },
  }[variant];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: circle ? 'var(--radius-pill)' : 'var(--radius-sm)',
        display: 'grid',
        placeItems: 'center',
        fontSize,
        ...looks,
      }}
    >
      {children}
    </span>
  );
}
