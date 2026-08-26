import { Num } from './Num';

/** Named allocation row: label + pct, optional fund line, filled track bar. */
export function AllocationBar({
  name,
  pct,
  fund,
  amount,
  colorVar,
}: {
  name: string;
  pct: number;
  fund?: string;
  amount?: string;
  colorVar: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-md)', alignItems: 'baseline' }}>
        <span style={{ flex: 1 }}>{name}</span>
        {amount != null && (
          <Num size={13} style={{ color: 'var(--muted)' }}>
            {amount}
          </Num>
        )}
        <Num>{pct}%</Num>
      </div>
      {fund != null && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>{fund}</span>}
      <span style={{ height: 6, borderRadius: 'var(--radius-xs)', background: 'var(--line)', overflow: 'hidden' }}>
        <span
          style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-xs)', background: colorVar }}
        />
      </span>
    </div>
  );
}

/** Proportional multi-segment bar (analyst consensus, distributions). */
export function SegmentBar({
  segments,
  height = 6,
}: {
  segments: Array<{ value: number; colorVar: string }>;
  height?: number;
}) {
  return (
    <div style={{ display: 'flex', height, borderRadius: 'var(--radius-xs)', overflow: 'hidden', gap: 1 }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: s.value, background: s.colorVar }} />
      ))}
    </div>
  );
}

/** The rotating accent palette used for allocation series. */
export const ALLOC_COLORS = [
  'var(--color-accent)',
  'var(--acc-lite)',
  'var(--acc-dim)',
  'var(--color-accent-700)',
];
