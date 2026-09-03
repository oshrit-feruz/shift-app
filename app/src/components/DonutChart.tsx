import { Num } from './Num';
import type { AllocationSlice } from '../data/types';

/**
 * A slice's share, to at most three decimals.
 *
 * The share is a ratio of two live figures, so it arrives with fifteen
 * digits after the point ("73.1838235441772%") — none of which a reader can
 * use. Formatted through Intl rather than `toFixed` so a whole number stays
 * a whole number ("28%", not "28.000%") and only a fraction shows its
 * fraction.
 */
export function slicePct(pct: number): string {
  return `${pct.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;
}

/** Portfolio allocation donut + legend. */
export function DonutChart({ slices }: { slices: AllocationSlice[] }) {
  const C = 2 * Math.PI * 52;
  let off = 0;
  const arcs = slices.map((s) => {
    const len = (C * s.pct) / 100;
    const o = -off;
    off += len;
    return { ...s, dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`, off: o.toFixed(1) };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="112" height="112" viewBox="0 0 132 132" style={{ flex: 'none' }} aria-hidden="true">
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx="66"
            cy="66"
            r="52"
            fill="none"
            stroke={a.colorVar}
            strokeWidth="16"
            strokeDasharray={a.dash}
            strokeDashoffset={a.off}
            transform="rotate(-90 66 66)"
          />
        ))}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {arcs.map((a, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-caption)' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: a.colorVar, flex: 'none' }} />
            <span style={{ flex: 1 }}>{a.label}</span>
            <Num style={{ color: 'var(--muted)' }}>{slicePct(a.pct)}</Num>
          </div>
        ))}
      </div>
    </div>
  );
}
