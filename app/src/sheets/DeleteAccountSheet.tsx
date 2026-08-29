import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Confirmation for permanent account deletion.
 *
 * Destructive and irreversible, so it is deliberately two steps: the Settings
 * button only opens this sheet, and nothing happens until the explicit
 * confirm here. The copy states what is actually removed rather than a vague
 * "are you sure" — the user's risk profile and progress go with the account.
 *
 * On success there is nothing to close: deleting signs the user out, the auth
 * gate swaps the shell for the sign-in screen, and this sheet unmounts with
 * it. Only the failure path renders here — honestly, with the reason from the
 * auth layer, never a silent dismissal that would look like it worked.
 */
export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deleteAccount } = useAuth();
  const t = useT();
  const { language } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    // On success the tree unmounts under us; only a failure gets this far in
    // a way the user can still see.
    if (!result.ok) setError(result.reason);
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('set.deleteTitle')}>
      <p className="text-muted" style={{ margin: 0, fontSize: 16.5, lineHeight: 1.55 }}>
        {t('set.deleteWarn')}
      </p>

      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 17 }}>{t('set.deleteFailedTitle')}</span>
          <span className="text-muted" style={{ fontSize: 15.5, lineHeight: 1.5 }}>
            {error[language]}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="danger" block minHeight={46} onClick={confirm} disabled={busy}>
          {busy ? t('set.deleting') : t('set.deleteConfirm')}
        </Button>
        <Button variant="ghost" block onClick={onClose} disabled={busy}>
          {t('set.deleteCancel')}
        </Button>
      </div>
    </Sheet>
  );
}
