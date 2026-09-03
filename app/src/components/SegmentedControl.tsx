import { useLayoutEffect, useRef, useState } from 'react';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Segmented control (Beginner/Advanced switch, reminder timing, tx sides).
 *
 * The selection is a pill that slides between the options. It used to be a
 * background painted on whichever option was active, which meant switching
 * cross-faded the old one out while the new one came up — two things
 * happening in two places, where what actually happened is one thing moving.
 *
 * Measured off the rendered option rather than computed from its index, for
 * the same reasons the tab bar measures: it survives options of unequal width,
 * and getBoundingClientRect returns physical coordinates in both writing
 * directions, so RTL needs no separate arithmetic.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fontSize = 15.5,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  fontSize?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      // Asked of the DOM rather than derived from `options`, so this closure
      // holds nothing that can go stale between the renders that re-run it.
      const el = wrap?.querySelector<HTMLElement>('[data-active="true"]');
      if (!wrap || !el) {
        setPill(null);
        return;
      }
      const w = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // getBoundingClientRect is the border box, but an absolutely positioned
      // child is placed against the padding box. `.seg` has a 1px border, so
      // without backing that out the pill sits a pixel off its own option.
      const next = {
        left: r.left - w.left - wrap.clientLeft,
        top: r.top - w.top - wrap.clientTop,
        width: r.width,
        height: r.height,
      };
      // Same rect, same object: `options` is a fresh array on most renders, so
      // an unconditional set here would re-render, re-measure and never stop.
      setPill((prev) => (sameRect(prev, next) ? prev : next));
    };
    measure();
    // The row is laid out before the interface knows its direction — see the
    // same watch in TabBar for why an attribute observer beats a rAF here.
    const dirWatch = new MutationObserver(measure);
    dirWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    // Labels reflow when the control is resized or the text size changes.
    const sizeWatch = new ResizeObserver(measure);
    if (wrapRef.current) sizeWatch.observe(wrapRef.current);
    return () => {
      dirWatch.disconnect();
      sizeWatch.disconnect();
    };
    // Keyed on the length, not the array: callers build `options` inline, so
    // the array itself is a new reference every render and depending on it
    // would tear these observers down and rebuild them every time.
  }, [value, options.length]);

  return (
    <div ref={wrapRef} className="seg" style={{ width: '100%' }}>
      {pill && (
        <span
          aria-hidden
          className="seg-pill"
          style={{
            left: 0,
            top: pill.top,
            width: pill.width,
            height: pill.height,
            transform: `translateX(${pill.left}px)`,
          }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-opt"
          data-active={o.value === value}
          style={{ fontSize }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Whether the pill already sits exactly here. Field by field, because the
 * measurement builds a fresh object every time and identity would always
 * differ — which is the loop this guard exists to stop.
 */
function sameRect(a: Rect | null, b: Rect): boolean {
  return a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
