import { useEffect, useState } from 'react';
import { alpacaLiveFeed, fetchLastTrades, type ConnectionStatus } from './alpacaLive';
import { useTickerSubscription } from './useTickerSubscription';

/**
 * Latest known price per ticker, for display.
 *
 * Two sources feed this, and the difference matters to the caller:
 *  - a REST snapshot fetched once per ticker set, giving the LAST trade
 *    Alpaca saw (possibly days ago, over a closed weekend), so there is a
 *    number on screen immediately instead of a blank wait; and
 *  - the live WebSocket stream, which overwrites it on every new print.
 *
 * `isLive` says which one the current price came from, so the UI can label
 * a weekend-stale close as a last trade rather than passing it off as live.
 * A ticker with neither is simply absent from `prices` — never zero-filled.
 */
export function useLiveQuotes(tickers: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [liveTickers, setLiveTickers] = useState<Record<string, true>>({});
  const [status, setStatus] = useState<ConnectionStatus>(alpacaLiveFeed.getStatus());
  const key = useTickerSubscription(tickers);

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) return;
    let alive = true;
    void fetchLastTrades(list).then((snapshot) => {
      if (!alive) return;
      setPrices((prev) => {
        // Never clobber a live print that landed while this was in flight —
        // the snapshot is by definition the older of the two.
        const next = { ...prev };
        for (const [ticker, price] of Object.entries(snapshot)) {
          if (next[ticker] == null) next[ticker] = price;
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  useEffect(
    () =>
      alpacaLiveFeed.onTrade((trade) => {
        setPrices((prev) => (prev[trade.ticker] === trade.price ? prev : { ...prev, [trade.ticker]: trade.price }));
        setLiveTickers((prev) => (prev[trade.ticker] ? prev : { ...prev, [trade.ticker]: true }));
      }),
    [],
  );

  useEffect(() => alpacaLiveFeed.onStatus(setStatus), []);

  return { prices, status, isLive: (ticker: string) => liveTickers[ticker] === true };
}
