import type { ReactNode } from 'react';

export type TagVariant = 'accent' | 'neutral' | 'outline' | 'up' | 'down';

/**
 * A pill of metadata — a ticker, a tone, a state.
 *
 * `onClick` turns it into an accessible button, the same way Card does, so a
 * tappable chip is a real <button> (keyboard, focus ring, screen reader) rather
 * than a <span> with a handler bolted on. `label` is then required: the visible
 * text is a bare ticker, which reads as four letters rather than a
 * destination to anyone not looking at the screen.
 */
export function Tag({
  children,
  variant = 'neutral',
  fontSize,
  onClick,
  label,
}: {
  children: ReactNode;
  variant?: TagVariant;
  fontSize?: number;
} & ({ onClick: () => void; label: string } | { onClick?: undefined; label?: undefined })) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`tag tag-${variant}`}
        style={{
          // A button does not inherit the page font, and the .tag class sets
          // everything else — so this is the whole reset, not a restyling.
          fontFamily: 'inherit',
          fontSize,
          cursor: 'pointer',
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={`tag tag-${variant}`} style={{ fontSize }}>
      {children}
    </span>
  );
}
