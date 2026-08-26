import { useAppState, useDispatch } from '../state/appState';
import { useT } from '../i18n/useT';
import { BROKER_NAMES, openTrade, resolveTrade } from '../lib/brokerLinks';

/**
 * Per-instrument hand-off to the customer's broker.
 *
 * Always visible once the row has a ticker. With no broker selected it routes
 * to broker selection instead of hiding: a button that only appears after you
 * have already connected a broker is undiscoverable by exactly the people who
 * still need to connect one.
 *
 * Renders nothing when the row has no ticker to trade — the global
 * government-bond sleeve has no fund assigned, so it correctly gets none.
 *
 * The label always names the broker — "buy at Blink", never "buy" — because
 * Shift places no orders; this opens the broker's site and the customer acts
 * there. The button carries no order size: the amounts on these screens are a
 * simulation, and sending one into a real order ticket would turn an
 * illustration into an instruction.
 */
export function BuyAtBrokerButton({ ticker }: { ticker: string | null }) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const broker = s.advBroker;
  if (!ticker) return null;

  const style = {
    flex: 'none',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--color-accent-700)',
    background: 'var(--color-accent-900)',
    color: 'var(--color-accent-200)',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as const;

  if (!broker) {
    return (
      <button
        type="button"
        className="tap"
        onClick={(e) => {
          e.stopPropagation();
          dispatch({ type: 'advGoto', screen: 'advConnect', solo: true });
        }}
        title={t('buy.connectFirstHelp')}
        style={style}
      >
        {t('buy.connectFirst')}
      </button>
    );
  }

  const { deepLinked } = resolveTrade(broker, ticker);
  return (
    <button
      type="button"
      className="tap"
      onClick={(e) => {
        e.stopPropagation();
        void openTrade(broker, ticker);
      }}
      // Without a per-symbol link the ticker is copied and the broker's own
      // site opens, so the label promises a hand-off rather than a destination.
      title={
        deepLinked
          ? t('buy.openAt', { broker: BROKER_NAMES[broker] })
          : t('buy.copyAndOpen', { broker: BROKER_NAMES[broker] })
      }
      style={style}
    >
      {t('buy.atBroker', { broker: BROKER_NAMES[broker] })}
    </button>
  );
}
