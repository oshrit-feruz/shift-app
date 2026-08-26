import type { ReactNode } from 'react';

/**
 * The generic tappable list row: optional leading tile, title + subtitle,
 * optional right-aligned value pair, divider on top. Used by watchlist rows,
 * holdings, search results, menu rows — never re-implemented inline.
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
  padding = '8px 0',
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  minHeight?: number;
  divider?: boolean;
  padding?: string;
}) {
  const inner = (
    <>
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{title}</span>
        {subtitle != null && (
          <span
            className="text-muted"
            style={{
              display: 'block',
              fontSize: 13,
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
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight,
    padding,
    borderTop: divider ? '1px solid var(--color-divider)' : undefined,
  } as const;
  if (onClick) {
    // `borderTop` is pulled out of the spread on purpose. A re-assignment
    // cannot reorder a key that the spread already introduced, so writing
    // `...style, border: 0, borderTop: style.borderTop` left borderTop at its
    // original (earlier) position and `border: 0` won — every clickable row
    // silently lost its divider. Destructured out, it lands after the reset.
    const { borderTop, ...base } = style;
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          ...base,
          background: 'transparent',
          border: 0,
          borderTop,
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
      <span data-num="" style={{ display: 'block', fontSize: 14 }}>
        {main}
      </span>
      {sub != null && (
        <span data-num="" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: subColor }}>
          {sub}
        </span>
      )}
    </>
  );
}
