import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success';

/** The app's button. 'success' is the green "Done" variant (distinct from
 *  Continue buttons, per design review). */
export function Button({
  href,
  children,
  variant = 'primary',
  block = false,
  minHeight,
  fontSize,
  onClick,
  disabled,
  style,
  alignSelf,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  block?: boolean;
  minHeight?: number;
  fontSize?: number;
  onClick?: MouseEventHandler;
  disabled?: boolean;
  style?: CSSProperties;
  alignSelf?: CSSProperties['alignSelf'];
  /** External referral link — renders an <a> (new tab, no referrer). */
  href?: string;
}) {
  const cls =
    variant === 'primary'
      ? 'btn btn-primary'
      : variant === 'secondary'
        ? 'btn btn-secondary'
        : variant === 'ghost'
          ? 'btn btn-ghost'
          : 'btn';
  const successStyle: CSSProperties =
    variant === 'success' ? { background: 'var(--up)', color: 'var(--color-on-accent)', fontWeight: 'var(--fw-semibold)' } : {};
  if (href) {
    return (
      <a
        className={`${cls} ${block ? 'btn-block' : ''}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ minHeight, fontSize, alignSelf, ...successStyle, ...style }}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`${cls} ${block ? 'btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{ minHeight, fontSize, alignSelf, ...successStyle, ...style }}
    >
      {children}
    </button>
  );
}
