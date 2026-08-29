import { Num } from './Num';

export interface Metric {
  label: string;
  value: string;
  color?: string;
}

/** Divider-gridded metric tiles (advanced home, day/month/year strips). */
export function MetricStrip({ metrics, columns = 3 }: { metrics: Metric[]; columns?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 1,
        background: 'var(--color-divider)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {metrics.map((m, i) => (
        <div key={i} style={{ background: 'var(--color-surface)', padding: '8px 9px' }}>
          <div
            className="text-muted"
            style={{ fontSize: 'var(--text-caption)', letterSpacing: '.06em', textTransform: 'uppercase' }}
          >
            {m.label}
          </div>
          <Num size={18} style={{ color: m.color ?? 'inherit' }}>
            {m.value}
          </Num>
        </div>
      ))}
    </div>
  );
}
