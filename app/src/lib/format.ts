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

/**
 * A price we have, or the em-dash we owe the reader when we do not.
 *
 * Real prices come from a mirror that ranks ~100 names, so "no price for this
 * ticker" is an ordinary answer rather than a failure — and the one thing it
 * must never become is a plausible-looking number. Every render of
 * `SymbolInfo.quote.price` goes through here so that rule is applied in one
 * place instead of being remembered at eight call sites.
 */
export function moneyOrDash(v: number | null | undefined, fractionDigits = 2): string {
  return v === null || v === undefined ? '—' : money(v, fractionDigits);
}

/** Signed percentage with 2 decimals: +0.86% / −1.24% */
export function pct(v: number, fractionDigits = 2): string {
  return (v >= 0 ? '+' : '') + v.toFixed(fractionDigits) + '%';
}

/**
 * A percentage we have, or the em-dash we owe the reader when we do not.
 *
 * The companion to moneyOrDash, and needed for the same reason: a manual
 * position whose ticker the price mirror does not cover has no return, and
 * rendering that unknown as a green "+0.00%" states a measured flat result
 * where there is no measurement at all.
 */
export function pctOrDash(v: number | null | undefined, fractionDigits = 2): string {
  return v === null || v === undefined ? '—' : pct(v, fractionDigits);
}

/** Signed absolute money change: +412.18 / -12.40 */
export function signedMoney(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

/**
 * CSS color var for a signed value.
 *
 * An unknown value gets the muted colour, not the up colour: green is a claim
 * that the number is not negative, and we do not have a number to make it of.
 */
export function signalColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'var(--muted)';
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
  return (v < 0 ? '−' : '') + '$' + compactAbs(Math.abs(v));
}

/**
 * A count — traded shares, not money — at the same scale as compactMoney.
 *
 * Separate from compactMoney only because of the currency sign: "$5.5M" for a
 * share count would read as a dollar volume, which is a different figure.
 */
export function compactCount(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return (v < 0 ? '−' : '') + compactAbs(Math.abs(v));
}

/** The shared scale-and-suffix step behind both compact formatters. */
function compactAbs(abs: number): string {
  // A table rather than chained ternaries: the thresholds read in order and
  // adding one is a single line.
  const SCALES: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  let [scale, suffix] = SCALES.find(([min]) => abs >= min) ?? [1, ''];
  if (suffix !== '') {
    // Rounding can cross the boundary: 999,999 / 1e3 is 999.999, which
    // .toFixed(1) renders as "1000.0" — so the value would read "$1000.0K"
    // instead of "$1.0M". Promote to the next scale when that happens.
    const promoted = SCALES.find(([min]) => min > scale && abs * 1000 >= min * 999.95);
    if (Number((abs / scale).toFixed(1)) >= 1000 && promoted) [scale, suffix] = promoted;
  }
  return suffix === '' ? Math.round(abs).toString() : (abs / scale).toFixed(1) + suffix;
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
