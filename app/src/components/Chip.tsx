import type { ReactNode } from 'react';

/** Filter chip / pill — the app's one selectable-chip treatment. */
export function Chip({
  children,
  active = false,
  onClick,
  big = false,
  well = false,
}: {
  children: ReactNode;
  active?: boolean;
  /** Without onClick the chip renders as a passive <span> (status pills). */
  onClick?: () => void;
  big?: boolean;
  /** Sunken neutral fill when idle (status/stepper pills). */
  well?: boolean;
}) {
  const style = {
    padding: big ? '7px 13px' : '6px 12px',
    borderRadius: 'var(--radius-pill)',
    font: 'inherit',
    fontSize: 'var(--fs-sm)',
    whiteSpace: 'nowrap',
    cursor: onClick ? 'pointer' : undefined,
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-divider)'}`,
    background: active ? 'var(--color-accent-900)' : well ? 'var(--sunk)' : 'transparent',
    color: active ? 'var(--color-accent-300)' : 'inherit',
  } as const;
  if (!onClick) {
    return <span style={style}>{children}</span>;
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {children}
    </button>
  );
}

/** Horizontally scrollable chip rail. */
export function ChipRail({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-x" style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
      {children}
    </div>
  );
}
