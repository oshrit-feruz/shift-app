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
  ariaLabel,
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
  /**
   * Accessible name for the row's own button, when the text inside it does
   * not say what tapping does. A transaction row reads out its ticker and
   * price either way; only this says that tapping corrects it.
   */
  ariaLabel?: string;
  minHeight?: number;
  divider?: boolean;
  padding?: string;
}) {
  // The tappable part of the row, without `trailing`: a row can carry its own
  // action buttons (add an alert, drop a stock from the watchlist), and a
  // <button> inside a <button> is invalid HTML — the browser is free to drop
  // the inner one, which is the row's whole point on the watchlist. So the
  // row's own hit area covers everything up to the trailing slot, and
  // trailing sits beside it rather than inside it.
  const body = (
    <>
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-title)', fontWeight: 600 }}>{title}</span>
        {subtitle != null && (
          <span
            className="text-muted"
            style={{
              display: 'block',
              fontSize: 'var(--text-body)',
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
  // with no transition to hook into. Fading every row in on mount turns that
  // cut into a settle: skeleton rows fade in while loading, real rows fade in
  // over the same rows once data lands, instead of the flash of gray bars
  // becoming ticker data. A row that survives a re-render (price ticking,
  // same key, same element) keeps its DOM node, so the animation doesn't
  // replay — this only fires on the swap.
  //
  // `row-in`, not the `anim-fade-up` this used to carry. That class animates
  // nothing itself; it is a selector hook whose rules reach `.card`
  // descendants only, and a row contains no card — so the fade this comment
  // describes had silently stopped playing. See the rule in base.css.
  const anim = 'row-in';
  if (onClick) {
    // `borderTop` is pulled out of the spread on purpose. A re-assignment
    // cannot reorder a key that the spread already introduced, so writing
    // `...style, border: 0, borderTop: style.borderTop` left borderTop at its
    // original (earlier) position and `border: 0` won — every clickable row
    // silently lost its divider. Destructured out, it lands after the reset.
    //
    // It is also spread conditionally rather than written as
    // `borderTop: <value or undefined>`. React treats an explicit `undefined`
    // as "clear this property", which does not mean "leave the 0 from the
    // shorthand" — it resets border-top to the UA default, and a <button>'s
    // UA default is `2px outset`. That drew a black line across the top of
    // every clickable row that had no divider of its own.
    const { borderTop, ...base } = style;
    // `tap` on the button, never on the wrapper. base.css clears the mobile
    // browsers' own grey tap overlay on every button in the app, so a control
    // that declares no press state of its own answers a tap with nothing at
    // all until the next screen renders — and rows are the most-tapped
    // control here. The wrapper is the wrong element for it: it also holds
    // the trailing +/✕ buttons, which own their own press feedback, and
    // dimming the pair together would say the whole row was pressed when only
    // one icon was.
    const button = (
      <button
        type="button"
        className={trailing == null ? `${anim} tap` : 'tap'}
        onClick={onClick}
        aria-label={ariaLabel}
        style={{
          ...base,
          // With a trailing slot the divider and the row's own padding move
          // to the wrapper, so the two sit on one line under one border.
          ...(trailing != null ? { minHeight: undefined, padding: 0 } : {}),
          background: 'transparent',
          border: 0,
          // A row with a trailing slot wears its divider on the wrapper below,
          // so the button must keep none at all.
          ...(trailing == null && borderTop ? { borderTop } : {}),
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          textAlign: 'start',
        }}
      >
        {body}
      </button>
    );
    if (trailing == null) return button;
    return (
      <div className={anim} style={style}>
        <span style={{ display: 'flex', flex: 1, minWidth: 0 }}>{button}</span>
        {trailing}
      </div>
    );
  }
  return (
    <div className={anim} style={style}>
      {body}
      {trailing}
    </div>
  );
}

/** Right-side value pair (main value over signed sub-value) for ListRow. */
export function RowValues({ main, sub, subColor }: { main: ReactNode; sub?: ReactNode; subColor?: string }) {
  return (
    <>
      <span data-num="" style={{ display: 'block', fontSize: 'var(--text-row)' }}>
        {main}
      </span>
      {sub != null && (
        <span
          data-num=""
          style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: subColor }}
        >
          {sub}
        </span>
      )}
    </>
  );
}
