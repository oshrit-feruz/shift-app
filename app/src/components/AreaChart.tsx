import { useId } from 'react';
import { areaPath, fit, linePath } from './charts';

/** Accent-gradient area chart (portfolio sparkline, beginner stock chart). */
export function AreaChart({
  values,
  width = 340,
  height = 76,
  pad = 5,
  benchmark,
}: {
  values: number[];
  width?: number;
  height?: number;
  pad?: number;
  benchmark?: number[];
}) {
  const id = useId();
  const domainValues = benchmark ? [...values, ...benchmark] : values;
  const domain = [Math.min(...domainValues), Math.max(...domainValues)] as const;
  const pts = fit(values, width, height, pad, domain);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity=".34" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, height)} fill={`url(#${id})`} />
      <path d={linePath(pts)} fill="none" stroke="var(--acc-lite)" strokeWidth="1.6" />
      {benchmark && (
        <path
          d={linePath(fit(benchmark, width, height, pad, domain))}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1.1"
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
}

/** Tiny single-line sparkline (mover cards). */
export function Sparkline({
  values,
  color,
  width = 120,
  height = 24,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: 86, height: 22, flex: 'none' }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={linePath(fit(values, width, height, 3))} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
