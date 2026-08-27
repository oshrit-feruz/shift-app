/** Number/money formatting. Rendered numerals always go through <Num> (see
 *  components/Num.tsx) so they stay LTR inside RTL text. */

export function money(v: number, fractionDigits = 2): string {
  return (
    '$' +
    v.toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  );
}

/** Signed percentage with 2 decimals: +0.86% / −1.24% */
export function pct(v: number, fractionDigits = 2): string {
  return (v >= 0 ? '+' : '') + v.toFixed(fractionDigits) + '%';
}

/** Signed absolute money change: +412.18 / -12.40 */
export function signedMoney(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

/** CSS color var for a signed value. */
export function signalColor(v: number): string {
  return v >= 0 ? 'var(--up)' : 'var(--down)';
}

/**
 * Compact money for figures too large to read digit by digit:
 * 215938000000 → "$215.9B", 5480717000 → "$5.5B", 812_000 → "$812.0K".
 *
 * Used for filed revenue, where the exact dollar is noise and the magnitude
 * is the point. Deliberately keeps one decimal at every scale so the reader
 * can tell $5.5B from $5.4B — rounding to "$5B" would throw away a
 * difference that matters at this size. Below 1,000 there is nothing to
 * compact, so the plain figure is returned with no decimals.
 */
export function compactMoney(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const neg = v < 0;
  const abs = Math.abs(v);
  // A table rather than chained ternaries: the thresholds read in order and
  // adding one is a single line.
  const SCALES: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  const [scale, suffix] = SCALES.find(([min]) => abs >= min) ?? [1, ''];
  const body = suffix === '' ? Math.round(abs).toString() : (abs / scale).toFixed(1);
  return (neg ? '−' : '') + '$' + body + suffix;
}

/**
 * A bare YYYY-MM-DD from an upstream service, rendered for display.
 *
 * Formatted in UTC on purpose: these dates carry no time zone, so parsing
 * them in the viewer's local zone would shift them a day for anyone west of
 * UTC and misreport when a filing was actually filed. Anything that is not
 * a real calendar date is returned unchanged rather than being coerced into
 * a plausible-looking one.
 */
export function isoDate(raw: string | null, locale: 'en' | 'he'): string {
  if (!raw) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return raw;
  const [, y, mo, d] = m;
  const stamped = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Round-trip guard, same reason as snapshotAgeDays: Date.UTC silently
  // rolls an impossible date forward, so "2026-02-31" would render as
  // 2 March and read as a real filing date.
  if (
    stamped.getUTCFullYear() !== Number(y) ||
    stamped.getUTCMonth() !== Number(mo) - 1 ||
    stamped.getUTCDate() !== Number(d)
  ) {
    return raw;
  }
  return stamped.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
