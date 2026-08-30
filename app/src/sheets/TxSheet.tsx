import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useDispatch, type TransactionSide } from '../state/appState';

/** Manual-transaction sheet — exists only for theoretical portfolios; nothing
 *  is ordered anywhere. */
export function TxSheet({
  open,
  onClose,
  pfId,
  pfName,
}: {
  open: boolean;
  onClose: () => void;
  pfId: string;
  pfName: string;
}) {
  const { mode, language } = useTheme();
  const t = useT();
  const dispatch = useDispatch();
  const [side, setSide] = useState<TransactionSide>('buy');
  const [ticker, setTicker] = useState('NVDA');
  const [shares, setShares] = useState('10');
  const [price, setPrice] = useState('182.44');
  const [date, setDate] = useState('2026-08-24');
  const sh = parseFloat(shares) || 0;
  const px = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
  const verb =
    language === 'he'
      ? side === 'sell'
        ? 'מכירת'
        : side === 'div'
          ? 'דיבידנד על'
          : 'קניית'
      : side === 'sell'
        ? 'Sell'
        : side === 'div'
          ? 'Dividend on'
          : 'Buy';

  const submit = () => {
    dispatch({
      type: 'addManualTransaction',
      portfolioId: pfId,
      transaction: {
        id: `tx-${Date.now()}`,
        side,
        ticker: ticker.trim().toUpperCase(),
        shares: sh,
        price: px,
        date,
      },
    });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('tx.title')} meta={pfName} maxHeight="84%">
      <SegmentedControl
        options={[
          { value: 'buy', label: t('tx.buy') },
          { value: 'sell', label: t('tx.sell') },
          { value: 'div', label: t('tx.div') },
        ]}
        value={side}
        onChange={setSide}
        fontSize={16}
      />
      <Field
        label={t('tx.symbol')}
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
      />
      <div style={{ display: 'flex', gap: 9 }}>
        <Field label={t('tx.shares')} value={shares} onChange={(e) => setShares(e.target.value)} />
        <Field label={t('tx.price')} value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <Field label={t('tx.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--sunk)',
        }}
      >
        <span className="text-muted" style={{ fontSize: 'var(--text-body)', flex: 1 }}>
          {verb} <Num>{`${sh} × ${ticker}`}</Num> <Num>{`@ $${px.toFixed(2)}`}</Num>
        </span>
        <Num size={20}>
          {(side === 'sell' ? '+' : '−') +
            '$' +
            (sh * px).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Num>
      </div>
      {mode === 'beginner' && (
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
          {t('pf.theoretical')}
        </p>
      )}
      <Button block minHeight={44} onClick={submit} disabled={!ticker.trim() || sh <= 0 || px <= 0}>
        {t('pf.addToPf')}
      </Button>
    </Sheet>
  );
}
