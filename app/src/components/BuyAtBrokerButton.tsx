import { useAppState } from '../state/appState';
import { useT } from '../i18n/useT';
import { BROKER_NAMES, openTrade, resolveTrade } from '../lib/brokerLinks';

/**
 * Per-instrument hand-off to the customer's broker.
 *
 * Renders nothing when no broker is selected, and nothing when the row has no
 * ticker to trade (the global government-bond sleeve currently has no fund
 * assigned, so it correctly gets no button).
 *
 * The label always names the broker — "buy at Blink", never "buy" — because
 * Shift places no orders; this opens the broker's site and the customer acts
 * there. The button carries no order size: the amounts on these screens are a
 * simulation, and sending one into a real order ticket would turn an
 * illustration into an instruction.
 */
export function BuyAtBrokerButton({ ticker }: { ticker: string | null }) {
  const s = useAppState();
  const t = useT();
  const broker = s.advBroker;
  if (!broker || !ticker) return null;

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
      style={{
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
      }}
    >
      {t('buy.atBroker', { broker: BROKER_NAMES[broker] })}
    </button>
  );
}
