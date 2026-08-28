import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToasts, type ToastItem } from '../lib/ToastProvider';
import { Icon } from './Icon';
import { SHELL_ID } from './Sheet';

const TONE_COLOR: Record<ToastItem['tone'], string> = {
  accent: 'var(--color-accent)',
  up: 'var(--up)',
  down: 'var(--down)',
};

/**
 * Small iOS-style confirmation pills — "Added to watchlist", "Alert
 * created" — that appear under the header and clear themselves. Portals
 * into the shell for the same reason Sheet does: escaping the screen's own
 * stacking context so a toast still shows over an open sheet.
 */
export function ToastHost() {
  const toasts = useToasts();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(SHELL_ID)), []);
  if (toasts.length === 0) return null;
  const list = (
    <div
      style={{
        position: 'absolute',
        top: 'calc(10px + env(safe-area-inset-top))',
        insetInline: 0,
        zIndex: 95,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
  return host ? createPortal(list, host) : list;
}

function Toast({ toast }: { toast: ToastItem }) {
  return (
    <div
      className="glass-bar elev-md"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '9px 16px 9px 10px',
        borderRadius: 999,
        maxWidth: '86%',
        animation: 'toastIn .38s cubic-bezier(.34, 1.56, .64, 1) both, toastOut .22s ease 2.18s both',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          borderRadius: '50%',
          background: TONE_COLOR[toast.tone],
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={toast.icon} size={13} strokeWidth={2.4} color="#fff" />
      </span>
      <span style={{ fontSize: 19, fontWeight: 500, whiteSpace: 'nowrap' }}>{toast.message}</span>
    </div>
  );
}
