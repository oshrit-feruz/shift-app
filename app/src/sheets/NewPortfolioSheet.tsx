import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useT } from '../i18n/useT';

/** New theoretical portfolio — no broker behind it. */
export function NewPortfolioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('pf.newPf')}>
      <Field label={t('pf.name')} defaultValue={t('pf.divIncome')} />
      <Field label={t('pf.startCash')} defaultValue="25,000" />
      <Button block minHeight={44} onClick={onClose}>
        {t('pf.createPf')}
      </Button>
    </Sheet>
  );
}
