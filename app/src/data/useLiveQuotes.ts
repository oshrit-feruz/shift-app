import { useEffect, useState } from 'react';
import { alpacaLiveFeed, type ConnectionStatus } from './alpacaLive';

/**
 * Subscribes to Alpaca's live IEX trade stream for a set of tickers for as
 * long as this hook is mounted, and returns the latest price seen for each.
 * Subscriptions are shared across every caller via alpacaLiveFeed, so two
 * components watching the same ticker do not open two connections.
 */
export function useLiveQuotes(tickers: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<ConnectionStatus>(alpacaLiveFeed.getStatus());
  // Stable key so the subscribe effect only re-runs when the actual set of
  // tickers changes, not on every render of a caller that recomputes the
  // array inline.
  const key = [...new Set(tickers)].sort().join(',');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    list.forEach((t) => alpacaLiveFeed.subscribe(t));
    return () => list.forEach((t) => alpacaLiveFeed.unsubscribe(t));
  }, [key]);

  useEffect(
    () =>
      alpacaLiveFeed.onTrade((trade) => {
        setPrices((prev) => (prev[trade.ticker] === trade.price ? prev : { ...prev, [trade.ticker]: trade.price }));
      }),
    [],
  );

  useEffect(() => alpacaLiveFeed.onStatus(setStatus), []);

  return { prices, status };
}
