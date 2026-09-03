import { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Num } from '../components/Num';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { buildPositions } from '../lib/positions';
import { useAppState, type ManualTransaction, type TransactionSide } from '../state/appState';
import { ledgerWithout, validateTx, type TxProblem } from '../state/ledger';
import { useLedger } from '../state/useLedgerSync';

/**
 * Manual-transaction sheet — exists only for theoretical portfolios; nothing
 * is ordered anywhere.
 *
 * It opens empty. The fields used to be prefilled with demo values ('NVDA',
 * '10', '182.44', a fixed August date) and the sheet never reset between
 * openings because it stays mounted, so the second trade anyone logged
 * arrived pre-filled with the first one's numbers — in a form whose whole
 * purpose is recording what they actually paid.
 *
 * `editing` turns the same form into a correction of a row already recorded.
 * The alternative — delete the row and type it again — is what the app used
 * to require, and it loses everything about the trade to fix one digit of its
 * price.
 *
 * `preset` opens the form already filled for a NEW row — the "close this
 * position" action on a holding hands over a sell of every share held, at the
 * price the row was just valued at. Nothing is recorded until the reader
 * confirms; a preset is a suggestion in editable fields, not a trade.
 */
export interface TxPreset {
  side: TransactionSide;
  ticker: string;
  shares: number;
  /** Null when the position could not be priced; the field then opens empty. */
  price: number | null;
}

export function TxSheet({
  open,
  onClose,
  pfId,
  pfName,
  editing = null,
  preset = null,
}: {
  open: boolean;
  onClose: () => void;
  pfId: string;
  pfName: string;
  /** The transaction being corrected, or null to record a new one. */
  editing?: ManualTransaction | null;
  /** Fields to open a new row with. Ignored while `editing` is set. */
  preset?: TxPreset | null;
}) {
  const { mode, language } = useTheme();
  const t = useT();
  const s = useAppState();
  const ledger = useLedger();
  const toast = useToast();
  const [side, setSide] = useState<TransactionSide>('buy');
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [touched, setTouched] = useState(false);

  // Reset on OPEN, not on close: Sheet stays mounted through its exit
  // animation, so clearing on close would blank the fields while the user can
  // still see them.
  useEffect(() => {
    if (!open) return;
    const fill = editing ?? preset;
    setSide(fill?.side ?? 'buy');
    setTicker(fill?.ticker ?? '');
    setShares(fill ? String(fill.shares) : '');
    // A preset price is rounded to cents: a live quote can carry more
    // decimals than anyone paid, and the field is what will be recorded.
    setPrice(editing ? String(editing.price) : preset?.price != null ? preset.price.toFixed(2) : '');
    setDate(editing?.date ?? todayLocal());
    setTouched(false);
    // `editing` and `preset` belong in the deps beside `open`: the sheet
    // stays mounted, so opening it on a different row without this would
    // show the previous row's numbers under the new row's title.
  }, [open, editing, preset]);

  const today = todayLocal();
  const symbol = ticker.trim().toUpperCase();
  // What this portfolio holds of this ticker right now — positive for a
  // long, negative for a short — so the sheet can say what this trade does
  // to it. The row being edited is excluded from the fold: counting it would
  // measure the holding against a version of itself that is being replaced.
  const ledgerRows = ledgerWithout(s.manualTransactions[pfId] ?? [], editing?.id);
  const held = buildPositions(ledgerRows).find((p) => p.ticker === symbol)?.shares ?? 0;

  const draft = { side, ticker: symbol, shares, price, date };
  const problems = validateTx(draft, today);
  const sh = Number(shares) || 0;
  const px = Number(price.replace(/[^0-9.]/g, '')) || 0;

  // Not a refusal — a description. A sell of more than is held opens a
  // short for the excess, and a buy against a short covers it; both are
  // ordinary positions to the fold, and the reader is told which they are
  // recording before they confirm it.
  const opensShort = side === 'sell' && sh > Math.max(held, 0) ? sh - Math.max(held, 0) : 0;
  const covers = side === 'buy' && held < 0 ? Math.min(sh, -held) : 0;

  const submit = () => {
    setTouched(true);
    if (problems.length > 0) return;
    // Through the ledger, so it reaches the outbox and survives a reload even
    // with no network — rather than into the reducer, which is now a view of
    // the ledger rather than the place it lives.
    const row = { side, ticker: symbol, shares: sh, price: px, date };
    if (editing) {
      ledger.replaceTransaction(pfId, editing.id, row);
      toast(t('tx.updated', { ticker: symbol }));
    } else {
      ledger.addTransaction(pfId, row);
      toast(t('tx.saved', { ticker: symbol }));
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(editing ? 'tx.editTitle' : 'tx.title')}
      meta={pfName}
      maxHeight="84%"
    >
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
        placeholder={t('tx.symbolPlaceholder')}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
      />
      <div style={{ display: 'flex', gap: 9 }}>
        <Field
          label={t('tx.shares')}
          value={shares}
          inputMode="decimal"
          placeholder="0"
          onChange={(e) => setShares(e.target.value)}
        />
        <Field
          label={t('tx.price')}
          value={price}
          inputMode="decimal"
          placeholder="0.00"
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      {/* max = today. A trade cannot have happened tomorrow, and the browser
          enforcing it means the SQL check never has to refuse a date the
          sheet already accepted. */}
      <Field
        label={t('tx.date')}
        type="date"
        value={date}
        max={today}
        onChange={(e) => setDate(e.target.value)}
      />

      {/* Only after a save attempt. Complaining about an empty required field
          the moment the sheet opens is telling someone off for not having
          typed yet. */}
      {touched && problems.length > 0 && (
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--down)', margin: 0, lineHeight: 1.45 }}>
          {t(problemKey(problems[0]))}
        </p>
      )}
      {opensShort > 0 && (
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.45 }}>
          {t('tx.opensShort', { n: opensShort, ticker: symbol })}
        </p>
      )}
      {covers > 0 && (
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.45 }}>
          {t('tx.coversShort', { n: covers, ticker: symbol })}
        </p>
      )}

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
          {verb(side, language)} <Num>{`${sh} × ${symbol || '—'}`}</Num> <Num>{`@ $${px.toFixed(2)}`}</Num>
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
      <Button block minHeight={44} onClick={submit} disabled={problems.length > 0}>
        {t('pf.addToPf')}
      </Button>
    </Sheet>
  );
}

/**
 * Today, in the viewer's own timezone.
 *
 * 'en-CA' because it formats as YYYY-MM-DD, which is what a date input takes.
 * NOT toISOString(), which is UTC: for an Israeli user before about 02:00 it
 * returns yesterday, so the app would default a trade to the wrong day for
 * everyone east of UTC in the small hours.
 */
export function todayLocal(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA');
}

/** Which complaint to show. One at a time, in the order the fields appear. */
function problemKey(problem: TxProblem): 'tx.badTicker' | 'tx.badShares' | 'tx.badPrice' | 'tx.badDate' {
  switch (problem) {
    case 'ticker':
      return 'tx.badTicker';
    case 'shares':
      return 'tx.badShares';
    case 'price':
      return 'tx.badPrice';
    default:
      return 'tx.badDate';
  }
}

function verb(side: TransactionSide, language: 'en' | 'he'): string {
  if (language === 'he') return side === 'sell' ? 'מכירת' : side === 'div' ? 'דיבידנד על' : 'קניית';
  return side === 'sell' ? 'Sell' : side === 'div' ? 'Dividend on' : 'Buy';
}
