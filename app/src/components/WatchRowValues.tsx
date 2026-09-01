import { RowValues } from './ListRow';
import { moneyOrDash, pct, signalColor } from '../lib/format';
import type { WatchRow } from '../data/types';

/**
 * Displays a watchlist row's price and daily percentage change.
 *
 * Missing prices are displayed as a dash, and missing percentage changes are
 * displayed as an em dash without applying a change color.
 *
 * @param row - The watchlist row whose quote values are displayed
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
