import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useDispatch } from '../state/appState';
import { useT } from '../i18n/useT';

/** New theoretical portfolio — no broker behind it. */
export function NewPortfolioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const dispatch = useDispatch();
  const [name, setName] = useState(t('pf.divIncome'));
  const [startingCash, setStartingCash] = useState('25,000');

  const submit = () => {
    dispatch({
      type: 'addManualPortfolio',
      portfolio: {
        id: `manual-${Date.now()}`,
        name: name.trim(),
        startingCash: Number(startingCash.replace(/[^0-9.-]/g, '')) || 0,
      },
    });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('pf.newPf')}>
      <Field label={t('pf.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label={t('pf.startCash')}
        value={startingCash}
        onChange={(e) => setStartingCash(e.target.value)}
      />
      <Button block minHeight={44} onClick={submit} disabled={!name.trim()}>
        {t('pf.createPf')}
      </Button>
    </Sheet>
  );
}
