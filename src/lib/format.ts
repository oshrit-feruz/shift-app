export function formatILS(n: number): string {
  return '₪' + Math.round(n).toLocaleString('en-US');
}

export function formatPct(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

/** API dates are ISO (YYYY-MM-DD); the design shows DD.MM.YYYY. Falls back
 *  to the raw string rather than inventing a date. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
