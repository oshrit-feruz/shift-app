import { useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../state/appState';
import { alpacaLiveFeed } from '../data/alpacaLive';
import { didCross, sideFor, type Side } from '../lib/priceAlerts';
import { useT } from '../i18n/useT';

/**
 * Renders nothing. Mounted once in App.tsx, it watches every saved 'price'
 * alert against the live Alpaca IEX feed and, on an actual crossing (not
 * just "currently past the threshold"), records it in app state and fires a
 * browser Notification — informational only, per this app's alert contract
 * (see NotificationsSheet): never a confirm/execute action.
 *
 * Subscribes to alpacaLiveFeed.onTrade directly rather than going through
 * useLiveQuotes' "latest price per ticker" snapshot. A single WebSocket
 * frame can carry more than one trade for the same ticker, and the feed
 * delivers each to its listeners synchronously in order — if this instead
 * read a coalesced snapshot after a React re-render, a below→above→below
 * sequence arriving in one frame would collapse into just "below" and the
 * rise crossing would never be seen. Processing each trade as it streams in
 * keeps every crossing visible.
 */
export function PriceAlertWatcher() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const priceAlerts = s.savedAlerts.filter((a) => a.kind === 'price');
  const tickers = priceAlerts.map((a) => a.ticker);

  // Read inside the trade handler instead of closing over priceAlerts, so
  // the handler (registered once) always sees the current alert list
  // without needing to re-subscribe on every edit.
  const alertsRef = useRef(priceAlerts);
  alertsRef.current = priceAlerts;

  // The authoritative "which side was this alert last on" — seeded from
  // alert.lastSide (the persisted value) but updated synchronously here,
  // not via the setAlertSide dispatch below. Two trades in the same
  // WebSocket frame are handled one after another in this same function
  // call, well before a dispatched update could land back in savedAlerts;
  // relying on that persisted value between them would see the same stale
  // side twice and could miss a same-frame crossing.
  const sidesRef = useRef(new Map<string, Side>());
  const askedPermission = useRef(false);

  // Explicit comparator — see the matching note in useLiveQuotes.ts.
  const key = [...new Set(tickers)].sort((a, b) => a.localeCompare(b)).join(',');
  useEffect(() => {
    const list = key ? key.split(',') : [];
    list.forEach((ticker) => alpacaLiveFeed.subscribe(ticker));
    return () => list.forEach((ticker) => alpacaLiveFeed.unsubscribe(ticker));
  }, [key]);

  useEffect(() => {
    if (askedPermission.current || !priceAlerts.some((a) => a.notifyBy.push)) return;
    askedPermission.current = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [priceAlerts]);

  useEffect(
    () =>
      alpacaLiveFeed.onTrade((trade) => {
        for (const alert of alertsRef.current) {
          if (alert.ticker !== trade.ticker) continue;
          const threshold = Number(alert.value);
          if (!Number.isFinite(threshold)) continue;

          const prevSide = sidesRef.current.get(alert.id) ?? alert.lastSide ?? null;
          const nextSide = sideFor(trade.price, threshold);
          if (prevSide !== nextSide) {
            sidesRef.current.set(alert.id, nextSide);
            dispatch({ type: 'setAlertSide', id: alert.id, side: nextSide });
          }

          if (didCross(prevSide, nextSide, alert.condition)) {
            dispatch({
              type: 'firePriceAlert',
              alert: {
                id: `fired-${alert.id}-${trade.ts}`,
                ticker: alert.ticker,
                condition: alert.condition,
                value: alert.value,
                price: trade.price,
                ts: trade.ts,
              },
            });

            // The in-app notification-center entry above always records the
            // crossing; the OS-level push is separately opt-in per alert.
            if (
              alert.notifyBy.push &&
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              const dir = t(alert.condition === 'rise' ? 'alert.rises' : 'alert.falls');
              const notification = new Notification(`${alert.ticker} ${dir} $${alert.value}`, {
                body: t('thresh.disclaimer'),
                tag: alert.id,
              });
              // Bring the app back into view rather than leaving the fired
              // notification as a dead end with nothing to click through to.
              notification.onclick = () => window.focus();
            }
          }
        }
      }),
    [dispatch, t],
  );

  return null;
}
