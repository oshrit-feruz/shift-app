import { RowValues } from './ListRow';
import { moneyOrDash, pct, signalColor } from '../lib/format';
import type { WatchRow } from '../data/types';

/**
 * The right-hand price / day-change pair for a watchlist-style row.
 *
 * One component rather than the same four lines in the watchlist, the home
 * preview and search — the three had already drifted apart on the case that
 * matters most: a ticker with no demo day change rendered as a blank line in
 * two of them and as "—" in the third. A blank reads as "nothing to say
 * here"; the dash says "we do not have this number", which is the fact, and
 * is what the rest of the app renders for a missing figure.
 *
 * Both numbers are real and live now (data/quotes.ts). The percentage used to
 * be a demo figure carried from the design prototype — present for the ten
 * sample tickers, "—" for everything else — sitting directly under a real
 * price. It is the actual day change, and it is missing only when the whole
 * quote is: one source, so the pair can never disagree about which session it
 * is describing.
 */
export function WatchRowValues({ row }: { row: WatchRow }) {
  const change = row.quote?.changePct ?? null;
  return (
    <RowValues
      main={moneyOrDash(row.quote?.price)}
      sub={change === null ? '—' : pct(change)}
      subColor={change === null ? undefined : signalColor(change)}
    />
  );
}
