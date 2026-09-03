import { ConfirmDangerSheet } from './ConfirmDangerSheet';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/useT';

/**
 * Confirmation for permanent account deletion.
 *
 * The copy states what is actually removed rather than a vague "are you sure"
 * — the user's risk profile and progress go with the account.
 *
 * There is nothing to close on success: deleting signs the user out, the auth
 * gate swaps the shell for the sign-in screen, and this sheet unmounts with
 * it. Only the failure path stays on screen, which is why `closeOnSuccess` is
 * not set here.
 */
export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deleteAccount } = useAuth();
  const t = useT();

  return (
    <ConfirmDangerSheet
      open={open}
      onClose={onClose}
      title={t('set.deleteTitle')}
      warning={t('set.deleteWarn')}
      confirmLabel={t('set.deleteConfirm')}
      busyLabel={t('set.deleting')}
      cancelLabel={t('set.deleteCancel')}
      errorTitle={t('set.deleteFailedTitle')}
      onConfirm={async () => {
        const result = await deleteAccount();
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }}
    />
  );
}
