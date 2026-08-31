/**
 * Switch toggle (settings).
 *
 * The knob slides rather than jumping between the two ends. It used to flip
 * `justify-content` from start to end, which is not an animatable property —
 * so the one control in the app whose entire job is to show a state changing
 * showed nothing changing at all.
 *
 * The travel is a transform rather than a flex or inset change, so it stays
 * on the compositor, and its direction comes from a variable in base.css so
 * the control mirrors with the interface instead of always sliding right.
 */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="switch"
      style={{
        width: 38,
        height: 22,
        flex: 'none',
        borderRadius: 12,
        border: '1px solid var(--color-divider)',
        cursor: 'pointer',
        padding: 2,
        display: 'flex',
        // The knob starts at the leading edge in both directions and is moved
        // by the transform; `flex-end` would be a second, unanimatable source
        // of truth for the same position.
        justifyContent: 'flex-start',
        background: on ? 'var(--color-accent-800)' : 'transparent',
      }}
    >
      <span
        className="switch-knob"
        style={{
          width: 16,
          height: 16,
          borderRadius: 9,
          display: 'block',
          background: on ? 'var(--color-accent-300)' : 'var(--muted)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, .35)',
        }}
      />
    </button>
  );
}
