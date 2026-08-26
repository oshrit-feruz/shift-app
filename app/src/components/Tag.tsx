import type { ReactNode } from 'react';

export type TagVariant = 'accent' | 'neutral' | 'outline' | 'up' | 'down';

export function Tag({
  children,
  variant = 'neutral',
  fontSize,
}: {
  children: ReactNode;
  variant?: TagVariant;
  fontSize?: number;
}) {
  return (
    <span className={`tag tag-${variant}`} style={{ fontSize }}>
      {children}
    </span>
  );
}
