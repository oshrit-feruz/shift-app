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
    // Explicit 0 rather than undefined: a Card with onClick renders as a
    // <button>, which without this inherits the UA's default border
    // (2px outset in Chromium, a hairline on iOS). That made clickable cards
    // framed and plain ones not — the same component wearing two different
    // surfaces, and the reason a skeleton card never matched the card that
    // replaced it. The card's own outline is the 1px ring in --shadow-sm.
    border: highlight
      ? '1px solid var(--color-accent)'
      : outlined
        ? '1px solid var(--color-accent-700)'
        : 0,
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
