import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { disconnectBrokerage } from '../data/snaptradeAccount';
import { resetConnectedAccountCache } from '../data/appService';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Confirmation for revoking a brokerage connection.
 *
 * Two steps, like account deletion, for the same reason: the button that
 * opens this sheet does nothing on its own. The copy states what actually
 * happens — the connection is revoked at the brokerage as well as here, and
 * the stored access is deleted — rather than a vague "are you sure", because
 * "disconnect" could otherwise be read as merely hiding the account.
 *
 * On success the cached answer is dropped and the link state flips inside
 * disconnectBrokerage(), so every screen shaped around a real account returns
 * to the app's own data in the same tick and this sheet closes over a
 * screen that has already updated. A failure is shown here with its reason
 * and the connection is left exactly as it was — a dismissal that looked like
 * success would tell someone their brokerage was disconnected when it is not.
 */
export function DisconnectBrokerageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { language } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await disconnectBrokerage();
    setBusy(false);
    if (result.status !== 'ok') {
      setError(result.status === 'unavailable' ? (result.reason ?? null) : null);
      return;
    }
    resetConnectedAccountCache();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('link.disconnectTitle')}>
      <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.55 }}>
        {t('link.disconnectWarn')}
      </p>

      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-row)' }}>{t('link.disconnectFailedTitle')}</span>
          <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
            {error[language]}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="danger" block minHeight={46} onClick={confirm} disabled={busy}>
          {busy ? t('link.disconnecting') : t('link.disconnectConfirm')}
        </Button>
        <Button variant="ghost" block onClick={onClose} disabled={busy}>
          {t('link.disconnectCancel')}
        </Button>
      </div>
    </Sheet>
  );
}
