import { Num } from '../../components/Num';
import { moneyOrDash, pct, signalColor, signedMoney } from '../../lib/format';
import type { Quote } from '../../data/types';

/**
 * The headline price and the day change beside it.
 *
 * Shared by both stock pages so the two cannot drift into showing a price
 * differently. Both halves of the change come from the same live quote, so
 * the currency figure and the percentage can never describe different
 * sessions — they used to be spun off the prototype's frozen day change, the
 * percentage invented and the currency figure computed from it against a real
 * price, which made an invented number look derived from a real one.
 *
 * `quote` is null when the provider does not price this ticker, and then both
 * halves are dashes rather than zeroes.
 */
export function PriceHeader({ quote }: Readonly<{ quote: Quote | null }>) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
        <Num size={28} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
          {moneyOrDash(quote?.price)}
        </Num>
        <Num size={17} style={{ color: signalColor(quote?.changePct) }}>
          {quote === null ? '—' : `${signedMoney(quote.change)} · ${pct(quote.changePct)}`}
        </Num>
      </div>
    </div>
  );
}
