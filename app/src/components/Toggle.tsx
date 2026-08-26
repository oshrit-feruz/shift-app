/** Switch toggle (settings). */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 38,
        height: 22,
        flex: 'none',
        borderRadius: 'var(--radius-md)',
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
          borderRadius: 'var(--radius-sm)',
          display: 'block',
          background: on ? 'var(--color-accent-300)' : 'var(--muted)',
        }}
      />
    </button>
  );
}
