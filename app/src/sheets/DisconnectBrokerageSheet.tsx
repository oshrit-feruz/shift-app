import { ConfirmDangerSheet } from './ConfirmDangerSheet';
import { disconnectBrokerage } from '../data/snaptradeAccount';
import { resetConnectedAccountCache } from '../data/appService';
import { useT } from '../i18n/useT';

/**
 * Confirmation for revoking a brokerage connection.
 *
 * The copy states what actually happens — the connection is revoked at the
 * brokerage as well as here, and the stored access is deleted — rather than a
 * vague "are you sure", because "disconnect" could otherwise be read as merely
 * hiding the account.
 *
 * On success the cached answer is dropped and the link state flips inside
 * disconnectBrokerage(), so every screen shaped around a real account returns
 * to the app's own data in the same tick and the sheet closes over a screen
 * that has already updated. On a failure the connection is left exactly as it
 * was and the shared sheet keeps it open with the reason.
 */
export function DisconnectBrokerageSheet({
  open,
  onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  const t = useT();

  return (
    <ConfirmDangerSheet
      open={open}
      onClose={onClose}
      closeOnSuccess
      title={t('link.disconnectTitle')}
      warning={t('link.disconnectWarn')}
      confirmLabel={t('link.disconnectConfirm')}
      busyLabel={t('link.disconnecting')}
      cancelLabel={t('link.disconnectCancel')}
      errorTitle={t('link.disconnectFailedTitle')}
      onConfirm={async () => {
        const result = await disconnectBrokerage();
        if (result.status !== 'ok') {
          return { ok: false, reason: result.status === 'unavailable' ? (result.reason ?? null) : null };
        }
        resetConnectedAccountCache();
        return { ok: true };
      }}
    />
  );
}
