import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useLedger } from '../state/useLedgerSync';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';

/**
 * Confirmation before a manual portfolio is deleted.
 *
 * Deleting takes the portfolio's whole transaction log with it — the
 * database cascades, and so does the reducer — and nothing brings it back.
 * So the strip's "delete" button only opens this sheet, and the copy says
 * what actually goes: the portfolio and how many recorded trades. A bare
 * "are you sure" would leave the reader guessing at exactly the fact that
 * should make them pause.
 *
 * The Sandbox is deleted through here like any other portfolio since
 * 0010_portfolio_delete.sql. It is created once per account, so the sheet
 * says so: a new portfolio can always be made, but not another Sandbox.
 */
export function DeletePortfolioSheet({
  open,
  onClose,
  portfolio,
  transactionCount,
  isSandbox,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  portfolio: { id: string; name: string };
  transactionCount: number;
  isSandbox: boolean;
}>) {
  const t = useT();
  const ledger = useLedger();
  const toast = useToast();

  const confirm = () => {
    ledger.removePortfolio(portfolio.id);
    toast(t('pf.deleted', { name: portfolio.name }));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('pf.deleteTitle', { name: portfolio.name })}>
      <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.55 }}>
        {t(transactionCount === 1 ? 'pf.deleteWarnOne' : 'pf.deleteWarnMany', { n: transactionCount })}
      </p>
      {isSandbox && (
        <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.55 }}>
          {t('pf.deleteSandboxNote')}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="danger" block minHeight={46} onClick={confirm}>
          {t('pf.deleteConfirm')}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          {t('set.deleteCancel')}
        </Button>
      </div>
    </Sheet>
  );
}
