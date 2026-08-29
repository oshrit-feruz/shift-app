import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismissAnimation } from '../lib/useDismissAnimation';

/** The phone-frame element sheets mount into (set in App.tsx). */
export const SHELL_ID = 'app-shell';

/**
 * Bottom sheet over a veil — the app's one modal treatment. Glass ground,
 * grab handle, sheetUp animation. Clicking the veil dismisses.
 *
 * Rendered through a portal into the app shell rather than in place. Sheets
 * opened from inside a screen (TxSheet, NewPortfolioSheet) sit under
 * `.anim-fade-up`, whose filling opacity animation makes it a stacking
 * context — so the sheet's z-index was scoped to that screen and the floating
 * tab bar, a positioned sibling higher up, painted over the sheet's lower
 * half. Portalling to the shell puts the sheet in the same stacking context
 * as the tab bar, where its z-index actually outranks it.
 *
 * The shell is the portal target rather than document.body so the sheet stays
 * inside the centred phone frame instead of spanning a desktop window.
 */
export function Sheet({
  open,
  onClose,
  title,
  meta,
  children,
  maxHeight = '78%',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
}) {
  // Stays mounted through the exit so closing is animated, not a cut.
  const { mounted, closing } = useDismissAnimation(open, 200);
  // Resolved after mount: on the very first render the shell is still being
  // committed, so the node does not exist yet.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(SHELL_ID)), []);
  if (!mounted) return null;
  const sheet = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'var(--veil)',
        display: 'flex',
        alignItems: 'flex-end',
        animation: closing ? 'fadeOut .2s ease both' : 'veilIn .2s ease both',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-sheet"
        style={{
          width: '100%',
          borderTop: '1px solid rgba(146,155,172,.22)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: '16px 16px 34px',
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          animation: closing
            ? 'sheetDown .2s cubic-bezier(.4, 0, 1, 1) both'
            : 'sheetUp .26s cubic-bezier(.22, .61, .36, 1) both',
          maxHeight,
          overflowY: 'auto',
        }}
      >
        <div
          style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)', alignSelf: 'center' }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div
            style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-title)', whiteSpace: 'nowrap', flex: 'none' }}
          >
            {title}
          </div>
          {meta != null && (
            <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
              {meta}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 0, fontSize: 'var(--text-title)', opacity: 0.6 }}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  // Before the host resolves, render in place rather than not at all.
  return host ? createPortal(sheet, host) : sheet;
}
