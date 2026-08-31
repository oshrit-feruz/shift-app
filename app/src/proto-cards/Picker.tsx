import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './picker.css';

/**
 * The prototype picker — harness chrome, not a design decision. Markup,
 * styles and behaviour are the prototype skill's PICKER.md spec, expressed
 * in React: state instead of innerHTML, refs + a layout effect for the
 * highlight measurement, a key bump instead of a rAF re-render.
 */
export function Picker({
  names,
  current,
  onSelect,
  onReplay,
  position,
}: {
  names: string[];
  current: number;
  onSelect: (i: number) => void;
  onReplay?: () => void;
  position?: 'top';
}) {
  const navRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState({ left: 0, width: 0 });

  // Measure before paint so the initial position never animates in from 0.
  useLayoutEffect(() => {
    const measure = () => {
      const el = itemsRef.current[current];
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current, names.length]);

  // The slide is enabled only after first paint, so load doesn't animate.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => navRef.current?.setAttribute('data-ready', '')),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= names.length) onSelect(num - 1);
      else if (e.key === 'ArrowRight') onSelect((current + 1) % names.length);
      else if (e.key === 'ArrowLeft') onSelect((current - 1 + names.length) % names.length);
      else if (e.key === 'r' || e.key === 'R') onReplay?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, names.length, onSelect, onReplay]);

  return (
    <nav ref={navRef} className="proto-picker" aria-label="Prototype variants" data-position={position}>
      <span
        className="proto-picker-highlight"
        aria-hidden="true"
        style={{ width: box.width, transform: `translateX(${box.left}px)` }}
      />
      {names.map((name, i) => (
        <button
          key={name}
          ref={(el) => {
            itemsRef.current[i] = el;
          }}
          className="proto-picker-item"
          {...(i === current ? { 'data-active': true, 'aria-current': 'true' as const } : {})}
          onClick={() => onSelect(i)}
        >
          {name}
        </button>
      ))}
      {onReplay && (
        <>
          <span className="proto-picker-divider" aria-hidden="true" />
          <button
            className="proto-picker-item proto-picker-replay"
            aria-label="Replay animation (R)"
            onClick={onReplay}
          >
            ↻
          </button>
        </>
      )}
    </nav>
  );
}
