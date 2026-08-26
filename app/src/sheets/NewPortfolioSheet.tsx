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
  const [name, setName] = useState('');
  const [cash, setCash] = useState('25,000');
  const startCash = parseFloat(cash.replace(/[^0-9.]/g, '')) || 0;
  return (
    <Sheet open={open} onClose={onClose} title={t('pf.newPf')}>
      <Field label={t('pf.name')} value={name} placeholder={t('pf.divIncome')} onChange={(e) => setName(e.target.value)} />
      <Field label={t('pf.startCash')} value={cash} onChange={(e) => setCash(e.target.value)} />
      <Button
        block
        minHeight={44}
        disabled={!name.trim()}
        onClick={() => {
          dispatch({ type: 'createPortfolio', name: name.trim(), startCash });
          onClose();
        }}
      >
        {t('pf.createPf')}
      </Button>
    </Sheet>
  );
}
