import type { CSSProperties, ReactNode } from 'react';

/**
 * The generic tappable list row: optional leading tile, title + subtitle,
 * optional right-aligned value pair, divider on top (or `boxed` for the
 * bordered stand-alone row). Used by watchlist rows, holdings, search
 * results, menu rows, movers — never re-implemented inline.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  right,
  trailing,
  onClick,
  minHeight = 48,
  divider = true,
  boxed = false,
  well = false,
  padding,
  titleWeight = 'var(--fw-semibold)',
  align = 'center',
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  minHeight?: number;
  divider?: boolean;
  /** Bordered, rounded stand-alone row (movers preview, option lists). */
  boxed?: boolean;
  /** Sunken fill inside a boxed row (chat answer options). */
  well?: boolean;
  padding?: string;
  titleWeight?: CSSProperties['fontWeight'];
  /** 'start' aligns columns to the top (multi-line headlines). */
  align?: 'center' | 'start';
}) {
  const inner = (
    <>
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--fs-base)', fontWeight: titleWeight }}>{title}</span>
        {subtitle != null && (
          <span
            className="text-muted"
            style={{
              display: 'block',
              fontSize: 'var(--fs-sm)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      {right != null && <span style={{ textAlign: 'end' }}>{right}</span>}
      {trailing}
    </>
  );
  const style: CSSProperties = {
    display: 'flex',
    alignItems: align === 'start' ? 'flex-start' : 'center',
    gap: 10,
    width: '100%',
    minHeight,
    padding: padding ?? (boxed ? '8px 11px' : '8px 0'),
    ...(boxed
      ? {
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-md)',
          background: well ? 'var(--sunk)' : undefined,
        }
      : { borderTop: divider ? '1px solid var(--color-divider)' : undefined }),
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          ...style,
          background: boxed && well ? 'var(--sunk)' : 'transparent',
          border: boxed ? style.border : 0,
          borderTop: style.borderTop,
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          textAlign: 'start',
        }}
      >
        {inner}
      </button>
    );
  }
  return <div style={style}>{inner}</div>;
}

/** Right-side value pair (main value over signed sub-value) for ListRow. */
export function RowValues({
  main,
  sub,
  subColor,
}: {
  main: ReactNode;
  sub?: ReactNode;
  subColor?: string;
}) {
  return (
    <>
      <span data-num="" style={{ display: 'block', fontSize: 'var(--fs-md)' }}>
        {main}
      </span>
      {sub != null && (
        <span
          data-num=""
          style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', color: subColor }}
        >
          {sub}
        </span>
      )}
    </>
  );
}
