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
 * `price` is real (the daily mirror). The percentage under it is still a demo
 * figure for the tickers that have one, which is why every screen using this
 * carries <DemoDataNote />.
 */
export function WatchRowValues({ row }: { row: WatchRow }) {
  return (
    <RowValues
      main={moneyOrDash(row.quote?.price)}
      sub={row.demoChangePct === null ? '—' : pct(row.demoChangePct)}
      subColor={row.demoChangePct === null ? undefined : signalColor(row.demoChangePct)}
    />
  );
}
