import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { disconnectBrokerage, reasonOf } from '../data/snaptradeAccount';

/**
 * Confirmation before a brokerage connection is removed.
 *
 * SnapTrade's own documentation is the reason this is a two-step: removing a
 * connection "will also remove the accounts and holdings data associated
 * with the connection", and "this action is irreversible". Reconnecting is
 * possible, but what was there is gone — so the copy says that rather than
 * asking a vague "are you sure".
 *
 * The removal is asynchronous at SnapTrade, so success here means accepted,
 * not finished. `onDone` re-reads the account list instead of the screen
 * asserting the connection has already vanished.
 */
export function DisconnectBrokerageSheet({
  open,
  onClose,
  onDone,
  connection,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  connection: { id: string; brokerage: string };
}>) {
  const t = useT();
  const { language } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await disconnectBrokerage(connection.id);
    setBusy(false);
    if (result.status !== 'ok') {
      // Shown here rather than as a toast: the sheet stays open so the person
      // can retry, and a dismissed sheet with an unexplained live connection
      // would read as the removal having worked.
      setError(reasonOf(result));
      return;
    }
    onDone();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('conn.disconnectTitle', { broker: connection.brokerage })}>
      <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.55 }}>
        {t('conn.disconnectWarn')}
      </p>
      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-row)' }}>{t('conn.disconnectFailed')}</span>
          <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
            {error[language]}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="danger" block minHeight={46} onClick={confirm} disabled={busy}>
          {busy ? t('conn.disconnecting') : t('conn.disconnectConfirm')}
        </Button>
        <Button variant="ghost" block onClick={onClose} disabled={busy}>
          {t('set.deleteCancel')}
        </Button>
      </div>
    </Sheet>
  );
}
