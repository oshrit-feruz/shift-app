import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

/**
 * The glass card — the app's one content surface. Variants:
 *  - highlight: accent border + 14%-alpha accent fill (the only "look at this"
 *    treatment in the system; at most one per screen)
 *  - outlined:  accent-700 border on the normal surface
 *  - onClick turns the card into an accessible button.
 */
export function Card({
  children,
  padding = 13,
  gap = 8,
  highlight = false,
  outlined = false,
  onClick,
  row = false,
  style,
  className = '',
}: {
  children: ReactNode;
  padding?: number | string;
  gap?: number;
  highlight?: boolean;
  outlined?: boolean;
  onClick?: MouseEventHandler;
  row?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const base: CSSProperties = {
    padding,
    gap,
    flexDirection: row ? 'row' : 'column',
    alignItems: row ? 'center' : undefined,
    // Always an explicit border, never undefined. A Card with onClick renders
    // as a <button>, which without this inherits the UA's default border
    // (2px outset in Chromium, a hairline on iOS) while a plain Card, a
    // <div>, got none — the same component wearing two surfaces depending on
    // whether it happened to be clickable, and rendering differently per
    // browser. The hairline below is that frame made deliberate: one value,
    // identical on every card, clickable or not, skeleton or loaded.
    border: highlight
      ? '1px solid var(--color-accent)'
      : outlined
        ? '1px solid var(--color-accent-700)'
        : '1px solid var(--color-divider)',
    background: highlight ? 'var(--color-accent-900)' : undefined,
    ...style,
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`card elev-sm ${className}`}
        style={{ ...base, textAlign: 'start', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={`card elev-sm ${className}`} style={base}>
      {children}
    </div>
  );
}

export function CardTitle({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <div className="card-title" style={{ fontSize: size }}>
      {children}
    </div>
  );
}

export function Divider() {
  return <span style={{ display: 'block', height: 1, background: 'var(--color-divider)' }} />;
}
