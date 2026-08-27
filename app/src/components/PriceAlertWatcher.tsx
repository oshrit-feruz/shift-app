import { useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../state/appState';
import { useLiveQuotes } from '../data/useLiveQuotes';
import { didCross, sideFor } from '../lib/priceAlerts';
import { useT } from '../i18n/useT';

/**
 * Renders nothing. Mounted once in App.tsx, it watches every saved 'price'
 * alert against the live Alpaca IEX feed and, on an actual crossing (not
 * just "currently past the threshold"), records it in app state and fires a
 * browser Notification — informational only, per this app's alert contract
 * (see NotificationsSheet): never a confirm/execute action.
 */
export function PriceAlertWatcher() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const priceAlerts = s.savedAlerts.filter((a) => a.kind === 'price');
  const tickers = priceAlerts.map((a) => a.ticker);
  const { prices } = useLiveQuotes(tickers);
  const askedPermission = useRef(false);

  useEffect(() => {
    if (priceAlerts.length === 0 || askedPermission.current) return;
    askedPermission.current = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [priceAlerts.length]);

  useEffect(() => {
    for (const alert of priceAlerts) {
      const price = prices[alert.ticker];
      const threshold = Number(alert.value);
      if (price == null || !Number.isFinite(threshold)) continue;

      const nextSide = sideFor(price, threshold);
      if (alert.lastSide !== nextSide) {
        dispatch({ type: 'setAlertSide', id: alert.id, side: nextSide });
      }

      if (didCross(alert.lastSide ?? null, nextSide, alert.condition)) {
        dispatch({
          type: 'firePriceAlert',
          alert: {
            id: `fired-${alert.id}-${Date.now()}`,
            ticker: alert.ticker,
            condition: alert.condition,
            value: alert.value,
            price,
            ts: Date.now(),
          },
        });

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const dir = t(alert.condition === 'rise' ? 'alert.rises' : 'alert.falls');
          new Notification(`${alert.ticker} ${dir} $${alert.value}`, {
            body: t('thresh.disclaimer'),
            tag: alert.id,
          });
        }
      }
    }
    // priceAlerts is derived from s.savedAlerts each render; re-running this
    // effect on every `prices` tick (not on priceAlerts identity, which is a
    // fresh array every render) is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  return null;
}
