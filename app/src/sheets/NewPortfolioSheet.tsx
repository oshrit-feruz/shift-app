import { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useLedger } from '../state/useLedgerSync';
import { useT } from '../i18n/useT';

/**
 * New theoretical portfolio — no broker behind it.
 *
 * It opens empty. The name used to be prefilled with a sample ("Dividend
 * income") and the sheet carried a starting-cash field; both are gone. The
 * cash figure fed nothing — a portfolio's worth is its positions valued at
 * live prices, and a number collected, stored and never used is a number a
 * reader assumes is doing something.
 */
export function NewPortfolioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const ledger = useLedger();
  const [name, setName] = useState('');

  // Cleared on OPEN, not on close: Sheet stays mounted through its exit
  // animation, so clearing on close would wipe the field while the user can
  // still see it. Same reasoning as AlertSheet's picker reset.
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Through the ledger, not straight into the reducer: the row has to reach
    // the outbox so it survives a reload and reaches the server. The reducer
    // is now a view of the ledger rather than the place it lives.
    ledger.addPortfolio(trimmed);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('pf.newPf')}>
      <Field
        label={t('pf.name')}
        value={name}
        placeholder={t('pf.namePlaceholder')}
        onChange={(e) => setName(e.target.value)}
      />
      <Button block minHeight={44} onClick={submit} disabled={!name.trim()}>
        {t('pf.createPf')}
      </Button>
    </Sheet>
  );
}
