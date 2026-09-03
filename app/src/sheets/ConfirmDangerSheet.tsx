import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { ReasonNote } from '../components/ReasonNote';

/** A bilingual message, the shape every reason in the data layer carries. */
type Reason = { en: string; he: string };

export type ConfirmResult = { ok: true } | { ok: false; reason: Reason | null };

/**
 * The two-step confirmation both destructive actions in this app use:
 * deleting the account, and disconnecting a brokerage.
 *
 * TWO STEPS ON PURPOSE. The button that opens one of these does nothing on
 * its own — nothing happens until the explicit confirm inside. Both actions
 * are irreversible from the app's side, and both are the kind a stray tap
 * should not be able to complete.
 *
 * A FAILURE IS SHOWN, NEVER DISMISSED. On a failure the sheet stays open with
 * the reason the caller gave, and nothing has changed. A silent close would
 * tell someone their account was deleted, or their brokerage disconnected,
 * when neither happened — which on these two actions is the worst thing this
 * component could do.
 *
 * `closeOnSuccess` exists because the two differ in exactly one way at the
 * end: disconnecting leaves the user on a screen that has to update around
 * them, while deleting signs them out and unmounts this whole tree, so there
 * is nothing left to close.
 */
export function ConfirmDangerSheet({
  open,
  onClose,
  title,
  warning,
  confirmLabel,
  busyLabel,
  cancelLabel,
  errorTitle,
  onConfirm,
  closeOnSuccess = false,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  warning: string;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  errorTitle: string;
  onConfirm: () => Promise<ConfirmResult>;
  closeOnSuccess?: boolean;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Reason | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await onConfirm();
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    if (closeOnSuccess) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.55 }}>
        {warning}
      </p>

      <ReasonNote title={errorTitle} reason={error} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="danger" block minHeight={46} onClick={confirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button variant="ghost" block onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
      </div>
    </Sheet>
  );
}
