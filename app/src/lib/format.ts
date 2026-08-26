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
