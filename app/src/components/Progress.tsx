import { Num } from './Num';

/** Pill dots — current step wide + accent, done dim, rest line. */
export function ProgressDots({ total, current, done }: { total: number; current: number; done?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 18 : 6,
            height: 6,
            borderRadius: 4,
            background:
              i === current
                ? 'var(--color-accent)'
                : i <= (done ?? current - 1)
                  ? 'var(--acc-dim)'
                  : 'var(--line)',
          }}
        />
      ))}
    </div>
  );
}

/** Flex segment bar — segments up to `current` filled (open-account guide). */
export function SegmentDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            height: 4,
            borderRadius: 3,
            flex: i === current ? 2 : 1,
            background: i <= current ? 'var(--color-accent)' : 'var(--line)',
          }}
        />
      ))}
    </div>
  );
}

/** Thin progress track with a percentage fill and an optional trailing label. */
export function ProgressTrack({ pct, label }: { pct: number; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          flex: 1,
          height: 4,
          borderRadius: 3,
          background: 'var(--line)',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        <span
          style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--color-accent)' }}
        />
      </span>
      {label != null && (
        <Num size={12.5} style={{ color: 'var(--muted)' }}>
          {label}
        </Num>
      )}
    </div>
  );
}
