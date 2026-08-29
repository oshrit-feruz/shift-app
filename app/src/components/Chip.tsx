import type { ReactNode } from 'react';

/** Filter chip / pill — the app's one selectable-chip treatment. */
export function Chip({
  children,
  active = false,
  onClick,
  big = false,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: big ? '7px 13px' : '6px 12px',
        borderRadius: 999,
        font: 'inherit',
        fontSize: 'var(--text-body)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-divider)'}`,
        background: active ? 'var(--fill-selected)' : 'transparent',
        color: active ? 'var(--color-accent-300)' : 'inherit',
      }}
    >
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
