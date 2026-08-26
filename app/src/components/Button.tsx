import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

/** The app's button. 'success' is the green "Done" variant (distinct from
 *  Continue buttons, per design review); 'danger' is the outlined destructive
 *  variant, which carries its own hit area rather than reading as body copy. */
export function Button({
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
}) {
  const cls =
    variant === 'primary'
      ? 'btn btn-primary'
      : variant === 'secondary'
        ? 'btn btn-secondary'
        : variant === 'ghost'
          ? 'btn btn-ghost'
          : variant === 'danger'
            ? 'btn btn-danger'
            : 'btn';
  const successStyle: CSSProperties =
    variant === 'success' ? { background: 'var(--up)', color: '#fff', fontWeight: 600 } : {};
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
