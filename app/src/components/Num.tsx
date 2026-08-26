import type { CSSProperties, ReactNode } from 'react';

/**
 * Numeral wrapper — every price, percentage and ticker renders through this so
 * numbers stay LTR (direction + unicode-bidi isolation) when the UI is RTL.
 */
export function Num({
  children,
  color,
  size,
  weight,
  block,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number | string;
  weight?: number;
  block?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      data-num=""
      style={{
        display: block ? 'block' : 'inline-block',
        color,
        fontSize: size,
        fontWeight: weight,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
