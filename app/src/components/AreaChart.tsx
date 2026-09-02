import { useId } from 'react';
import { fit, fitSparse, linePath, sparseAreaPath, sparseLinePath } from './charts';

/**
 * Accent-gradient area chart (portfolio value, beginner stock chart).
 *
 * `values` may carry nulls, and what happens at one is the whole reason this
 * component knows about them. A null is a point the series genuinely does not
 * have — a day a portfolio held something nobody could price — and the line
 * breaks there rather than being drawn straight across. Joining the two sides
 * would draw a calm, confident segment through the gap, which is a claim about
 * days the data has nothing to say about.
 *
 * `compare` is a second, dashed line on the same vertical scale. It is never
 * gapped, because the thing drawn against a value is arithmetic the app owns
 * rather than something it has to read from anyone.
 */
export function AreaChart({
  values,
  width = 340,
  height = 76,
  pad = 5,
  compare,
}: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  pad?: number;
  compare?: number[];
}) {
  const id = useId();
  const real = values.filter((v): v is number => v !== null);
  const domainValues = compare ? [...real, ...compare] : real;
  // Nothing priced at all means nothing to scale against; the caller decides
  // what to say instead, and this refuses to draw an empty axis.
  if (domainValues.length === 0) return null;
  const domain = [Math.min(...domainValues), Math.max(...domainValues)] as const;
  const pts = fitSparse(values, width, height, pad, domain);
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
      <path d={sparseAreaPath(pts, height)} fill={`url(#${id})`} />
      <path d={sparseLinePath(pts)} fill="none" stroke="var(--acc-lite)" strokeWidth="1.6" />
      {compare && (
        <path
          d={linePath(fitSparse(compare, width, height, pad, domain).filter((p) => p !== null))}
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
