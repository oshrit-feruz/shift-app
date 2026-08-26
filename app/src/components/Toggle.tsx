/** Switch toggle (settings). */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 38,
        height: 22,
        flex: 'none',
        borderRadius: 12,
        border: '1px solid var(--color-divider)',
        cursor: 'pointer',
        padding: 2,
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        background: on ? 'var(--color-accent-800)' : 'transparent',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 9,
          display: 'block',
          background: on ? 'var(--color-accent-300)' : 'var(--muted)',
        }}
      />
    </button>
  );
}
