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
        <span style={{ display: 'block', fontSize: 18, fontWeight: 600 }}>{title}</span>
        {subtitle != null && (
          <span
            className="text-muted"
            style={{
              display: 'block',
              fontSize: 16,
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
  // A skeleton row and the real row that replaces it are different elements
  // (different content, sometimes a different tag), so React unmounts one and
  // mounts the other rather than patching in place — the swap is a hard cut
  // with no transition to hook into. Fading every row in on mount (opacity
  // only — the class list rows already use at screen level) turns that cut
  // into a settle: skeleton rows fade in while loading, real rows fade in
  // over the same rows once data lands, instead of the flash of gray bars
  // becoming ticker data. A row that survives a re-render (price ticking,
  // same key, same element) keeps its DOM node, so the animation doesn't
  // replay — this only fires on the swap.
  const anim = 'anim-fade-up';
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
        className={anim}
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
  return (
    <div className={anim} style={style}>
      {inner}
    </div>
  );
}

/** Right-side value pair (main value over signed sub-value) for ListRow. */
export function RowValues({ main, sub, subColor }: { main: ReactNode; sub?: ReactNode; subColor?: string }) {
  return (
    <>
      <span data-num="" style={{ display: 'block', fontSize: 17 }}>
        {main}
      </span>
      {sub != null && (
        <span data-num="" style={{ display: 'block', fontSize: 15.5, fontWeight: 600, color: subColor }}>
          {sub}
        </span>
      )}
    </>
  );
}
