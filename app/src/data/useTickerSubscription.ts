import { useEffect } from 'react';
import { alpacaLiveFeed } from './alpacaLive';

/**
 * Keeps alpacaLiveFeed subscribed to exactly `tickers` for as long as the
 * calling component is mounted.
 *
 * Shared by useLiveQuotes (which wants the coalesced latest price for
 * display) and PriceAlertWatcher (which wants the raw ordered trades), so
 * this subscribe/unsubscribe lifecycle exists in one place rather than being
 * kept in step by hand in two. The feed refcounts per ticker, so both
 * callers can hold the same symbol without either cancelling the other.
 *
 * Returns the normalised subscription key, which callers can use as an
 * effect dependency when they need to react to the ticker set changing.
 */
export function useTickerSubscription(tickers: string[]): string {
  // Stable key so the effect only re-runs when the actual set of tickers
  // changes, not on every render of a caller that rebuilds the array inline.
  //
  // Explicit comparator, not a bare .sort(): the default sort coerces to
  // string and orders by UTF-16 code unit, which is only incidentally right
  // for ticker symbols. Any deterministic total order works here — the key
  // exists solely to detect a changed *set*, not to present anything — but
  // it should say which order it means.
  const key = [...new Set(tickers)].sort((a, b) => a.localeCompare(b)).join(',');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    list.forEach((ticker) => alpacaLiveFeed.subscribe(ticker));
    return () => list.forEach((ticker) => alpacaLiveFeed.unsubscribe(ticker));
  }, [key]);

  return key;
}
